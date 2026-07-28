import { createAdminClient } from '@/lib/supabase/admin'
import { hasAccess } from '@/lib/access/effective'
import { logAIUsage } from '@/lib/ai/usage'
import { getStageProvider } from '@/lib/memo-agent/stage-provider'
import { buildSystemPrompt } from '@/lib/memo-agent/prompts/system'
import {
  buildResearchClaimsContent,
  buildResearchCompetitorsContent,
  buildResearchFoundersContent,
} from '@/lib/memo-agent/prompts/research'
import { extractJsonObject } from '@/lib/memo-agent/parse-ai-json'
import type { AIProvider, AIResult, MessageContent } from '@/lib/ai/types'
import { loadDiligenceOutputLanguage } from '@/lib/diligence/output-language-store'
import {
  mergeFounderDossiers,
  parseFounderDossiers,
  type FounderDossier,
} from './research-founder-dossiers'
import type { IngestionOutput } from './ingest'
import type { BackgroundExecutionContext } from '@/lib/background-jobs/context'
import type { Json } from '@/lib/types/database'
import { isPublicSearchHostname } from '@/lib/search/public-identity'
import {
  ReportingSearchSessionState,
  createReportingSearchTool,
  type CollectedResearchSource,
  type ReportingSearchTool,
} from '@/lib/search/reporting-search-tool'

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
    evidence_source_ids?: string[]
    /** Partner-dismissed: hidden from the main list, kept for the record. */
    dismissed?: boolean
  }>
  contradictions: Array<{
    topic: string
    claim_ref: string | null
    description: string
    severity: 'material' | 'minor'
    evidence_source_ids?: string[]
    dismissed?: boolean
  }>
  competitive_map: {
    named_by_company: Array<{ name: string; note: string; dismissed?: boolean }>
    named_by_research: Array<{ name: string; rationale: string; sources: Array<{ title: string; url: string | null }>; evidence_source_ids?: string[]; dismissed?: boolean }>
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
  /** Authoritative provider-neutral external evidence metadata. */
  search_backend: 'reporting' | 'anthropic' | 'none'
  search_sources?: Array<{ id: string; title: string; url: string | null; query: string }>
  search_count?: number
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
  executionContext?: BackgroundExecutionContext
  /** Generic workers commit through an attempt-fenced receipt RPC. */
  persist?: boolean
  signal?: AbortSignal
}): Promise<ResearchResult> {
  const { admin, fundId, dealId, progressCb } = params
  const note = async (msg: string) => { if (progressCb) await progressCb(msg) }
  const warnings: string[] = []
  const executionSignal = backgroundAttemptSignal(params.signal, params.executionContext?.leaseExpiresAt)

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
  const publicSearchUrl = await loadMemoPublicSearchUrl(admin, fundId, dealId, ingestion)

  await note('Building research prompt…')
  const { prompt: system } = await buildSystemPrompt({ admin, fundId, stage: 'research', outputLanguage })

  const { provider, model, providerType, webSearchAvailable, webSearchOptIn } = await getStageProvider(admin, fundId, 'research')
  const configuredBackend = memoResearchSearchBackend(process.env.MEMO_RESEARCH_SEARCH_BACKEND)
  const searchMode = resolveMemoResearchSearchMode({
    optIn: webSearchOptIn,
    configuredBackend,
    hasExecutionContext: !!params.executionContext,
    supportsToolLoop: provider.supportsToolLoop === true && typeof provider.createToolLoop === 'function',
    nativeSearchAvailable: webSearchAvailable,
    hasPublicSearchIdentity: !!publicSearchUrl,
    hasSearchAccess: !!params.executionContext?.access && hasAccess(
      params.executionContext.access,
      'dealflow',
      'read',
      'search',
    ),
  })
  const reportingSearchEnabled = searchMode.backend === 'reporting'
  const nativeSearchEnabled = searchMode.backend === 'anthropic'
  const searchBackend = searchMode.backend
  const externalSearchEnabled = searchBackend !== 'none'
  const promptInput = {
    dealName,
    ingestion,
    webSearchEnabled: externalSearchEnabled,
    citationMode: reportingSearchEnabled ? 'source_ids' as const : 'urls' as const,
  }

  if (webSearchOptIn && configuredBackend === 'reporting' && !reportingSearchEnabled) {
    warnings.push(
      searchMode.reason === 'no_public_identity'
        ? 'External Search was not used because this deal has no linked, validated public company website. The confidential deal name was not sent to Search.'
        : searchMode.reason === 'search_unauthorized'
          ? 'External Search was not used because the initiating user does not currently have Search access. Research continued without external Search.'
        : provider.supportsToolLoop !== true || !provider.createToolLoop
        ? 'External Search is enabled, but this research provider does not support tool use. Research continued without external Search.'
        : 'External Search requires an active background attempt. This legacy Research run continued without external Search.',
    )
  }
  if (webSearchOptIn && configuredBackend === 'anthropic' && !nativeSearchEnabled) {
    warnings.push(searchMode.reason === 'search_unauthorized'
      ? 'Legacy Anthropic web search was not used because the initiating user does not currently have Search access. Research continued without external Search.'
      : 'Legacy Anthropic web search was requested but is unavailable for the selected provider. Research continued without external Search.')
  }

  await note(`Running 3 research sub-calls in parallel (${docCount} docs, ${claimCount} claims${externalSearchEnabled ? `, ${searchBackend} Search on` : ''})…`)

  const searchState = reportingSearchEnabled ? new ReportingSearchSessionState() : null
  const searchTools = new Map<string, ReportingSearchTool>()
  const createSubCallTool = (namespace: string): ReportingSearchTool | null => {
    if (!reportingSearchEnabled || !params.executionContext || !searchState) return null
    const tool = createReportingSearchTool({
      context: params.executionContext,
      deal: { companyName: null, companyDomain: null, companyUrl: publicSearchUrl, founderName: null },
      profile: 'memo',
      namespace,
      state: searchState,
      signal: executionSignal,
    })
    searchTools.set(namespace, tool)
    return tool
  }

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
  let successfulSubCalls = 0
  const TOTAL_SUBCALLS = 3

  // Sub-call helper — runs one focused AI call, logs usage, parses JSON.
  // Each catches its own errors so a single failure doesn't kill siblings.
  type SubCall<T> = {
    name: 'claims' | 'competitors' | 'founders'
    content: MessageContent
    maxTokens: number
    tool: ReportingSearchTool | null
    parse: (obj: Record<string, unknown>) => T
    fallback: T
  }
  const runSubCall = async <T>(s: SubCall<T>): Promise<T> => {
    const startedAt = Date.now()
    try {
      const aiResult = await runResearchProviderCall({
        provider,
        model,
        maxTokens: s.maxTokens,
        system,
        content: s.content,
        tool: s.tool,
        nativeSearchEnabled,
        signal: executionSignal,
      })
      const { text, usage, webSearchCount, webSearchCitations } = aiResult
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
        webSearches: s.tool ? s.tool.searchCount() : (typeof webSearchCount === 'number' ? webSearchCount : 0),
      })
      const parsed = extractJsonObject(text)
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`${s.name} returned non-object JSON`)
      }
      const result = s.parse(parsed as Record<string, unknown>)
      successfulSubCalls += 1
      return result
    } catch (err) {
      if (shouldRethrowResearchError(err, executionSignal)) throw err
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
      tool: createSubCallTool('claims'),
      content: buildResearchClaimsContent(promptInput),
      // Claims is the heaviest output (findings + contradictions + gaps).
      // 24K leaves headroom even for large data rooms.
      maxTokens: 24576,
      parse: (obj) => ({
        findings: parseFindings(obj.findings),
        contradictions: parseContradictions(obj.contradictions),
        research_gaps: parseResearchGaps(obj.research_gaps),
      }),
      fallback: { findings: [], contradictions: [], research_gaps: [] },
    }),
    runSubCall({
      name: 'competitors',
      tool: createSubCallTool('competitors'),
      content: buildResearchCompetitorsContent(promptInput),
      maxTokens: 6144,
      parse: (obj) => {
        const cm = isRecord(obj.competitive_map) ? obj.competitive_map : {}
        return {
          named_by_company: parseNamedByCompany(cm.named_by_company),
          named_by_research: parseNamedByResearch(cm.named_by_research),
        }
      },
      fallback: { named_by_company: [], named_by_research: [] },
    }),
    runSubCall({
      name: 'founders',
      tool: createSubCallTool('founders'),
      content: buildResearchFoundersContent(promptInput),
      maxTokens: 8192,
      parse: (obj) => {
        const parsed = parseFounderDossiers(obj.founder_dossiers)
        if (parsed.discarded > 0) {
          warnings.push(`Founder research discarded ${parsed.discarded} malformed dossier entr${parsed.discarded === 1 ? 'y' : 'ies'}.`)
        }
        return parseResearchFounderDossiers(parsed.dossiers)
      },
      fallback: [] as ResearchOutput['founder_dossiers'],
    }),
  ])
  assertResearchSubCallsSucceeded(successfulSubCalls)

  const provenancedFindings = enforceCompanyClaimProvenance(claimsResult.findings, ingestion)
  const provenancedNamedByCompany = enforceCompanyCompetitorProvenance(
    competitorsResult.named_by_company,
    ingestion,
  )
  const provenancedFounders = enforceFounderIdentityProvenance(foundersResult, ingestion)
  const droppedCompanyClaims = claimsResult.findings.length - provenancedFindings.length
  const droppedCompanyCompetitors = competitorsResult.named_by_company.length - provenancedNamedByCompany.length
  const droppedFounderIdentities = foundersResult.length - provenancedFounders.length
  if (droppedCompanyClaims > 0) warnings.push(`${droppedCompanyClaims} unbound company-stated finding(s) were omitted.`)
  if (droppedCompanyCompetitors > 0) warnings.push(`${droppedCompanyCompetitors} competitor(s) not explicitly named in company materials were omitted.`)
  if (droppedFounderIdentities > 0) warnings.push(`${droppedFounderIdentities} founder dossier(s) not bound to an ingestion identity were omitted.`)

  const reportingSources = searchState ? Array.from(searchState.collected.values()) : []
  if (reportingSearchEnabled) totalWebSearches = searchState?.calls ?? 0
  const sourceMap = new Map(reportingSources.map(source => [source.id, source]))
  const failClosedGrounding = reportingSearchEnabled || searchBackend === 'none'
  const groundedFindings = failClosedGrounding
    ? groundFindings(provenancedFindings, searchTools.get('claims')?.allowedSourceIds() ?? [], sourceMap)
    : provenancedFindings
  const groundedContradictions = failClosedGrounding
    ? groundContradictions(
      claimsResult.contradictions,
      searchTools.get('claims')?.allowedSourceIds() ?? [],
    )
    : claimsResult.contradictions
  const groundedCompetitors = failClosedGrounding
    ? {
      named_by_company: provenancedNamedByCompany,
      named_by_research: groundNamedResearch(
        competitorsResult.named_by_research,
        searchTools.get('competitors')?.allowedSourceIds() ?? [],
        sourceMap,
      ),
    }
    : { ...competitorsResult, named_by_company: provenancedNamedByCompany }
  const groundedFounders = failClosedGrounding
    ? groundFounders(provenancedFounders, searchTools.get('founders')?.allowedSourceIds() ?? [], sourceMap)
    : provenancedFounders
  if (failClosedGrounding) {
    const downgraded = groundedFindings.filter((finding, index) => (
      finding.verification_status === 'inconclusive'
      && ['verified', 'contradicted'].includes(provenancedFindings[index]?.verification_status)
    )).length
    const droppedContradictions = claimsResult.contradictions.length - groundedContradictions.length
    const droppedCompetitors = competitorsResult.named_by_research.length - groundedCompetitors.named_by_research.length
    const clearedFounders = groundedFounders.filter(founder => founder.evidence_source_ids?.length === 0).length
    if (downgraded > 0) warnings.push(`${downgraded} externally asserted finding(s) were downgraded because no accepted Search source ID supported them.`)
    if (droppedContradictions > 0) warnings.push(`${droppedContradictions} unsupported external contradiction(s) were omitted.`)
    if (droppedCompetitors > 0) warnings.push(`${droppedCompetitors} unsupported research-identified competitor(s) were omitted.`)
    if (clearedFounders > 0) warnings.push(`${clearedFounders} founder background summary or summaries were cleared because no accepted Search source ID supported them.`)
  }
  const webSources = reportingSearchEnabled
    ? reportingSources.filter(source => source.url).map(source => ({ url: source.url!, title: source.title }))
    : Array.from(citationByUrl.values())
  const searchDiagnostics = createResearchSearchDiagnostics(
    searchBackend,
    totalWebSearches,
    reportingSources,
    webSources,
  )

  const output: ResearchOutput = {
    findings: groundedFindings,
    contradictions: groundedContradictions,
    competitive_map: groundedCompetitors,
    founder_dossiers: groundedFounders,
    research_gaps: claimsResult.research_gaps,
    research_mode: externalSearchEnabled ? 'with_web_search' : 'no_web_search',
    ...searchDiagnostics,
  }

  // Sanity checks — empty outputs become warnings, not failures, so a partial
  // result is still persisted and the partner can decide whether to re-run.
  if (output.findings.length === 0 && claimCount > 0) {
    warnings.push(`Research produced 0 findings despite ${claimCount} ingested claims. Model may have ignored the prompt — consider re-running.`)
  }
  if (externalSearchEnabled) {
    if (totalWebSearches === 0) {
      warnings.push(
        'External Search was attached but the model performed 0 searches.'
      )
    } else if (webSources.length === 0 && output.findings.length > 0 && output.findings.every(f => f.sources.length === 0)) {
      // Searches happened but produced no citation metadata AND the model
      // didn't echo any URLs into the JSON. Real "no sources" signal.
      warnings.push(`External Search ran (${totalWebSearches} searches) but no finding carries an accepted source ID.`)
    }
  }

  let persistedOutput = output
  if (params.persist !== false) {
    await note('Writing research output to draft…')
    // Research can take several minutes. Re-read immediately before saving so
    // partner edits made during the run remain authoritative.
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
    persistedOutput = {
      ...output,
      founder_dossiers: mergeFounderDossiers(latestResearch?.founder_dossiers, output.founder_dossiers),
    }
    const { error: updateErr } = await admin
      .from('diligence_memo_drafts')
      .update({ research_output: persistedOutput as unknown as Json })
      .eq('id', draftRow.id)
      .eq('deal_id', dealId)
      .eq('fund_id', fundId)
      .eq('is_draft', true)
    if (updateErr) throw new Error(`Failed to update draft: ${updateErr.message}`)

    await admin
      .from('diligence_deals')
      .update({ current_memo_stage: 'qa' })
      .eq('id', dealId)
      .eq('fund_id', fundId)
      .eq('current_memo_stage', 'research')
  } else {
    await note('Research output ready for secure commit…')
  }

  return {
    draft_id: draftRow.id,
    research_output: persistedOutput,
    warnings,
  }
}

