import {
  FEED_SEARCH_LIMIT,
  MAX_SEARCH_RESULTS,
  SPECIALIZED_SEARCH_LIMIT,
  SPECIALIZED_SOURCE_IDS,
  WEB_SEARCH_LIMIT,
  type SearchOrigin,
  type SearchRequest,
  type SearchResponse,
  type SearchSourceId,
  type SearchSourceState,
  type SearchSourceStatus,
} from './contracts'
import { mergeSearchCandidates } from './merge'
import {
  normalizeProviderError,
  SearchProviderError,
  type FeedSearchProvider,
  type SearchCandidate,
  type SearchContext,
  type SearchProviderResults,
  type SpecializedSearchProvider,
  type WebSearchProvider,
} from './provider-contracts'
import { SEARCH_UPSTREAM_TIMEOUT_MS } from './source-policy'

const MAX_PROVIDER_TIMEOUT_MS = 60_000
const MAX_SPECIALIZED_BOUNDARY_TIMEOUT_MS = 125_000
const SUCCESS_STATES = new Set<SearchSourceState>(['ok', 'empty'])
const SOURCE_STATES = new Set<SearchSourceState>([
  'ok',
  'empty',
  'partial',
  'unavailable',
  'timeout',
  'rate_limited',
  'invalid_response',
  'failed',
])

export interface SearchServiceOptions {
  readonly feedProvider?: FeedSearchProvider
  readonly webProvider?: WebSearchProvider
  readonly specializedProvider?: SpecializedSearchProvider
  readonly timeoutMs?: number
}

export interface SearchExecutionContext {
  readonly fundId: string
  readonly userId: string
  readonly signal?: AbortSignal
}

interface BoundaryOutcome {
  readonly candidates: readonly SearchCandidate[]
  readonly statuses: readonly SearchSourceStatus[]
}

interface BoundaryExecution {
  readonly sourceIds: readonly SearchSourceId[]
  readonly timeoutMs: number
  readonly execute: (signal: AbortSignal) => Promise<SearchProviderResults> | null
}

export class SearchService {
  private readonly timeoutMs: number

  constructor(private readonly options: SearchServiceOptions) {
    this.timeoutMs = parseTimeout(options.timeoutMs)
  }

  async search(
    request: SearchRequest,
    context: SearchExecutionContext,
  ): Promise<SearchResponse> {
    const parentSignal = context.signal ?? new AbortController().signal
    const executions = this.buildExecutions(request, context)
    const settled = await Promise.allSettled(executions.map(execution => (
      this.executeBoundary(execution, parentSignal)
    )))
    const outcomes = settled.map((result, index) => (
      result.status === 'fulfilled'
        ? result.value
        : failedOutcome(executions[index].sourceIds, result.reason)
    ))
    const selectedSourceIds = selectedSources(request)
    const allCandidates = outcomes.flatMap(outcome => outcome.candidates)
    const allStatuses = outcomes.flatMap(outcome => outcome.statuses)
    const sources = Object.freeze(selectedSourceIds.map(sourceId => (
      allStatuses.find(status => status.id === sourceId) ?? invalidStatus(sourceId)
    )))
    const results = Object.freeze(
      mergeSearchCandidates(allCandidates).slice(0, MAX_SEARCH_RESULTS),
    )

    return Object.freeze({
      results,
      sources,
      partial: sources.some(source => !SUCCESS_STATES.has(source.status)),
    })
  }

