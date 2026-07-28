import { createAdminClient } from '@/lib/supabase/admin'
import { logAIUsage } from '@/lib/ai/usage'
import type { MessageContent } from '@/lib/ai/types'
import type { Json } from '@/lib/types/database'
import { getStageProvider } from '@/lib/memo-agent/stage-provider'
import { buildSystemPrompt } from '@/lib/memo-agent/prompts/system'
import {
  buildResearchClaimsContent,
  buildResearchCompetitorsContent,
  buildResearchFoundersContent,
} from '@/lib/memo-agent/prompts/research'
import { extractJsonObject } from '@/lib/memo-agent/parse-ai-json'
import { loadDiligenceOutputLanguage } from '@/lib/diligence/output-language-store'
import {
  mergeFounderDossiers,
  parseFounderDossiers,
  type FounderDossier,
} from './research-founder-dossiers'
import type { IngestionOutput } from './ingest'

type Admin = ReturnType<typeof createAdminClient>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface ResearchOutput {
  findings: Array<{
    id: string
    claim_ref: string | null
    topic: string
    verification_status: 'verified' | 'contradicted' | 'company_stated' | 'inconclusive'
    evidence: string
    sources: Array<{ title: string; url: string | null; tier: 'tier_1' | 'tier_2' | 'tier_3' }>
    /** Partner-dismissed: hidden from the main list, kept for the record. */
    dismissed?: boolean
  }>
  contradictions: Array<{
    topic: string
    claim_ref: string | null
    description: string
    severity: 'material' | 'minor'
    dismissed?: boolean
  }>
  competitive_map: {
    named_by_company: Array<{ name: string; note: string; dismissed?: boolean }>
    named_by_research: Array<{ name: string; rationale: string; sources: Array<{ title: string; url: string | null }>; dismissed?: boolean }>
  }
  founder_dossiers: FounderDossier[]
  research_gaps: Array<{ topic: string; rationale: string; criticality: 'blocker' | 'important' | 'nice_to_have'; dismissed?: boolean }>
  research_mode: 'with_web_search' | 'no_web_search'
  /** URLs the agent cited via the web_search tool, across all sub-calls. Deduped.
   *  These come from Anthropic's text-block citation metadata, which the model
   *  often doesn't echo into the per-finding sources JSON. */
  web_sources?: Array<{ url: string; title: string }>
  /** Total server-side web searches performed across the 3 sub-calls. */
  web_search_count?: number
}

export interface ResearchResult {
  draft_id: string
  research_output: ResearchOutput
  warnings: string[]
}

/**
 * Run Stage 2 — external research.
 *
 * Fans out 3 AI sub-calls in parallel:
 *   1. Claims verification → findings + contradictions + research_gaps
 *   2. Competitive map     → named_by_company + named_by_research
 *   3. Founder dossiers    → founder_dossiers
 *
 * Each sub-call gets its own focused prompt, ingestion subset, and output
 * budget. A single sub-call failure surfaces as a warning while the other
 * two still produce output — replacing the prior all-or-nothing single call
 * that orphaned via max_tokens truncation on large data rooms.
 *
 * Web search: when the fund has set `memo_agent_web_search_enabled = true`
 * AND the resolved research-stage provider is Anthropic, the web_search tool
 * is attached to the 3 sub-calls. Other providers always get the no-web-search
 * prompt variant.
 */