export function memoResearchSearchBackend(value: string | undefined): 'reporting' | 'anthropic' | 'off' {
  if (!value || value === 'reporting') return 'reporting'
  if (value === 'anthropic' || value === 'off') return value
  return 'off'
}

export async function runResearchProviderCall(input: Readonly<{
  provider: AIProvider
  model: string
  maxTokens: number
  system: string
  content: MessageContent
  tool: ReportingSearchTool | null
  nativeSearchEnabled: boolean
  signal?: AbortSignal
}>): Promise<AIResult> {
  if (input.tool && input.provider.supportsToolLoop === true && input.provider.createToolLoop) {
    return input.provider.createToolLoop({
      model: input.model,
      maxTokens: input.maxTokens,
      system: input.system,
      content: input.content,
      tools: [input.tool.definition],
      executeTool: call => input.tool!.execute(call),
      maxIterations: 4,
      signal: input.signal,
    })
  }
  return input.provider.createMessage({
    model: input.model,
    maxTokens: input.maxTokens,
    system: input.system,
    content: input.content,
    enableWebSearch: input.nativeSearchEnabled,
    webSearchMaxUses: input.nativeSearchEnabled ? 1 : undefined,
    webSearchBlockedDomains: input.nativeSearchEnabled ? ['linkedin.com', 'lnkd.in'] : undefined,
    signal: input.signal,
  })
}