  private buildExecutions(
    request: SearchRequest,
    executionContext: SearchExecutionContext,
  ): readonly BoundaryExecution[] {
    const commonContext = (signal: AbortSignal): SearchContext => Object.freeze({
      fundId: executionContext.fundId,
      userId: executionContext.userId,
      signal,
    })
    const feed = request.sources.feeds
      ? [Object.freeze({
          sourceIds: Object.freeze(['feeds'] as const),
          timeoutMs: this.timeoutMs,
          execute: (signal: AbortSignal) => this.options.feedProvider?.search(
            Object.freeze({ query: request.query }),
            commonContext(signal),
          ) ?? null,
        })]
      : []
    const professionalSources = Object.freeze(
      SPECIALIZED_SOURCE_IDS.filter(id => request.sources.specialized.includes(id)),
    )
    const specialized = professionalSources.length > 0
      ? [Object.freeze({
          sourceIds: professionalSources,
          timeoutMs: specializedBoundaryTimeout(this.timeoutMs),
          execute: (signal: AbortSignal) => this.options.specializedProvider?.search(
            Object.freeze({ query: request.query, sources: professionalSources }),
            commonContext(signal),
          ) ?? null,
        })]
      : []
    const web = request.sources.web
      ? [Object.freeze({
          sourceIds: Object.freeze(['web'] as const),
          timeoutMs: this.timeoutMs,
          execute: (signal: AbortSignal) => this.options.webProvider?.search(
            Object.freeze({ query: request.query }),
            commonContext(signal),
          ) ?? null,
        })]
      : []
    return Object.freeze([...feed, ...specialized, ...web])
  }

  private async executeBoundary(
    execution: BoundaryExecution,
    parentSignal: AbortSignal,
  ): Promise<BoundaryOutcome> {
    const deadline = providerDeadline(parentSignal, execution.timeoutMs)
    try {
      const providerPromise = execution.execute(deadline.signal)
      if (!providerPromise) return unavailableOutcome(execution.sourceIds)
      const providerResults = await Promise.race([providerPromise, deadline.expired])
      return normalizeBoundaryResults(execution.sourceIds, providerResults)
    } finally {
      deadline.dispose()
    }
  }
}

function normalizeBoundaryResults(
  sourceIds: readonly SearchSourceId[],
  value: SearchProviderResults,
): BoundaryOutcome {
  if (
    typeof value !== 'object'
    || value === null
    || !Array.isArray(value.candidates)
    || !Array.isArray(value.statuses)
    || !hasExactStatusSet(value.statuses, sourceIds)
  ) {
    throw new SearchProviderError(
      'invalid_response',
      'Provider returned an invalid result collection',
      { retryable: false },
    )
  }

  const candidates = Object.freeze(sourceIds.flatMap(sourceId => (
    value.candidates
      .filter(candidate => isCandidateForSource(candidate, sourceId))
      .slice(0, sourceLimit(sourceId))
  )))
  const statuses = Object.freeze(sourceIds.map(sourceId => {
    const original = value.statuses.find(status => status.id === sourceId)
    if (!original || !SOURCE_STATES.has(original.status)) return invalidStatus(sourceId)
    const resultCount = candidates.filter(candidate => candidate.source.id === sourceId).length
    const status = normalizeSuccessState(original.status, resultCount)
    return safeStatus(sourceId, status, resultCount, original.retryable)
  }))
  return Object.freeze({ candidates, statuses })
}

function hasExactStatusSet(
  statuses: readonly SearchSourceStatus[],
  sourceIds: readonly SearchSourceId[],
): boolean {
  return statuses.length === sourceIds.length
    && sourceIds.every(sourceId => statuses.filter(status => status?.id === sourceId).length === 1)
}

function isCandidateForSource(
  value: unknown,
  sourceId: SearchSourceId,
): value is SearchCandidate {
  if (typeof value !== 'object' || value === null || !('source' in value) || !('origin' in value)) {
    return false
  }
  const candidate = value as Partial<SearchCandidate>
  return candidate.source?.id === sourceId && candidate.origin === expectedOrigin(sourceId)
}

function expectedOrigin(sourceId: SearchSourceId): SearchOrigin {
  if (sourceId === 'feeds') return 'feed'
  if (sourceId === 'web') return 'web'
  return 'specialized'
}

function sourceLimit(sourceId: SearchSourceId): number {
  if (sourceId === 'feeds') return FEED_SEARCH_LIMIT
  if (sourceId === 'web') return WEB_SEARCH_LIMIT
  return SPECIALIZED_SEARCH_LIMIT
}

function normalizeSuccessState(
  status: SearchSourceState,
  resultCount: number,
): SearchSourceState {
  if (status !== 'ok' && status !== 'empty') return status
  return resultCount > 0 ? 'ok' : 'empty'
}

