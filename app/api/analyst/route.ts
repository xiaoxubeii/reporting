import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createFundAIProviderWithOverride } from '@/lib/ai'
import { withTopicalGuardrail } from '@/lib/ai/topical-guard'
import type { Json } from '@/lib/types/database'
import { logAIUsage } from '@/lib/ai/usage'
import { buildCompanyContext, buildPortfolioContext, buildDealContext } from '@/lib/ai/context-builder'
import {
  buildAccountingContext,
  accountingAnalystGuide,
  ACCOUNTING_DOCUMENT_GUIDE,
  ACCOUNTING_DRAFTING_PROTOCOL,
  type AssistantProposal,
} from '@/lib/accounting/assistant'
import { resolveVehicle } from '@/lib/accounting/agent-tools'
import { buildAnalystTools, type StagedActionRecord } from '@/lib/ai/analyst-tools'
import type { ActionType } from '@/lib/pending-actions/types'
import { buildLpContext, LP_ANALYST_GUIDE } from '@/lib/ai/lp-fund-context'
import { buildDiligenceContext, DILIGENCE_ANALYST_GUIDE } from '@/lib/diligence/analyst-context'
import { extractText } from '@/lib/memo-agent/extract-text'
import { hasAccess, loadAccessContext } from '@/lib/access/effective'
import { rateLimit } from '@/lib/rate-limit'
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from '@/i18n/locales'
import {
  AssistantContextValidationError,
  ASSISTANT_CONTEXT_SYSTEM_POLICY,
  MAX_ANALYST_REPLY_CONTENT,
  normalizeAnalystMessages,
  prepareAnalystMessagesForRequest,
  prepareAnalystMessagesForStorage,
  toProviderMessages,
  type AnalystConversationMessage,
} from '@/lib/analyst/context-snapshot'

const RESPONSE_LANGUAGE_LABELS: Readonly<Record<Locale, string>> = Object.freeze({
  en: 'English (en)',
  'zh-CN': 'Simplified Chinese (zh-CN)',
})

// A 10 MB source document expands by roughly one third when base64 encoded. Bound the complete
// HTTP body before JSON parsing so ignored top-level fields cannot consume unbounded memory.
const MAX_ANALYST_REQUEST_BODY_BYTES = 15 * 1024 * 1024

class AnalystRequestBodyError extends Error {
  constructor(readonly status: 400 | 413) {
    super(status === 413 ? 'Request body too large' : 'Invalid JSON')
  }
}

async function readAnalystJson(req: NextRequest): Promise<unknown> {
  const contentLength = req.headers.get('content-length')
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new AnalystRequestBodyError(400)
    const declared = Number(contentLength)
    if (!Number.isSafeInteger(declared) || declared < 0) throw new AnalystRequestBodyError(400)
    if (declared > MAX_ANALYST_REQUEST_BODY_BYTES) {
      if (req.body) await req.body.cancel().catch(() => undefined)
      throw new AnalystRequestBodyError(413)
    }
  }
  if (!req.body) throw new AnalystRequestBodyError(400)

  const reader = req.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_ANALYST_REQUEST_BODY_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new AnalystRequestBodyError(413)
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    try {
      return JSON.parse(text)
    } catch {
      throw new AnalystRequestBodyError(400)
    }
  } finally {
    reader.releaseLock()
  }
}