export function resolveMemoResearchSearchMode(input: Readonly<{
  optIn: boolean
  configuredBackend: 'reporting' | 'anthropic' | 'off'
  hasExecutionContext: boolean
  supportsToolLoop: boolean
  nativeSearchAvailable: boolean
  hasPublicSearchIdentity: boolean
  hasSearchAccess: boolean
}>): Readonly<{ backend: ResearchOutput['search_backend']; reason: 'enabled' | 'off' | 'unsupported' | 'legacy_context' | 'native_unavailable' | 'no_public_identity' | 'search_unauthorized' }> {
  if (!input.optIn || input.configuredBackend === 'off') return Object.freeze({ backend: 'none', reason: 'off' })
  if (!input.hasSearchAccess) return Object.freeze({ backend: 'none', reason: 'search_unauthorized' })
  if (!input.hasPublicSearchIdentity) return Object.freeze({ backend: 'none', reason: 'no_public_identity' })
  if (input.configuredBackend === 'anthropic') {
    return input.nativeSearchAvailable
      ? Object.freeze({ backend: 'anthropic', reason: 'enabled' })
      : Object.freeze({ backend: 'none', reason: 'native_unavailable' })
  }
  if (!input.hasExecutionContext) return Object.freeze({ backend: 'none', reason: 'legacy_context' })
  if (!input.supportsToolLoop) return Object.freeze({ backend: 'none', reason: 'unsupported' })
  return Object.freeze({ backend: 'reporting', reason: 'enabled' })
}

