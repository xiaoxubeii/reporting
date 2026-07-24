import type { FeedEntry } from '@/lib/feeds/contracts'
import { FEED_SEARCH_LIMIT } from '../contracts'
import {
  getSearchAdapterDescriptor,
  SearchAdapterError,
  type SearchAdapter,
  type SearchAdapterRequest,
  type SearchAdapterResults,
  type SearchCandidate,
  type SearchContext,
} from '../adapter-contracts'

interface FeedQueryResult {
  readonly items: readonly FeedEntry[]
  readonly total: number
  readonly nextOffset: number | null
  readonly connected: boolean
  readonly hasSubscriptions: boolean
}

interface FeedQueryService {
  listEntries(params: {
    readonly userId: string
    readonly limit: number
    readonly offset: number
    readonly search: string | null
    readonly filter?: 'all' | 'unread' | 'saved'
    readonly signal?: AbortSignal
  }): Promise<FeedQueryResult>
}

const DESCRIPTOR = getSearchAdapterDescriptor('feeds')

export class MinifluxFeedSearchAdapter implements SearchAdapter {
  readonly descriptor = DESCRIPTOR

  constructor(private readonly service: FeedQueryService) {}

  async search(request: SearchAdapterRequest, context: SearchContext): Promise<SearchAdapterResults> {
    try {
      const result = await this.service.listEntries({
        userId: context.userId,
        limit: Math.min(request.limit, FEED_SEARCH_LIMIT),
        offset: 0,
        search: request.query,
        filter: 'all',
        signal: context.signal,
      })
      if (!result.connected) throw new SearchAdapterError('unavailable', 'Feeds are not connected', { retryable: false })
      if (!result.hasSubscriptions) return EMPTY_RESULTS
      return Object.freeze({
        candidates: Object.freeze(result.items.slice(0, request.limit).map(normalizeFeedCandidate)),
      })
    } catch (error) {
      if (error instanceof SearchAdapterError) throw error
      if (context.signal.aborted || isAbortError(error)) {
        throw new SearchAdapterError('timeout', 'Feed search timed out', { retryable: true })
      }
      const code = adapterCode(error)
      if (code === 'not_configured' || code === 'authentication') {
        throw new SearchAdapterError('unavailable', 'Feeds are not available', { retryable: false })
      }
      if (code === 'rate_limited') {
        throw new SearchAdapterError('rate_limited', 'Miniflux rate limited the request', { retryable: true })
      }
      if (code === 'invalid_response') {
        throw new SearchAdapterError('invalid_response', 'Miniflux returned an invalid response', { retryable: false })
      }
      throw new SearchAdapterError('failed', 'Feed search failed', { retryable: true })
    }
  }
}

const EMPTY_RESULTS: SearchAdapterResults = Object.freeze({ candidates: Object.freeze([]) })

function normalizeFeedCandidate(entry: FeedEntry): SearchCandidate {
  return Object.freeze({
    id: `feed:${entry.upstreamId}`,
    origin: 'feed' as const,
    title: entry.title,
    ...(entry.url ? { url: entry.url } : {}),
    ...(entry.summary ? { snippet: entry.summary } : {}),
    ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
    source: Object.freeze({ id: 'feeds' as const, label: entry.source.title }),
    feedEntryId: entry.upstreamId,
    isRead: entry.isRead,
    isSaved: entry.isSaved,
  })
}

function adapterCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error
    && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : null
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error
    && ((error as { name?: unknown }).name === 'AbortError'
      || (error as { name?: unknown }).name === 'TimeoutError')
}
