import {
  normalizeAdapterError,
  SearchAdapterError,
  type SearchCandidate,
  type SearchContext,
} from './adapter-contracts'
import { AdapterRegistry } from './adapter-registry'
import {
  type SearchAdapterId,
  type SearchSourceStatus,
} from './contracts'
import { normalizeSearchCandidate } from './merge'
import { SEARCH_UPSTREAM_TIMEOUT_MS } from './source-policy'

const DEFAULT_MAX_CONCURRENCY = 3
const MAX_TIMEOUT_MS = 60_000

export interface AdapterExecutionResult {
  readonly candidates: readonly SearchCandidate[]
  readonly statuses: readonly SearchSourceStatus[]
}

export interface SearchSourceMetric {
  readonly source: SearchAdapterId
  readonly outcome: string
  readonly resultCount: number
  readonly durationMs: number
}

export type SearchMetricSink = (metric: SearchSourceMetric) => void

export class AdapterExecutor {
  private readonly timeoutMs: number
  private readonly maxConcurrency: number

  constructor(
    private readonly registry: AdapterRegistry,
    options: {
      readonly timeoutMs?: number
      readonly maxConcurrency?: number
      readonly metricSink?: SearchMetricSink
    } = {},
  ) {
    this.timeoutMs = boundedInteger(options.timeoutMs ?? SEARCH_UPSTREAM_TIMEOUT_MS, 1, MAX_TIMEOUT_MS, 'timeout')
    this.maxConcurrency = boundedInteger(options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY, 1, 20, 'concurrency')
    this.metricSink = options.metricSink
  }

  private readonly metricSink?: SearchMetricSink

  async execute(
    adapterIds: readonly SearchAdapterId[],
    query: string,
    context: Omit<SearchContext, 'signal'> & { readonly signal?: AbortSignal },
  ): Promise<AdapterExecutionResult> {
    const uniqueIds = adapterIds.filter((id, index) => adapterIds.indexOf(id) === index)
    const tasks = uniqueIds.map(adapterId => () => this.executeOne(adapterId, query, context))
    const outcomes = await executeWithConcurrency(tasks, this.maxConcurrency)
    return Object.freeze({
      candidates: Object.freeze(outcomes.flatMap(outcome => outcome.candidates)),
      statuses: Object.freeze(outcomes.map(outcome => outcome.status)),
    })
  }

  private async executeOne(
    adapterId: SearchAdapterId,
    query: string,
    context: Omit<SearchContext, 'signal'> & { readonly signal?: AbortSignal },
  ): Promise<AdapterOutcome> {
    const startedAt = performance.now()
    const adapter = this.registry.get(adapterId)
    if (!adapter || !adapter.descriptor.liveTransportAvailable) {
      const outcome = unavailableOutcome(adapterId)
      this.record(adapterId, outcome.status, startedAt)
      return outcome
    }
    const deadline = adapterDeadline(context.signal ?? new AbortController().signal, this.timeoutMs)
    try {
      const response = await Promise.race([
        adapter.search(Object.freeze({ query, limit: adapter.descriptor.resultLimit }), Object.freeze({
          fundId: context.fundId,
          userId: context.userId,
          signal: deadline.signal,
        })),
        deadline.expired,
      ])
      if (!response || !Array.isArray(response.candidates)) {
        throw new SearchAdapterError('invalid_response', 'Adapter returned an invalid collection', { retryable: false })
      }
      const boundedCandidates = response.candidates.slice(0, adapter.descriptor.resultLimit)
      if (boundedCandidates.some(candidate => (
        candidate?.source?.id !== adapterId || candidate.origin !== adapter.descriptor.origin
      ))) {
        throw new SearchAdapterError('invalid_response', 'Adapter returned a mismatched candidate', { retryable: false })
      }
      const candidates = Object.freeze(boundedCandidates.flatMap(candidate => {
        const normalized = normalizeSearchCandidate(candidate)
        return normalized ? [normalized] : []
      }))
      const outcome = Object.freeze({
        candidates,
        status: Object.freeze({
          id: adapterId,
          status: candidates.length > 0 ? 'ok' as const : 'empty' as const,
          resultCount: candidates.length,
        }),
      })
      this.record(adapterId, outcome.status, startedAt)
      return outcome
    } catch (error) {
      const normalized = normalizeAdapterError(error)
      const outcome = Object.freeze({
        candidates: Object.freeze([]),
        status: Object.freeze({
          id: adapterId,
          status: normalized.code,
          resultCount: 0,
          retryable: normalized.retryable,
          message: normalized.message,
        }),
      })
      this.record(adapterId, outcome.status, startedAt)
      return outcome
    } finally {
      deadline.dispose()
    }
  }

  private record(adapterId: SearchAdapterId, status: SearchSourceStatus, startedAt: number): void {
    this.metricSink?.(Object.freeze({
      source: adapterId,
      outcome: status.status,
      resultCount: status.resultCount,
      durationMs: Math.round(performance.now() - startedAt),
    }))
  }
}

interface AdapterOutcome {
  readonly candidates: readonly SearchCandidate[]
  readonly status: SearchSourceStatus
}

async function executeWithConcurrency<T>(
  tasks: readonly (() => Promise<T>)[],
  maxConcurrency: number,
): Promise<readonly T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(maxConcurrency, tasks.length) }, async () => {
    while (nextIndex < tasks.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await tasks[index]()
    }
  })
  await Promise.all(workers)
  return Object.freeze(results)
}

function unavailableOutcome(adapterId: SearchAdapterId): AdapterOutcome {
  return Object.freeze({
    candidates: Object.freeze([]),
    status: Object.freeze({
      id: adapterId,
      status: 'unavailable' as const,
      resultCount: 0,
      retryable: false,
      message: 'The source is not available for this search.',
    }),
  })
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Search adapter ${label} must be between ${minimum} and ${maximum}.`)
  }
  return value
}

function adapterDeadline(parent: AbortSignal, timeoutMs: number): {
  readonly signal: AbortSignal
  readonly expired: Promise<never>
  readonly dispose: () => void
} {
  const controller = new AbortController()
  let rejectExpired: (error: SearchAdapterError) => void = () => undefined
  const expired = new Promise<never>((_resolve, reject) => { rejectExpired = reject })
  const expire = () => {
    if (controller.signal.aborted) return
    controller.abort(new DOMException('Search adapter deadline reached', 'TimeoutError'))
    rejectExpired(new SearchAdapterError('timeout', 'Search adapter timed out', { retryable: true }))
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