export function createResearchSearchDiagnostics(
  backend: ResearchOutput['search_backend'],
  count: number,
  reportingSources: readonly CollectedResearchSource[],
  webSources: readonly { url: string; title: string }[],
): Pick<ResearchOutput, 'search_backend' | 'search_sources' | 'search_count' | 'web_sources' | 'web_search_count'> {
  const enabled = backend !== 'none'
  return Object.freeze({
    search_backend: backend,
    search_sources: backend === 'reporting' ? reportingSources.map(publicResearchSource) : undefined,
    search_count: enabled ? count : undefined,
    web_sources: [...webSources],
    web_search_count: enabled ? count : undefined,
  })
}

function acceptedSourceIds(value: unknown, allowedIds: readonly string[]): string[] {
  if (!Array.isArray(value)) return []
  const allowed = new Set(allowedIds)
  return Array.from(new Set(value.filter((id): id is string => typeof id === 'string' && allowed.has(id))))
}

function publicResearchSource(source: CollectedResearchSource): {
  id: string
  title: string
  url: string | null
  query: string
} {
  return Object.freeze({ id: source.id, title: source.title, url: source.url ?? null, query: source.query })
}

function sourceTier(source: CollectedResearchSource): 'tier_1' | 'tier_2' | 'tier_3' {
  const originIds = source.sources.map(origin => origin.id.toLowerCase())
  return originIds.some(id => ['pubmed', 'sec', 'fda', 'clinical_trials', 'crossref'].includes(id))
    ? 'tier_1'
    : source.url ? 'tier_2' : 'tier_3'
}

