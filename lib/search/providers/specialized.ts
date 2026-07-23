import {
  SPECIALIZED_SEARCH_LIMIT,
  SPECIALIZED_SOURCE_IDS,
  SearchContractError,
  type SearchSourceStatus,
  type SpecializedSourceId,
} from '../contracts'
import {
  normalizeProviderError,
  SearchProviderError,
  SPECIALIZED_SOURCE_DESCRIPTORS,
  type SearchCandidate,
  type SearchContext,
  type SearchProviderResults,
  type SpecializedSearchProvider,
  type SpecializedSearchRequest,
  type SpecializedSourceAdapter,
  type SpecializedSourceDescriptor,
} from '../provider-contracts'
import type { SearchSourcePolicy } from '../source-policy'

const DEFAULT_MAX_CONCURRENCY = 3

export type SearchSourcePolicyResolver = (
  fundId: string,
) => SearchSourcePolicy | Promise<SearchSourcePolicy>

interface SpecializedProviderOptions {
  readonly maxConcurrency?: number
}

interface SourceOutcome {
  readonly sourceId: SpecializedSourceId
  readonly candidates: readonly SearchCandidate[]
  readonly status: SearchSourceStatus
}

export class DirectSpecializedSearchProvider implements SpecializedSearchProvider {
  private readonly adapters: ReadonlyMap<SpecializedSourceId, SpecializedSourceAdapter>
  private readonly maxConcurrency: number

  constructor(
    registry: readonly SpecializedSourceAdapter[],
    private readonly resolvePolicy: SearchSourcePolicyResolver,
    options: SpecializedProviderOptions = {},
  ) {
    this.adapters = buildFixedRegistry(registry)
    this.maxConcurrency = parseMaxConcurrency(options.maxConcurrency)
  }

  async search(
    request: SpecializedSearchRequest,
    context: SearchContext,
  ): Promise<SearchProviderResults> {
    const selected = canonicalSourceSelection(request.sources)
    if (selected.length === 0) return emptyResults()

    const policy = await this.loadPolicy(context.fundId, selected)
    if ('outcomes' in policy) return resultsFrom(policy.outcomes)

    const tasks = selected.map(sourceId => async (): Promise<SourceOutcome> => {
      if (policy.value.specialized[sourceId] !== true) return disabledOutcome(sourceId)
      if (!liveTransportAvailable(sourceId)) return transportUnavailableOutcome(sourceId)
      return this.executeAdapter(sourceId, request.query, context)
    })
    const outcomes = await executeWithConcurrency(tasks, this.maxConcurrency)
    return resultsFrom(outcomes)
  }

  private async loadPolicy(
    fundId: string,
    selected: readonly SpecializedSourceId[],
  ): Promise<
    | { readonly value: SearchSourcePolicy }
    | { readonly outcomes: readonly SourceOutcome[] }
  > {
    try {
      return Object.freeze({ value: await this.resolvePolicy(fundId) })
    } catch {
      return Object.freeze({
        outcomes: Object.freeze(selected.map(policyUnavailableOutcome)),
      })
    }
  }

  private async executeAdapter(
    sourceId: SpecializedSourceId,
    query: string,
    context: SearchContext,
  ): Promise<SourceOutcome> {
    const adapter = this.adapters.get(sourceId)
    if (!adapter) return policyUnavailableOutcome(sourceId)

    try {
      const response = await adapter.search(Object.freeze({
        query,
        limit: SPECIALIZED_SEARCH_LIMIT,
      }), context)
      if (!response || !Array.isArray(response.candidates)) {
        throw new SearchProviderError(
          'invalid_response',
          'Professional source returned an invalid result collection',
          { retryable: false },
        )
      }
      const candidates = Object.freeze(response.candidates.slice(0, SPECIALIZED_SEARCH_LIMIT))
      return Object.freeze({
        sourceId,
        candidates,
        status: Object.freeze({
          id: sourceId,
          status: candidates.length > 0 ? 'ok' as const : 'empty' as const,
          resultCount: candidates.length,
        }),
      })
    } catch (error) {
      const normalized = normalizeProviderError(error)
      return Object.freeze({
        sourceId,
        candidates: Object.freeze([]),
        status: Object.freeze({
          id: sourceId,
          status: normalized.code,
          resultCount: 0,
          retryable: normalized.retryable,
          message: normalized.message,
        }),
      })
    }
  }
}

function buildFixedRegistry(
  registry: readonly SpecializedSourceAdapter[],
): ReadonlyMap<SpecializedSourceId, SpecializedSourceAdapter> {
  if (registry.length !== SPECIALIZED_SOURCE_DESCRIPTORS.length) {
    throw new Error('Specialized adapter registry must contain exactly the fixed professional source catalog.')
  }

  const adaptersById = new Map<string, SpecializedSourceAdapter>()
  for (const adapter of registry) {
    if (adaptersById.has(adapter.descriptor.id)) {
      throw new Error('Specialized adapter registry must contain exactly the fixed professional source catalog.')
    }
    adaptersById.set(adapter.descriptor.id, adapter)
  }

  const canonicalEntries = SPECIALIZED_SOURCE_DESCRIPTORS.map(descriptor => {
    const adapter = adaptersById.get(descriptor.id)
    if (!adapter) {
      throw new Error('Specialized adapter registry must contain exactly the fixed professional source catalog.')
    }
    assertCanonicalDescriptor(adapter.descriptor, descriptor)
    return Object.freeze([descriptor.id, adapter] as const)
  })

  return new Map(canonicalEntries)
}

