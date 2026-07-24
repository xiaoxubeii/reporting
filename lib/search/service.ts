import type { SearchCategoryConfig } from './categories'
import { resolveSearchCategories } from './categories'
import { AdapterExecutor, type SearchMetricSink } from './adapter-executor'
import { AdapterRegistry } from './adapter-registry'
import {
  MAX_SEARCH_RESULTS,
  type SearchRequest,
  type SearchResponse,
  type SearchSourceState,
} from './contracts'
import { mergeSearchCandidates } from './merge'

const SUCCESS_STATES = new Set<SearchSourceState>(['ok', 'empty'])

export interface SearchServiceOptions {
  readonly categories: SearchCategoryConfig
  readonly registry: AdapterRegistry
  readonly timeoutMs?: number
  readonly maxConcurrency?: number
  readonly metricSink?: SearchMetricSink
}

export interface SearchExecutionContext {
  readonly fundId: string
  readonly userId: string
  readonly signal?: AbortSignal
}

export class SearchService {
  private readonly executor: AdapterExecutor

  constructor(private readonly options: SearchServiceOptions) {
    this.executor = new AdapterExecutor(options.registry, {
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.maxConcurrency ? { maxConcurrency: options.maxConcurrency } : {}),
      ...(options.metricSink ? { metricSink: options.metricSink } : {}),
    })
  }

  async search(request: SearchRequest, context: SearchExecutionContext): Promise<SearchResponse> {
    const adapterIds = resolveSearchCategories(
      this.options.categories,
      request.categoryIds,
      this.options.registry.ids(),
    )
    const outcome = await this.executor.execute(adapterIds, request.query, context)
    const results = Object.freeze(mergeSearchCandidates(outcome.candidates).slice(0, MAX_SEARCH_RESULTS))
    return Object.freeze({
      results,
      sources: outcome.statuses,
      partial: outcome.statuses.some(source => !SUCCESS_STATES.has(source.status)),
    })
  }
}