export function groundFindings(
  findings: ResearchOutput['findings'],
  allowedIds: readonly string[],
  sources: ReadonlyMap<string, CollectedResearchSource>,
): ResearchOutput['findings'] {
  return findings.map(finding => {
    const ids = acceptedSourceIds(finding.evidence_source_ids, allowedIds)
    return {
      ...finding,
      verification_status: ids.length === 0 && (finding.verification_status === 'verified' || finding.verification_status === 'contradicted')
        ? 'inconclusive'
        : finding.verification_status,
      evidence_source_ids: ids,
      sources: ids.flatMap(id => {
        const source = sources.get(id)
        return source ? [{ title: source.title, url: source.url ?? null, tier: sourceTier(source) }] : []
      }),
    }
  })
}

export function groundNamedResearch(
  items: ResearchOutput['competitive_map']['named_by_research'],
  allowedIds: readonly string[],
  sources: ReadonlyMap<string, CollectedResearchSource>,
): ResearchOutput['competitive_map']['named_by_research'] {
  return items.flatMap(item => {
    const ids = acceptedSourceIds(item.evidence_source_ids, allowedIds)
    if (ids.length === 0) return []
    return [{
      ...item,
      evidence_source_ids: ids,
      sources: ids.flatMap(id => {
        const source = sources.get(id)
        return source ? [{ title: source.title, url: source.url ?? null }] : []
      }),
    }]
  })
}