export async function runResearch(params: {
  admin: Admin
  fundId: string
  dealId: string
  draftId?: string
  progressCb?: (msg: string) => Promise<void>
}): Promise<ResearchResult> {
  const { admin, fundId, dealId, progressCb } = params
  const note = async (msg: string) => { if (progressCb) await progressCb(msg) }
  const warnings: string[] = []

  await note('Loading ingestion output…')
  const draftRow = await loadDraftWithIngestion(admin, fundId, dealId, params.draftId)
  if (!draftRow) {
    throw new Error('No ingestion output found. Run Stage 1 ingest first.')
  }
  const ingestion = draftRow.ingestion_output as IngestionOutput
  const docCount = ingestion.documents?.length ?? 0
  const claimCount = ingestion.documents?.reduce((acc, d) => acc + (d.claims?.length ?? 0), 0) ?? 0
  const outputLanguage = await loadDiligenceOutputLanguage({
    admin,
    fundId,
    dealId,
    draftId: draftRow.id,
  })

  await note('Loading deal record…')
  const { data: dealRow } = await admin
    .from('diligence_deals')
    .select('name')
    .eq('id', dealId)
    .eq('fund_id', fundId)
    .maybeSingle()
  const dealName = (dealRow as { name: string } | null)?.name ?? 'this deal'

  await note('Building research prompt…')
  const { prompt: system } = await buildSystemPrompt({ admin, fundId, stage: 'research', outputLanguage })

  const { provider, model, providerType, webSearchAvailable, webSearchOptIn } = await getStageProvider(admin, fundId, 'research')
  const webSearchEnabled = webSearchAvailable
  const promptInput = { dealName, ingestion, webSearchEnabled }

  // The fund opted into web search but it can't run — research isn't on
  // Anthropic. Surface this loudly: it's the most common reason web search
  // "didn't work".
  if (webSearchOptIn && !webSearchAvailable) {
    warnings.push(
      `Web search is enabled in settings but the research stage is not running on Anthropic ` +
      `(web search only works with Anthropic). It was skipped — set the research-stage provider ` +
      `to Anthropic, or the fund default to Anthropic.`
    )
  }

  await note(`Running 3 research sub-calls in parallel (${docCount} docs, ${claimCount} claims${webSearchEnabled ? ', web search on' : ''})…`)

  // Total server-side web searches performed across all sub-calls — lets us
  // tell "tool attached but model didn't search" from "searched, found little".
  let totalWebSearches = 0
  // Anthropic citations are attached as text-block metadata, not in the JSON
  // the model writes. We collect them across all sub-calls and surface them
  // on the research output so the partner sees what was actually consulted
  // even when the model didn't echo URLs into the per-finding sources.
  const citationByUrl = new Map<string, { url: string; title: string }>()
  // Track sub-call completions so the partner sees progress updates while the
  // 3 parallel calls are in flight (otherwise progress_message goes silent for
  // 1–5 minutes, which feels like a hang).
  let completedSubCalls = 0
  const TOTAL_SUBCALLS = 3

  // Sub-call helper — runs one focused AI call, logs usage, parses JSON.
  // Each catches its own errors so a single failure doesn't kill siblings.
  type SubCall<T> = { name: string; content: MessageContent; maxTokens: number; parse: (obj: Record<string, unknown>) => T; fallback: T }
  const runSubCall = async <T>(s: SubCall<T>): Promise<T> => {
    const startedAt = Date.now()
    try {
      const { text, usage, webSearchCount, webSearchCitations } = await provider.createMessage({
        model,
        maxTokens: s.maxTokens,
        system,
        content: s.content,
        enableWebSearch: webSearchEnabled,
      })
      if (typeof webSearchCount === 'number') totalWebSearches += webSearchCount
      if (Array.isArray(webSearchCitations)) {
        for (const c of webSearchCitations) {
          if (!citationByUrl.has(c.url)) citationByUrl.set(c.url, c)
        }
      }
      completedSubCalls += 1
      const dur = Math.round((Date.now() - startedAt) / 1000)
      const searchesNote = webSearchCount ? `, ${webSearchCount} web search${webSearchCount === 1 ? '' : 'es'}` : ''
      await note(`Sub-call "${s.name}" done in ${dur}s${searchesNote} · ${completedSubCalls} of ${TOTAL_SUBCALLS} complete`)
      logAIUsage(admin, {
        fundId,
        dealId,
        provider: providerType,
        model,
        feature: `memo_agent_research_${s.name}`,
        usage,
        webSearches: typeof webSearchCount === 'number' ? webSearchCount : 0,
      })
      const parsed = extractJsonObject(text)
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`${s.name} returned non-object JSON`)
      }
      return s.parse(parsed as Record<string, unknown>)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warnings.push(`Research sub-call "${s.name}" failed: ${msg}`)
      completedSubCalls += 1
      await note(`Sub-call "${s.name}" failed · ${completedSubCalls} of ${TOTAL_SUBCALLS} complete (continuing)`)
      return s.fallback
    }
  }

  const [claimsResult, competitorsResult, foundersResult] = await Promise.all([
    runSubCall({
      name: 'claims',
      content: buildResearchClaimsContent(promptInput),
      // Claims is the heaviest output (findings + contradictions + gaps).
      // 24K leaves headroom even for large data rooms.
      maxTokens: 24576,
      parse: (obj) => ({
        findings: Array.isArray(obj.findings) ? obj.findings as ResearchOutput['findings'] : [],
        contradictions: Array.isArray(obj.contradictions) ? obj.contradictions as ResearchOutput['contradictions'] : [],
        research_gaps: Array.isArray(obj.research_gaps) ? obj.research_gaps as ResearchOutput['research_gaps'] : [],
      }),
      fallback: { findings: [], contradictions: [], research_gaps: [] },
    }),
    runSubCall({
      name: 'competitors',
      content: buildResearchCompetitorsContent(promptInput),
      maxTokens: 6144,
      parse: (obj) => {
        const cm = isRecord(obj.competitive_map) ? obj.competitive_map : {}
        return {
          named_by_company: Array.isArray(cm.named_by_company)
            ? cm.named_by_company as ResearchOutput['competitive_map']['named_by_company']
            : [],
          named_by_research: Array.isArray(cm.named_by_research)
            ? cm.named_by_research as ResearchOutput['competitive_map']['named_by_research']
            : [],
        }
      },
      fallback: { named_by_company: [], named_by_research: [] },
    }),
    runSubCall({
      name: 'founders',
      content: buildResearchFoundersContent(promptInput),
      maxTokens: 8192,
      parse: (obj) => {
        const parsed = parseFounderDossiers(obj.founder_dossiers)
        if (parsed.discarded > 0) {
          warnings.push(`Founder research discarded ${parsed.discarded} malformed dossier entr${parsed.discarded === 1 ? 'y' : 'ies'}.`)
        }
        return parsed.dossiers
      },
      fallback: [] as ResearchOutput['founder_dossiers'],
    }),
  ])

  const webSources = Array.from(citationByUrl.values())

  const output: ResearchOutput = {
    findings: claimsResult.findings,
    contradictions: claimsResult.contradictions,
    competitive_map: competitorsResult,
    founder_dossiers: foundersResult,
    research_gaps: claimsResult.research_gaps,
    research_mode: webSearchEnabled ? 'with_web_search' : 'no_web_search',
    web_sources: webSources,
    web_search_count: webSearchEnabled ? totalWebSearches : undefined,
  }

  // Sanity checks — empty outputs become warnings, not failures, so a partial
  // result is still persisted and the partner can decide whether to re-run.
  if (output.findings.length === 0 && claimCount > 0) {
    warnings.push(`Research produced 0 findings despite ${claimCount} ingested claims. Model may have ignored the prompt — consider re-running.`)
  }
  if (webSearchEnabled) {
    if (totalWebSearches === 0) {
      warnings.push(
        'Web search was attached but the model performed 0 searches. ' +
        'Verify web search is enabled on the Anthropic account, or that the research prompt instructs the model to search.'
      )
    } else if (webSources.length === 0 && output.findings.length > 0 && output.findings.every(f => f.sources.length === 0)) {
      // Searches happened but produced no citation metadata AND the model
      // didn't echo any URLs into the JSON. Real "no sources" signal.
      warnings.push(`Web search ran (${totalWebSearches} searches) but no finding or citation carries a URL — the model may not be citing what it found.`)
    }
  }

  await note('Writing research output to draft…')
  // Re-read immediately before persistence. Research can take several minutes,
  // and a partner may have edited a dossier after the initial draft snapshot.
  const { data: latestDraft, error: latestDraftError } = await admin
    .from('diligence_memo_drafts')
    .select('research_output')
    .eq('id', draftRow.id)
    .eq('deal_id', dealId)
    .eq('fund_id', fundId)
    .eq('is_draft', true)
    .maybeSingle()
  if (latestDraftError) throw new Error(`Failed to refresh current founder dossiers: ${latestDraftError.message}`)

  const latestResearch = (latestDraft as { research_output: ResearchOutput | null } | null)?.research_output
  const persistedOutput: ResearchOutput = {
    ...output,
    founder_dossiers: mergeFounderDossiers(latestResearch?.founder_dossiers, foundersResult),
  }
  const { error: updateErr } = await admin
    .from('diligence_memo_drafts')
    .update({ research_output: persistedOutput as unknown as Json })
    .eq('id', draftRow.id)
    .eq('deal_id', dealId)
    .eq('fund_id', fundId)
    .eq('is_draft', true)
  if (updateErr) throw new Error(`Failed to update draft: ${updateErr.message}`)

  // Bump stage if currently at 'research'. Don't regress later stages.
  await admin
    .from('diligence_deals')
    .update({ current_memo_stage: 'qa' })
    .eq('id', dealId)
    .eq('fund_id', fundId)
    .eq('current_memo_stage', 'research')

  return {
    draft_id: draftRow.id,
    research_output: persistedOutput,
    warnings,
  }
}

// ---------------------------------------------------------------------------

async function loadDraftWithIngestion(
  admin: Admin,
  fundId: string,
  dealId: string,
  draftId?: string,
): Promise<{ id: string; ingestion_output: unknown; research_output: ResearchOutput | null } | null> {
  if (draftId) {
    const { data } = await admin
      .from('diligence_memo_drafts')
      .select('id, ingestion_output, research_output')
      .eq('id', draftId)
      .eq('deal_id', dealId)
      .eq('fund_id', fundId)
      .eq('is_draft', true)
      .maybeSingle()
    return (data as unknown as {
      id: string
      ingestion_output: unknown
      research_output: ResearchOutput | null
    } | null) ?? null
  }

  const { data } = await admin
    .from('diligence_memo_drafts')
    .select('id, ingestion_output, research_output')
    .eq('deal_id', dealId)
    .eq('fund_id', fundId)
    .eq('is_draft', true)
    .not('ingestion_output', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as unknown as {
    id: string
    ingestion_output: unknown
    research_output: ResearchOutput | null
  } | null) ?? null
}