function responseLanguageInstruction(localeInput: unknown): string {
  const fallbackLocale = isSupportedLocale(localeInput) ? localeInput : DEFAULT_LOCALE
  return `=== RESPONSE LANGUAGE ===
Answer in the language of the latest user message.
Do not infer the response language from source documents, injected business context, previous conversation memory, or earlier messages.
If the latest user message has no clear natural-language signal, answer in the validated UI fallback language: ${RESPONSE_LANGUAGE_LABELS[fallbackLocale]}.
This instruction governs only the narrative reply; preserve names, identifiers, quoted source content, and structured response contracts as provided.`
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await rateLimit({ key: `ai-analyst:${user.id}`, limit: 30, windowSeconds: 300 })
  if (limited) return limited

  let body: {
    messages?: unknown
    companyId?: string
    dealId?: string
    /** Accounting scope (portfolio_group) — set by the funds pages' vehicle selector. */
    vehicle?: string
    /** A source document to draft an entry from. Only read when accounting scope is granted. */
    document?: { name?: string; format?: string; base64?: string }
    /** Which section the user is in, for the domains that have no id of their own. */
    domain?: 'lps' | 'diligence'
    model?: { id: string; provider: string }
    conversationId?: string
    /** Untrusted UI hint. The latest user message remains authoritative for response language. */
    locale?: unknown
  }
  try {
    const parsed = await readAnalystJson(req)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    body = parsed as typeof body
  } catch (error) {
    if (error instanceof AnalystRequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  let conversationMessages: readonly AnalystConversationMessage[]
  try {
    conversationMessages = prepareAnalystMessagesForRequest(normalizeAnalystMessages(body.messages))
  } catch (error) {
    if (error instanceof AssistantContextValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }

  const latestUserMessage = [...conversationMessages].reverse().find(message => message.role === 'user')
  const hasAttachedSnapshots = Boolean(latestUserMessage?.contexts?.length)
  const hasUntrustedAttachment = hasAttachedSnapshots || Boolean(body.document?.base64)
  const explicitDraftIntent = detectExplicitDraftIntent(latestUserMessage?.content ?? '')
  const enableDraftTools = !hasUntrustedAttachment || explicitDraftIntent.actionTypes.length > 0
  const enabledDraftActions = hasUntrustedAttachment ? explicitDraftIntent.actionTypes : undefined
  const allowAccountingProposals = !hasUntrustedAttachment || explicitDraftIntent.accountingEntry

  const admin = createAdminClient()

  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'No fund found' }, { status: 404 })

  // Every domain gate below resolves through this, loaded once: the caller's role, the fund's
  // switches, and their per-user grants. It is the same context the nav, the API gate, and the
  // MCP server use, so the Analyst cannot drift into answering from data the app itself refuses.
  const access = await loadAccessContext(admin, membership.fund_id, user.id, membership.role)

  // Build a case-insensitive lookup map of company names/aliases → company IDs
  const { data: allFundCompanies } = await admin
    .from('companies')
    .select('id, name, aliases')
    .eq('fund_id', membership.fund_id)

  const companyNameLookup = new Map<string, string>()
  const companyIdToName = new Map<string, string>()
  if (allFundCompanies) {
    for (const c of allFundCompanies) {
      companyIdToName.set(c.id, c.name)
      if (c.name && c.name.length > 2) {
        companyNameLookup.set(c.name.toLowerCase(), c.id)
      }
      if (c.aliases) {
        for (const alias of c.aliases) {
          if (alias && alias.length > 2) {
            companyNameLookup.set(alias.toLowerCase(), c.id)
          }
        }
      }
    }
  }

  // Internal notes are the `relationships` domain, not `portfolio` — a member granted the
  // portfolio but denied relationships must not get the team's candid commentary through the
  // Analyst's ordinary company/portfolio answer. Resolved once and passed to every builder.
  const contextOptions = { includeTeamNotes: hasAccess(access, 'relationships', 'read', 'notes') }

  let systemPrompt: string

  if (body.dealId) {
    // Owning the fund isn't enough — the deals feature defaults to admin-only, and this path used
    // to answer for any member of the fund regardless of that setting.
    if (!hasAccess(access, 'dealflow', 'read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: dealCheck } = await admin
      .from('inbound_deals')
      .select('fund_id')
      .eq('id', body.dealId)
      .maybeSingle()
    if (!dealCheck) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ((dealCheck as { fund_id: string }).fund_id !== membership.fund_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const ctx = await buildDealContext(admin, body.dealId)
    if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    systemPrompt = ctx.systemPrompt
    systemPrompt += `\n\n=== FUND THESIS ===\n${ctx.thesisBlock}`
    systemPrompt += `\n\n=== DEAL ===\n${ctx.dealBlock}`
    if (ctx.emailBlock) systemPrompt += `\n\n=== ORIGINATING EMAIL ===\n${ctx.emailBlock}`
  } else if (body.companyId) {
    // Verify company belongs to fund
    const { data: companyCheck } = await admin
      .from('companies')
      .select('fund_id')
      .eq('id', body.companyId)
      .maybeSingle()

    if (!companyCheck) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (companyCheck.fund_id !== membership.fund_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const ctx = await buildCompanyContext(admin, body.companyId, contextOptions)
    if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    systemPrompt = ctx.systemPrompt
    systemPrompt += `\n\nYou are the Analyst for this portfolio company. Answer questions using the data provided below. Reference specific numbers and dates. Do not perform new calculations, only reference pre-computed data. You can also draft or refine company summaries when asked.\n\nKeep responses concise and analytical. Use plain text (no markdown formatting).`

    if (ctx.metricsBlock) systemPrompt += `\n\n=== QUANTITATIVE DATA ===\n${ctx.metricsBlock}`
    if (ctx.reportContentBlock) systemPrompt += `\n\n=== LATEST REPORT CONTENT ===\n${ctx.reportContentBlock}`
    if (ctx.previousSummariesBlock) systemPrompt += `\n\n=== PREVIOUS SUMMARIES ===\n${ctx.previousSummariesBlock}`
    if (ctx.documentsBlock) systemPrompt += `\n\n=== DOCUMENTS ===\n${ctx.documentsBlock}`
    if (ctx.investmentBlock) systemPrompt += `\n\n=== INVESTMENT DATA ===\n${ctx.investmentBlock}`
    if (ctx.portfolioBlock) systemPrompt += `\n\n=== PORTFOLIO PEERS (for comparison) ===\n${ctx.portfolioBlock}`
    if (ctx.teamNotesBlock) systemPrompt += `\n\n=== TEAM DISCUSSION NOTES ===\nRecent internal team notes and discussions about this company:\n${ctx.teamNotesBlock}`
  } else {
    const ctx = await buildPortfolioContext(admin, membership.fund_id, contextOptions)
    systemPrompt = ctx.systemPrompt
    if (ctx.portfolioBlock) systemPrompt += `\n\n=== PORTFOLIO DATA ===\n${ctx.portfolioBlock}`
    if (ctx.teamNotesBlock) systemPrompt += `\n\n=== TEAM DISCUSSION NOTES ===\nRecent internal team notes and discussions across the portfolio:\n${ctx.teamNotesBlock}`
    systemPrompt += `\n\nIf detailed data about a specific company is included below in a "REFERENCED COMPANY" section, use that data to answer questions about that company.`
  }

  // === Access-scoped domain context ===
  //
  // THE SECURITY BOUNDARY OF THE UNIFIED ANALYST. Access control here is what the request is
  // GIVEN, not what the prompt asks for: a user who isn't entitled to a domain never has that
  // domain's data appended — nor its capabilities, like entry drafting — so their Analyst has
  // nothing to answer from and no way to act. Never soften this into a prompt instruction.
  //
  // Every domain follows the same shape, and a new one must too:
  //   1. the scope comes from the body (`vehicle`, `domain`) — caller-controlled, proves nothing;
  //   2. entitlement is checked with hasAccess against the caller's grants, never against the body;
  //   3. only then is the block appended.

  // --- ACCOUNTING (scope: which vehicle's books) ---
  let accountingGroup: string | null = null
  if (body.vehicle) {
    if (hasAccess(access, 'accounting', 'read')) {
      // The books are a much heavier context than a portfolio answer — own rate limit, mirroring
      // the cross-company xref limit below.
      const acctLimit = await rateLimit({
        key: `ai-analyst-acct:${user.id}`,
        limit: 10,
        windowSeconds: 300,
      })
      if (acctLimit) return acctLimit

      // Read the attachment before the books: a file we can't extract is the user's problem to
      // fix and must surface as a 400, not get swallowed by the books-load catch below.
      let documentBlock = ''
      if (body.document?.base64) {
        const doc = await extractAttachment(body.document)
        if ('error' in doc) return NextResponse.json({ error: doc.error }, { status: 400 })
        documentBlock = doc.text
      }

      // Partner capital comes with the books whether we like it or not (accounting implies
      // lp_capital — see DOMAIN_META). The GP/associate entities are a real, separable choice.
      const options = { includeRelatedEntities: hasAccess(access, 'gp_economics', 'read') }

      try {
        const group = await resolveVehicle(admin, membership.fund_id, body.vehicle)
        const books = await buildAccountingContext(admin, membership.fund_id, group, options)
        systemPrompt += `\n\n=== ACCOUNTING: ${group} ===\n${accountingAnalystGuide(options)}\n\n${books}`
        if (documentBlock) {
          systemPrompt += `\n\n=== SOURCE DOCUMENT: ${body.document?.name ?? 'attachment'} ===\n${documentBlock}\n\n${ACCOUNTING_DOCUMENT_GUIDE}`
        }
        // Drafting is a WRITE. A read-only accounting grant explains the books; it doesn't hand
        // back entries to post. Without this text the model has no way to propose one.
        if (hasAccess(access, 'accounting', 'write') && allowAccountingProposals) {
          systemPrompt += `\n\n${ACCOUNTING_DRAFTING_PROTOCOL}`
        }
        accountingGroup = group
      } catch (err) {
        // An unknown/ambiguous vehicle or a books-load failure is not fatal: answer without the
        // accounting block rather than 500 the whole Analyst.
        console.error('[analyst] accounting context skipped:', err)
      }
    }
  }

  // --- LPs (scope: the whole fund) ---
  let lpScoped = false
  if (body.domain === 'lps' && hasAccess(access, 'lp_capital', 'read')) {
    // The live report derives every LP's position from the ledger — the heaviest block we build.
    const lpLimit = await rateLimit({ key: `ai-analyst-lps:${user.id}`, limit: 10, windowSeconds: 300 })
    if (lpLimit) return lpLimit

    // Scoped on entitlement, not on whether there's data: a fund with no LPs yet still gets its
    // own LP thread rather than one that quietly merges into the portfolio's.
    lpScoped = true
    try {
      const block = await buildLpContext(admin, membership.fund_id)
      if (block) systemPrompt += `\n\n=== LP CAPITAL ===\n${LP_ANALYST_GUIDE}\n\n${block}`
    } catch (err) {
      console.error('[analyst] LP context skipped:', err)
    }
  }

  // --- DILIGENCE (scope: the whole fund) ---
  let diligenceScoped = false
  if (body.domain === 'diligence' && hasAccess(access, 'diligence', 'read')) {
    diligenceScoped = true
    try {
      const block = await buildDiligenceContext(admin, membership.fund_id)
      if (block) systemPrompt += `\n\n=== DILIGENCE PIPELINE ===\n${DILIGENCE_ANALYST_GUIDE}\n\n${block}`
    } catch (err) {
      console.error('[analyst] diligence context skipped:', err)
    }
  }

  // What thread this belongs to. Company/deal already carve out their own; this separates the
  // domain threads from each other and from the portfolio one. Derived from what was GRANTED, so
  // a denied domain falls back to the portfolio thread rather than opening one it can't fill.
  const scope: string | null = accountingGroup
    ? `accounting:${accountingGroup}`
    : lpScoped
      ? 'lps'
      : diligenceScoped
        ? 'diligence'
        : null

  const conversationCompanyId = body.dealId ? null : body.companyId ?? null
  const conversationDealId = body.dealId ?? null

  // Continuing a thread must not let client-controlled IDs retarget stored history to another
  // company, deal, Fund, or granted domain. Verify the complete trusted scope before the model
  // sees any history or a write is attempted.
  if (body.conversationId) {
    const { data: existingConversation, error: existingConversationError } = await admin
      .from('analyst_conversations')
      .select('id, fund_id, user_id, company_id, deal_id, scope')
      .eq('id', body.conversationId)
      .eq('user_id', user.id)
      .eq('fund_id', membership.fund_id)
      .maybeSingle()

    if (existingConversationError) {
      return NextResponse.json({ error: 'Could not verify conversation scope.' }, { status: 500 })
    }
    if (!existingConversation) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
    }
    if (
      existingConversation.company_id !== conversationCompanyId
      || existingConversation.deal_id !== conversationDealId
      || existingConversation.scope !== scope
    ) {
      return NextResponse.json({ error: 'Conversation scope does not match the current page.' }, { status: 409 })
    }
  }

  // Dynamic context: detect company references in messages and inject their data
  const referencedCompanyIds = detectReferencedCompanies(
    conversationMessages,
    companyNameLookup,
    body.companyId ?? null
  )

  if (referencedCompanyIds.length > 0) {
    // Tighter rate limit for cross-company lookups (heavier DB load)
    const crossCompanyLimit = await rateLimit({
      key: `ai-analyst-xref:${user.id}`,
      limit: 10,
      windowSeconds: 300,
    })
    if (crossCompanyLimit) return crossCompanyLimit

    const refContexts = await Promise.all(
      referencedCompanyIds.map(id => buildCompanyContext(admin, id, contextOptions))
    )
    for (const refCtx of refContexts) {
      if (!refCtx) continue
      const name = refCtx.company.name
      let block = `\n\n=== REFERENCED COMPANY: ${name} ===\n(This data was loaded because the user mentioned this company. Use it to answer their question.)`
      if (refCtx.metricsBlock) block += `\n\nMetrics:\n${refCtx.metricsBlock}`
      if (refCtx.investmentBlock) block += `\n\nInvestment data:\n${refCtx.investmentBlock}`
      if (refCtx.reportContentBlock) block += `\n\nLatest report:\n${refCtx.reportContentBlock}`
      if (refCtx.documentsBlock) block += `\n\nDocuments:\n${refCtx.documentsBlock}`
      systemPrompt += block
    }
  }

  // Memory injection: fetch recent conversation summaries from same scope
  try {
    let memoryQuery = admin
      .from('analyst_conversations')
      .select('title, summary')
      .eq('fund_id', membership.fund_id)
      .eq('user_id', user.id)
      .not('summary', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(5)

    if (body.dealId) {
      memoryQuery = memoryQuery.eq('deal_id', body.dealId)
    } else if (body.companyId) {
      memoryQuery = memoryQuery.eq('company_id', body.companyId).is('deal_id', null)
    } else {
      // Scoped threads remember only themselves: a summary of an accounting conversation must not
      // be replayed into a portfolio one (or another vehicle's), which would put fragments of a
      // domain's data in front of a request that domain wasn't granted to.
      memoryQuery = memoryQuery.is('company_id', null).is('deal_id', null)
      memoryQuery = scope ? memoryQuery.eq('scope', scope) : memoryQuery.is('scope', null)
    }

    // Exclude current conversation from memory
    if (body.conversationId) {
      memoryQuery = memoryQuery.neq('id', body.conversationId)
    }

    const { data: pastConversations } = await memoryQuery

    if (pastConversations && pastConversations.length > 0) {
      const memoryBlock = pastConversations
        .map((c, i) => `${i + 1}. [${c.title}] ${c.summary}`)
        .join('\n')
      systemPrompt += `\n\n=== PREVIOUS CONVERSATION MEMORY ===\nRecent discussions with this user (for context continuity):\n${memoryBlock}`
    }
  } catch {
    // Non-critical — continue without memory
  }

  systemPrompt += `\n\n${responseLanguageInstruction(body.locale)}`

  // AI provider — use override if specified, otherwise fund default
  const providerOverride = body.model?.provider
  let provider: Awaited<ReturnType<typeof createFundAIProviderWithOverride>>['provider']
  let aiModel: string
  let aiProviderType: string
  try {
    const result = await createFundAIProviderWithOverride(admin, membership.fund_id, providerOverride)
    provider = result.provider
    aiModel = body.model?.id ?? result.model
    aiProviderType = result.providerType
  } catch {
    return NextResponse.json({
      error: 'AI API key not configured. Add one in Settings.',
    }, { status: 400 })
  }

  // Page snapshots remain user-provided reference material. Only the newest user turn receives
  // its active snapshots, rendered into user content after strict normalization. Provider inputs
  // contain no client metadata fields and no snapshot content enters the system instruction.
  const messages = toProviderMessages(conversationMessages)
  if (hasAttachedSnapshots) {
    systemPrompt += `\n\n${ASSISTANT_CONTEXT_SYSTEM_POLICY}`
  }

  try {
    let text: string
    let usage: { inputTokens: number; outputTokens: number }
    let toolCalls: { name: string }[] = []
    const stagedActions: StagedActionRecord[] = []

    // Run as a live tool loop when the fund's provider supports it; otherwise fall back to the
    // old single-shot context-injection chat (OpenAI/Gemini/Ollama). Tools are the access-filtered
    // read registry — scope narrows what's exposed, never widens it. Write actions are exposed as
    // DRAFTS: a call stages a pending_action for human approval, never posts.
    if (provider.supportsToolLoop && provider.createToolLoop) {
      const { tools, executeTool } = buildAnalystTools({
        admin,
        fundId: membership.fund_id,
        userId: user.id,
        access,
        vehicle: accountingGroup ?? undefined,
        enableDrafts: enableDraftTools,
        enabledDraftActions,
        createdVia: 'analyst',
        stagedActions,
      })
      const result = await provider.createToolLoop({
        model: aiModel,
        maxTokens: 2000,
        system: withTopicalGuardrail(systemPrompt),
        messages,
        tools,
        executeTool,
        maxIterations: 6,
      })
      text = result.text
      usage = result.usage
      toolCalls = result.toolCalls.map(c => ({ name: c.name }))
    } else {
      const result = await provider.createChat({
        model: aiModel,
        maxTokens: 2000,
        system: withTopicalGuardrail(systemPrompt),
        messages,
      })
      text = result.text
      usage = result.usage
    }

    logAIUsage(admin, {
      fundId: membership.fund_id,
      userId: user.id,
      provider: aiProviderType,
      model: aiModel,
      feature: 'analyst',
      usage,
    })

    // Drafted entries come back as ```proposal fences alongside the prose. Only parse them when
    // accounting scope was actually granted — otherwise the protocol was never in the prompt and
    // any fence-shaped text is just prose the model wrote.
    const { reply: unboundedReply, proposals } = accountingGroup && hasAccess(access, 'accounting', 'write') && allowAccountingProposals
      ? extractProposals(text)
      : { reply: text, proposals: [] as AssistantProposal[] }
    const reply = unboundedReply.slice(0, MAX_ANALYST_REPLY_CONTENT)

    // Persist conversation
    let conversationId = body.conversationId ?? null
    const lastUserMsg = conversationMessages[conversationMessages.length - 1]
    const allMessages = prepareAnalystMessagesForStorage([
      ...conversationMessages,
      Object.freeze({ role: 'assistant' as const, content: reply }),
    ])

    try {
      if (conversationId) {
        // Update existing conversation
        await admin
          .from('analyst_conversations')
          .update({
            messages: allMessages as unknown as Json,
            message_count: allMessages.length,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId)
          .eq('user_id', user.id)
          .eq('fund_id', membership.fund_id)
      } else {
        // Create new conversation with title from first message
        const title = (lastUserMsg?.content ?? 'New conversation').slice(0, 60)

        const { data: newConv } = await admin
          .from('analyst_conversations')
          .insert({
            fund_id: membership.fund_id,
            user_id: user.id,
            company_id: conversationCompanyId,
            deal_id: conversationDealId,
            scope,
            title,
            messages: allMessages as unknown as Json,
            message_count: allMessages.length,
          })
          .select('id')
          .single()

        if (newConv) {
          conversationId = newConv.id

          // Fire-and-forget: summarize previous unsummarized conversation
          summarizePreviousConversation(
            admin,
            provider,
            aiModel,
            membership.fund_id,
            user.id,
            conversationCompanyId,
            conversationDealId,
            scope,
            conversationId,
          ).catch(() => {})
        }
      }
    } catch {
      // Non-critical — response still succeeds
    }

    return NextResponse.json({
      reply,
      conversationId,
      proposals,
      vehicle: accountingGroup,
      scope,
      toolCalls,
      stagedActions: stagedActions.map(s => ({ id: s.id, actionType: s.actionType, preview: s.preview })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[analyst] AI error:', message, err)
    return NextResponse.json({
      error: 'Analyst request failed. Check your API key in Settings.',
    }, { status: 500 })
  }
}

/** Attachments a user can draft an entry from. Matches what lib/memo-agent/extract-text handles. */
const DOCUMENT_FORMATS = ['pdf', 'docx', 'xlsx', 'xls', 'md', 'markdown', 'txt', 'csv']
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
/** A capital-call notice is a couple of pages; anything past this is a mis-attached file. */
const MAX_DOCUMENT_CHARS = 20_000

/** Decode + extract an attached source document to the text that goes in the prompt. */
async function extractAttachment(
  doc: { name?: string; format?: string; base64?: string },
): Promise<{ text: string } | { error: string }> {
  const format = String(doc.format ?? '').toLowerCase().replace(/^\./, '')
  if (!DOCUMENT_FORMATS.includes(format)) {
    return { error: `Can't read a .${format || '?'} file — attach a PDF, Word doc, Excel file, or text file.` }
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(String(doc.base64), 'base64')
  } catch {
    return { error: 'That attachment could not be decoded.' }
  }
  if (buffer.length === 0) return { error: 'That attachment is empty.' }
  if (buffer.length > MAX_DOCUMENT_BYTES) return { error: 'That attachment is too large (max 10MB).' }

  const text = await extractText(buffer, format)
  if (!text || !text.trim()) {
    return { error: `No text could be read from ${doc.name ?? 'that file'} — a scanned image PDF won't work.` }
  }
  return { text: text.slice(0, MAX_DOCUMENT_CHARS) }
}

/**
 * Split a reply into the prose the user reads and the entries the app renders as reviewable
 * drafts. Anything unparseable stays in the prose rather than being dropped — a malformed block
 * is visible to the user, not silently swallowed.
 */
function extractProposals(text: string): { reply: string; proposals: AssistantProposal[] } {
  const proposals: AssistantProposal[] = []
  const reply = text.replace(/```proposal\s*([\s\S]*?)```/g, (whole, json: string) => {
    try {
      const obj = JSON.parse(json.trim())
      if (!obj || !Array.isArray(obj.postings) || obj.postings.length === 0) return whole
      proposals.push({
        type: obj.type === 'edit' ? 'edit' : 'create',
        entryId: obj.entryId ?? null,
        entryDate: String(obj.entryDate ?? ''),
        memo: String(obj.memo ?? ''),
        sourceType: obj.sourceType ?? 'manual',
        postings: obj.postings.map((candidate: unknown) => {
          const posting = candidate && typeof candidate === 'object'
            ? candidate as Record<string, unknown>
            : {}
          return {
            accountCode: String(posting.accountCode),
            amount: Number(posting.amount),
            lpEntity: posting.lpEntity ?? null,
          }
        }),
        rationale: String(obj.rationale ?? ''),
      })
      return ''
    } catch {
      return whole
    }
  })
  return { reply: reply.trim(), proposals }
}

async function summarizePreviousConversation(
  admin: ReturnType<typeof createAdminClient>,
  provider: Awaited<ReturnType<typeof createFundAIProviderWithOverride>>['provider'],
  model: string,
  fundId: string,
  userId: string,
  companyId: string | null,
  dealId: string | null,
  scope: string | null,
  excludeConvId: string,
) {
  // Find most recent unsummarized conversation in same scope
  let query = admin
    .from('analyst_conversations')
    .select('id, messages')
    .eq('fund_id', fundId)
    .eq('user_id', userId)
    .is('summary', null)
    .neq('id', excludeConvId)
    .gt('message_count', 0)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (dealId) {
    query = query.eq('deal_id', dealId)
  } else if (companyId) {
    query = query.eq('company_id', companyId).is('deal_id', null)
  } else {
    query = query.is('company_id', null).is('deal_id', null)
    query = scope ? query.eq('scope', scope) : query.is('scope', null)
  }

  const { data } = await query
  if (!data || data.length === 0) return

  const conv = data[0]
  const msgs = conv.messages as Array<{ role: string; content: string }>
  if (!Array.isArray(msgs) || msgs.length === 0) return

  // Build condensed transcript (each message truncated to 500 chars, total 4000 chars)
  let transcript = ''
  for (const m of msgs) {
    const line = `${m.role}: ${String(m.content).slice(0, 500)}\n`
    if (transcript.length + line.length > 4000) break
    transcript += line
  }

  try {
    const { text: summary } = await provider.createChat({
      model,
      maxTokens: 300,
      system: 'You are a concise summarizer.',
      messages: [
        {
          role: 'user',
          content: `Summarize this analyst conversation in 2-3 sentences. Focus on key questions, conclusions, and concerns raised.\n\n${transcript}`,
        },
      ],
    })

    await admin
      .from('analyst_conversations')
      .update({ summary })
      .eq('id', conv.id)
  } catch {
    // Summarization is best-effort
  }
}

function detectReferencedCompanies(
  messages: readonly AnalystConversationMessage[],
  lookup: Map<string, string>,
  currentCompanyId: string | null
): string[] {
  // Concatenate user messages in reverse order so recent mentions win
  const userTexts: string[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      userTexts.push(String(messages[i].content))
    }
  }
  const combined = userTexts.join(' ').toLowerCase()

  const matched = new Map<string, number>() // companyId → earliest position in combined text

  lookup.forEach((companyId, name) => {
    if (currentCompanyId && companyId === currentCompanyId) return
    if (matched.has(companyId)) return

    // Word-boundary match to avoid partial matches
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'i')
    const match = regex.exec(combined)
    if (match) {
      matched.set(companyId, match.index)
    }
  })

  // Sort by position (earliest in combined = most recently mentioned, since we reversed)
  return Array.from(matched.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .map(([id]) => id)
}

function detectExplicitDraftIntent(content: string): { actionTypes: ActionType[]; accountingEntry: boolean } {
  const actionTypes: ActionType[] = []
  if (/\b(?:update|set|change)\s+(?:a\s+|the\s+)?(?:company\s+)?metric\b|(?:更新|设置|修改)(?:公司)?指标/i.test(content)) {
    actionTypes.push('update_company_metric')
  }
  if (/\b(?:record|add|create)\s+(?:an?\s+|the\s+)?(?:investment|portfolio transaction)\b|(?:记录|添加|创建)(?:一笔|该笔|这个)?(?:投资|投资交易)/i.test(content)) {
    actionTypes.push('record_investment')
  }
  if (/\b(?:issue|create|schedule)\s+(?:an?\s+|the\s+)?capital call\b|(?:发起|创建|安排)(?:一次|该次)?资本调用/i.test(content)) {
    actionTypes.push('issue_capital_call')
  }
  const accountingEntry = /\b(?:record|add|create|draft|prepare|post)\s+(?:an?\s+|the\s+)?(?:accounting entry|journal entry|entry that records)\b|(?:记录|添加|创建|起草|准备|生成)(?:一笔|该笔|这个)?(?:会计分录|日记账分录|分录)/i.test(content)
  return { actionTypes, accountingEntry }
}