export function groundContradictions(
  contradictions: ResearchOutput['contradictions'],
  allowedIds: readonly string[],
): ResearchOutput['contradictions'] {
  return contradictions.flatMap(contradiction => {
    const ids = acceptedSourceIds(contradiction.evidence_source_ids, allowedIds)
    return ids.length > 0 ? [{ ...contradiction, evidence_source_ids: ids }] : []
  })
}

export function groundFounders(
  founders: ResearchOutput['founder_dossiers'],
  allowedIds: readonly string[],
  sources: ReadonlyMap<string, CollectedResearchSource>,
): ResearchOutput['founder_dossiers'] {
  return founders.map(founder => {
    const ids = acceptedSourceIds(founder.evidence_source_ids, allowedIds)
    const supported = ids.length > 0
    return {
      ...founder,
      background_summary: supported ? founder.background_summary : '',
      evidence_source_ids: ids,
      sources: ids.flatMap(id => {
        const source = sources.get(id)
        return source ? [{ title: source.title, url: source.url ?? null }] : []
      }),
      open_questions: supported
        ? founder.open_questions
        : Array.from(new Set([...founder.open_questions, 'External background was not verified by accepted Search evidence.'])),
    }
  })
}

const MAX_MODEL_ITEMS = 200

export function parseFindings(value: unknown): ResearchOutput['findings'] {
  return parseModelList(value, item => {
    const id = modelText(item.id, 160)
    const topic = modelText(item.topic, 240)
    const evidence = modelText(item.evidence, 12_000)
    if (!id || !topic || !evidence) return null
    return {
      id,
      claim_ref: modelNullableText(item.claim_ref, 240),
      topic,
      verification_status: modelEnum(item.verification_status, ['verified', 'contradicted', 'company_stated', 'inconclusive'], 'inconclusive'),
      evidence,
      sources: parseFindingSources(item.sources),
      evidence_source_ids: modelStringList(item.evidence_source_ids, 80, 40),
    }
  })
}

export function enforceCompanyClaimProvenance(
  findings: ResearchOutput['findings'],
  ingestion: IngestionOutput,
): ResearchOutput['findings'] {
  const claims = new Map(ingestion.documents.flatMap(document => document.claims).map(claim => [claim.id, claim]))
  return findings.flatMap(finding => {
    if (finding.verification_status !== 'company_stated') return [finding]
    const claim = finding.claim_ref ? claims.get(finding.claim_ref) : undefined
    if (!claim) return []
    return [{
      ...finding,
      evidence: `${claim.field}: ${claim.value}`.slice(0, 12_000),
      sources: [],
      evidence_source_ids: [],
    }]
  })
}

export function enforceCompanyCompetitorProvenance(
  items: ResearchOutput['competitive_map']['named_by_company'],
  ingestion: IngestionOutput,
): ResearchOutput['competitive_map']['named_by_company'] {
  const claims = companyCompetitorClaims(ingestion)
  return items.flatMap(item => {
    const matched = claims.find(claim => containsBoundedEntity(claim.value, item.name, 'organization'))
    return matched ? [{ name: item.name, note: `${matched.field}: ${matched.value}`.slice(0, 4_000) }] : []
  })
}

