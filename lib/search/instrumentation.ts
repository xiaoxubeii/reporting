import type { SearchSourceId } from './contracts'
import type {
  FeedSearchProvider,
  SearchProviderResults,
  SpecializedSearchProvider,
  WebSearchProvider,
} from './provider-contracts'

export interface SearchSourceMetric {
  readonly source: SearchSourceId
  readonly outcome: string
  readonly resultCount: number
  readonly durationMs: number
}

export type SearchMetricSink = (metric: SearchSourceMetric) => void

export function instrumentFeedProvider(provider: FeedSearchProvider, sink: SearchMetricSink): FeedSearchProvider {
  return { search: (request, context) => observed(provider.search(request, context), ['feeds'], sink) }
}

export function instrumentWebProvider(provider: WebSearchProvider, sink: SearchMetricSink): WebSearchProvider {
  return { search: (request, context) => observed(provider.search(request, context), ['web'], sink) }
}

export function instrumentSpecializedProvider(
  provider: SpecializedSearchProvider,
  sink: SearchMetricSink,
): SpecializedSearchProvider {
  return { search: (request, context) => observed(provider.search(request, context), request.sources, sink) }
}

async function observed(
  result: Promise<SearchProviderResults>,
  sourceIds: readonly SearchSourceId[],
  sink: SearchMetricSink,
): Promise<SearchProviderResults> {
  const startedAt = performance.now()
  try {
    const value = await result
    const durationMs = Math.round(performance.now() - startedAt)
    for (const sourceId of sourceIds) {
      const status = value.statuses.find(candidate => candidate.id === sourceId)
      sink(Object.freeze({
        source: sourceId,
        outcome: status?.status ?? 'invalid_response',
        resultCount: status?.resultCount ?? 0,
        durationMs,
      }))
    }
    return value
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt)
    for (const source of sourceIds) {
      sink(Object.freeze({ source, outcome: 'rejected', resultCount: 0, durationMs }))
    }
    throw error
  }
}