function failedOutcome(
  sourceIds: readonly SearchSourceId[],
  error: unknown,
): BoundaryOutcome {
  const normalized = normalizeProviderError(error)
  const statuses = Object.freeze(sourceIds.map(sourceId => Object.freeze({
    id: sourceId,
    status: normalized.code,
    resultCount: 0,
    retryable: normalized.retryable,
    message: normalized.message,
  })))
  return Object.freeze({ candidates: Object.freeze([]), statuses })
}

function unavailableOutcome(sourceIds: readonly SearchSourceId[]): BoundaryOutcome {
  return Object.freeze({
    candidates: Object.freeze([]),
    statuses: Object.freeze(sourceIds.map(sourceId => safeStatus(
      sourceId,
      'unavailable',
      0,
      false,
    ))),
  })
}

function invalidStatus(sourceId: SearchSourceId): SearchSourceStatus {
  return safeStatus(sourceId, 'invalid_response', 0, false)
}

function safeStatus(
  sourceId: SearchSourceId,
  status: SearchSourceState,
  resultCount: number,
  retryable?: boolean,
): SearchSourceStatus {
  if (status === 'ok' || status === 'empty') {
    return Object.freeze({ id: sourceId, status, resultCount })
  }
  if (status === 'partial') {
    return Object.freeze({
      id: sourceId,
      status,
      resultCount,
      ...(typeof retryable === 'boolean' ? { retryable } : {}),
      message: 'Some results may be missing because part of this source was unavailable.',
    })
  }
  const normalized = normalizeProviderError(new SearchProviderError(status, 'Private provider detail', {
    retryable: retryable ?? defaultRetryable(status),
  }))
  return Object.freeze({
    id: sourceId,
    status,
    resultCount,
    retryable: normalized.retryable,
    message: normalized.message,
  })
}

function defaultRetryable(status: Exclude<SearchSourceState, 'ok' | 'empty' | 'partial'>): boolean {
  return status !== 'unavailable' && status !== 'invalid_response'
}

function selectedSources(request: SearchRequest): readonly SearchSourceId[] {
  return Object.freeze([
    ...(request.sources.feeds ? ['feeds' as const] : []),
    ...SPECIALIZED_SOURCE_IDS.filter(id => request.sources.specialized.includes(id)),
    ...(request.sources.web ? ['web' as const] : []),
  ])
}

function parseTimeout(value: number | undefined): number {
  const timeout = value ?? SEARCH_UPSTREAM_TIMEOUT_MS
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_PROVIDER_TIMEOUT_MS) {
    throw new Error(`Search provider timeout must be between 1 and ${MAX_PROVIDER_TIMEOUT_MS} milliseconds.`)
  }
  return timeout
}

/**
 * Up to five professional adapters run with concurrency three, so two adapter
 * waves may be needed. Keep the provider boundary longer than those individual
 * deadlines; otherwise a late timeout would discard earlier successful sources.
 */
function specializedBoundaryTimeout(baseTimeoutMs: number): number {
  return Math.min(
    MAX_SPECIALIZED_BOUNDARY_TIMEOUT_MS,
    (baseTimeoutMs * 2) + Math.min(1_000, baseTimeoutMs),
  )
}

function providerDeadline(parent: AbortSignal, timeoutMs: number): {
  readonly signal: AbortSignal
  readonly expired: Promise<never>
  readonly dispose: () => void
} {
  const controller = new AbortController()
  let rejectExpired: (error: SearchProviderError) => void = () => undefined
  const expired = new Promise<never>((_resolve, reject) => { rejectExpired = reject })
  const expire = () => {
    if (controller.signal.aborted) return
    controller.abort(new DOMException('Search provider deadline reached', 'TimeoutError'))
    rejectExpired(new SearchProviderError('timeout', 'Search provider timed out', { retryable: true }))
  }
  const abortFromParent = () => expire()
  if (parent.aborted) expire()
  else parent.addEventListener('abort', abortFromParent, { once: true })
  const timer = setTimeout(expire, timeoutMs)
  return Object.freeze({
    signal: controller.signal,
    expired,
    dispose: () => {
      clearTimeout(timer)
      parent.removeEventListener('abort', abortFromParent)
    },
  })
}