export function enforceFounderIdentityProvenance(
  founders: ResearchOutput['founder_dossiers'],
  ingestion: IngestionOutput,
): ResearchOutput['founder_dossiers'] {
  const evidence = founderIdentityEvidence(ingestion)
  return founders.flatMap(founder => {
    const matched = evidence.find(value => containsBoundedEntity(value, founder.founder_name, 'person'))
    if (!matched) return []
    const role = normalizedEvidence(matched).includes(normalizedEvidence(founder.role))
      ? founder.role
      : 'Role not confirmed in ingestion'
    return [{ ...founder, role }]
  })
}

function companyCompetitorClaims(ingestion: IngestionOutput): IngestionOutput['documents'][number]['claims'] {
  return ingestion.documents
    .filter(document => document.detected_type !== 'industry_expert')
    .flatMap(document => document.claims)
    .filter(claim => /competit|market.?landscape|alternative|incumbent/i.test(`${claim.field} ${claim.context}`))
}

function founderIdentityEvidence(ingestion: IngestionOutput): string[] {
  return ingestion.documents
    .filter(document => ['team_bio', 'pitch_deck'].includes(document.detected_type))
    .flatMap(document => [
      document.summary,
      ...document.claims
        .filter(claim => /founder|ceo|cto|cmo|cfo|team|leadership|role|experience/i.test(`${claim.field} ${claim.context}`))
        .flatMap(claim => [claim.value, claim.context]),
    ])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
}

function normalizedEvidence(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g, ' ')
    .trim()
}

function containsBoundedEntity(haystack: string, candidate: string, kind: 'organization' | 'person'): boolean {
  const normalizedHaystack = normalizedEvidence(haystack)
  const normalizedCandidate = normalizedEvidence(candidate)
  const tokens = normalizedCandidate.split(' ').filter(Boolean)
  const isCjkName = /^[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]{2,12}$/.test(normalizedCandidate)
  const valid = kind === 'organization'
    ? normalizedCandidate.length >= 4 || isCjkName
    : isCjkName || (tokens.length >= 2 && tokens.every(token => token.length >= 2))
  if (!valid) return false
  return isCjkName
    ? normalizedHaystack.includes(normalizedCandidate)
    : ` ${normalizedHaystack} `.includes(` ${normalizedCandidate} `)
}

export function assertResearchSubCallsSucceeded(successfulSubCalls: number): void {
  if (successfulSubCalls === 0) throw new Error('All Research provider sub-calls failed')
}

function parseContradictions(value: unknown): ResearchOutput['contradictions'] {
  return parseModelList(value, item => {
    const topic = modelText(item.topic, 240)
    const description = modelText(item.description, 12_000)
    if (!topic || !description) return null
    return {
      topic,
      claim_ref: modelNullableText(item.claim_ref, 240),
      description,
      severity: modelEnum(item.severity, ['material', 'minor'], 'minor'),
      evidence_source_ids: modelStringList(item.evidence_source_ids, 80, 40),
    }
  })
}

function parseResearchGaps(value: unknown): ResearchOutput['research_gaps'] {
  return parseModelList(value, item => {
    const topic = modelText(item.topic, 240)
    const rationale = modelText(item.rationale, 8_000)
    if (!topic || !rationale) return null
    return {
      topic,
      rationale,
      criticality: modelEnum(item.criticality, ['blocker', 'important', 'nice_to_have'], 'important'),
    }
  })
}

function parseNamedByCompany(value: unknown): ResearchOutput['competitive_map']['named_by_company'] {
  return parseModelList(value, item => {
    const name = modelText(item.name, 240)
    const note = modelText(item.note, 4_000)
    return name && note ? { name, note } : null
  })
}

function parseNamedByResearch(value: unknown): ResearchOutput['competitive_map']['named_by_research'] {
  return parseModelList(value, item => {
    const name = modelText(item.name, 240)
    const rationale = modelText(item.rationale, 8_000)
    if (!name || !rationale) return null
    return {
      name,
      rationale,
      sources: parseNamedSources(item.sources),
      evidence_source_ids: modelStringList(item.evidence_source_ids, 80, 40),
    }
  })
}