function assertCanonicalDescriptor(
  actual: SpecializedSourceDescriptor,
  expected: SpecializedSourceDescriptor,
): void {
  if (
    actual.id !== expected.id
    || actual.label !== expected.label
    || actual.adapterType !== expected.adapterType
    || actual.liveTransportAvailable !== expected.liveTransportAvailable
  ) {
    throw new Error(`Specialized adapter ${expected.id} must use its canonical descriptor.`)
  }
}

function liveTransportAvailable(sourceId: SpecializedSourceId): boolean {
  return SPECIALIZED_SOURCE_DESCRIPTORS.find(descriptor => descriptor.id === sourceId)
    ?.liveTransportAvailable === true
}

function canonicalSourceSelection(
  sources: readonly SpecializedSourceId[],
): readonly SpecializedSourceId[] {
  if (!Array.isArray(sources)) {
    throw new SearchContractError('Professional source selection must be an array.')
  }
  const selected = new Set<string>()
  for (const source of sources) {
    if (typeof source !== 'string' || !isSpecializedSourceId(source)) {
      throw new SearchContractError('An unsupported professional source was selected.')
    }
    if (selected.has(source)) {
      throw new SearchContractError('Each professional source may be selected only once.')
    }
    selected.add(source)
  }
  return Object.freeze(SPECIALIZED_SOURCE_IDS.filter(source => selected.has(source)))
}

function isSpecializedSourceId(value: string): value is SpecializedSourceId {
  return (SPECIALIZED_SOURCE_IDS as readonly string[]).includes(value)
}

function parseMaxConcurrency(value: number | undefined): number {
  const maxConcurrency = value ?? DEFAULT_MAX_CONCURRENCY
  if (
    !Number.isInteger(maxConcurrency)
    || maxConcurrency < 1
    || maxConcurrency > SPECIALIZED_SOURCE_IDS.length
  ) {
    throw new Error(`Professional source concurrency must be between 1 and ${SPECIALIZED_SOURCE_IDS.length}.`)
  }
  return maxConcurrency
}

interface IndexedOutcome {
  readonly index: number
  readonly outcome: SourceOutcome
  readonly token: symbol
}

interface RunningTask {
  readonly token: symbol
  readonly promise: Promise<IndexedOutcome>
}

/**
 * Work-conserving immutable scheduler: whenever one adapter finishes, the next
 * pending adapter starts immediately instead of waiting for an entire batch.
 * Outcomes are sorted back to canonical source order after all work settles.
 */
async function executeWithConcurrency(
  tasks: readonly (() => Promise<SourceOutcome>)[],
  maxConcurrency: number,
): Promise<readonly SourceOutcome[]> {
  let pending = Object.freeze(tasks.map((task, index) => Object.freeze({ task, index })))
  let running: readonly RunningTask[] = Object.freeze([])
  let completed: readonly IndexedOutcome[] = Object.freeze([])

  while (pending.length > 0 || running.length > 0) {
    const capacity = Math.max(0, maxConcurrency - running.length)
    const starting = pending.slice(0, capacity).map(({ task, index }) => startTask(task, index))
    pending = Object.freeze(pending.slice(capacity))
    running = Object.freeze([...running, ...starting])

    const next = await Promise.race(running.map(entry => entry.promise))
    completed = Object.freeze([...completed, next])
    running = Object.freeze(running.filter(entry => entry.token !== next.token))
  }

  return Object.freeze(
    [...completed]
      .sort((left, right) => left.index - right.index)
      .map(entry => entry.outcome),
  )
}

function startTask(
  task: () => Promise<SourceOutcome>,
  index: number,
): RunningTask {
  const token = Symbol(`professional-source-${index}`)
  return Object.freeze({
    token,
    promise: task().then(outcome => Object.freeze({ index, outcome, token })),
  })
}

function disabledOutcome(sourceId: SpecializedSourceId): SourceOutcome {
  return Object.freeze({
    sourceId,
    candidates: Object.freeze([]),
    status: Object.freeze({
      id: sourceId,
      status: 'unavailable' as const,
      resultCount: 0,
      retryable: false,
      message: 'This professional source is not enabled for this fund.',
    }),
  })
}

function transportUnavailableOutcome(sourceId: SpecializedSourceId): SourceOutcome {
  return Object.freeze({
    sourceId,
    candidates: Object.freeze([]),
    status: Object.freeze({
      id: sourceId,
      status: 'unavailable' as const,
      resultCount: 0,
      retryable: false,
      message: 'This professional source has no approved live transport.',
    }),
  })
}

function policyUnavailableOutcome(sourceId: SpecializedSourceId): SourceOutcome {
  return Object.freeze({
    sourceId,
    candidates: Object.freeze([]),
    status: Object.freeze({
      id: sourceId,
      status: 'unavailable' as const,
      resultCount: 0,
      retryable: true,
      message: 'Professional source availability could not be verified.',
    }),
  })
}

function resultsFrom(outcomes: readonly SourceOutcome[]): SearchProviderResults {
  return Object.freeze({
    candidates: Object.freeze(outcomes.flatMap(outcome => outcome.candidates)),
    statuses: Object.freeze(outcomes.map(outcome => outcome.status)),
  })
}

function emptyResults(): SearchProviderResults {
  return Object.freeze({
    candidates: Object.freeze([]),
    statuses: Object.freeze([]),
  })
}