function parseResearchFounderDossiers(value: unknown): ResearchOutput['founder_dossiers'] {
  return parseModelList(value, item => {
    const founderName = modelText(item.founder_name, 240)
    const role = modelText(item.role, 240)
    const summary = modelText(item.background_summary, 12_000)
    if (!founderName || !role || summary === null) return null
    return {
      founder_name: founderName,
      role,
      background_summary: summary,
      sources: parseNamedSources(item.sources),
      evidence_source_ids: modelStringList(item.evidence_source_ids, 80, 40),
      open_questions: modelStringList(item.open_questions, 2_000, 40),
    }
  })
}

function parseModelList<T>(value: unknown, parser: (item: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_MODEL_ITEMS).flatMap(item => {
    if (!isRecord(item)) return []
    const parsed = parser(item)
    return parsed === null ? [] : [parsed]
  })
}

function parseFindingSources(value: unknown): ResearchOutput['findings'][number]['sources'] {
  return parseModelList(value, item => {
    const title = modelText(item.title, 500)
    if (!title) return null
    return {
      title,
      url: modelPublicUrl(item.url),
      tier: modelEnum(item.tier, ['tier_1', 'tier_2', 'tier_3'], 'tier_3'),
    }
  })
}

function parseNamedSources(value: unknown): Array<{ title: string; url: string | null }> {
  return parseModelList(value, item => {
    const title = modelText(item.title, 500)
    return title ? { title, url: modelPublicUrl(item.url) } : null
  })
}

function modelText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const result = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
  return result.length > 0 && result.length <= maxLength ? result : null
}

function modelNullableText(value: unknown, maxLength: number): string | null {
  return value === null || value === undefined ? null : modelText(value, maxLength)
}

function modelStringList(value: unknown, maxLength: number, maxItems: number): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.slice(0, maxItems).flatMap(item => {
    const text = modelText(item, maxLength)
    return text ? [text] : []
  })))
}

function modelEnum<const T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback
}

function modelPublicUrl(value: unknown): string | null {
  const text = modelText(value, 2_048)
  if (!text) return null
  try {
    const url = new URL(text)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
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

async function loadMemoPublicSearchUrl(
  admin: Admin,
  fundId: string,
  dealId: string,
  ingestion: IngestionOutput,
): Promise<string | null> {
  const { data } = await admin
    .from('inbound_deals')
    .select('company_url, created_at')
    .eq('fund_id', fundId)
    .eq('promoted_diligence_id', dealId)
    .not('company_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const candidate = validatedPublicCompanyUrl((data as { company_url: string | null } | null)?.company_url ?? null)
  if (!candidate) return null
  const candidateHostname = new URL(candidate).hostname
  return ingestionPublicWebsiteHostnames(ingestion).has(candidateHostname) ? candidate : null
}

export function validatedPublicCompanyUrl(value: string | null): string | null {
  if (!value || value.length > 2_048 || /[\u0000-\u001f\u007f]/.test(value)) return null
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null
    const hostname = url.hostname.toLowerCase()
    if (!isPublicSearchHostname(hostname)) return null
    return `${url.protocol}//${hostname}`
  } catch {
    return null
  }
}

function ingestionPublicWebsiteHostnames(ingestion: IngestionOutput): ReadonlySet<string> {
  const hostnames = ingestion.documents
    .filter(document => document.detected_type !== 'industry_expert')
    .flatMap(document => document.claims)
    .filter(claim => /website|company.?url|homepage|domain/i.test(`${claim.field} ${claim.context}`))
    .flatMap(claim => {
      const url = validatedPublicCompanyUrl(claim.value)
      return url ? [new URL(url).hostname] : []
    })
  return new Set(hostnames)
}

function backgroundAttemptSignal(parent: AbortSignal | undefined, leaseExpiresAt: string | undefined): AbortSignal | undefined {
  if (!leaseExpiresAt) return parent
  const remaining = Date.parse(leaseExpiresAt) - Date.now()
  const leaseSignal = remaining > 0 && Number.isFinite(remaining)
    ? AbortSignal.timeout(remaining)
    : AbortSignal.abort()
  return parent ? AbortSignal.any([parent, leaseSignal]) : leaseSignal
}

export function shouldRethrowResearchError(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
    || (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError')
}
