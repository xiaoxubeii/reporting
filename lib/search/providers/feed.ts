import type { FeedEntry } from '@/lib/feeds/contracts'
import { FEED_SEARCH_LIMIT } from '../contracts'
import {
  SearchProviderError,
  type FeedSearchProvider,
  type SearchCandidate,
  type SearchContext,
  type SearchProviderRequest,
  type SearchProviderResults,
} from '../provider-contracts'

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

export class MinifluxFeedSearchProvider implements FeedSearchProvider {
  constructor(private readonly service: FeedQueryService) {}

  async search(
    request: SearchProviderRequest,
    context: SearchContext,
  ): Promise<SearchProviderResults> {
    try {
      const result = await this.service.listEntries({
        userId: context.userId,
        limit: FEED_SEARCH_LIMIT,
        offset: 0,
        search: request.query,
        filter: 'all',
        signal: context.signal,
      })
      if (!result.connected) return feedState('unavailable')
      if (!result.hasSubscriptions) return feedState('empty')
      const candidates = result.items.slice(0, FEED_SEARCH_LIMIT).map(normalizeFeedCandidate)
      return Object.freeze({
        candidates: Object.freeze(candidates),
        statuses: Object.freeze([Object.freeze({
          id: 'feeds' as const,
          status: candidates.length > 0 ? 'ok' as const : 'empty' as const,
          resultCount: candidates.length,
        })]),
      })
    } catch (error) {
      if (context.signal.aborted || isAbortError(error)) {
        throw new SearchProviderError('timeout', 'Feed search timed out', { retryable: true })
      }
      const code = providerCode(error)
      if (code === 'not_configured' || code === 'authentication') {
        throw new SearchProviderError('unavailable', 'Feeds are not available', { retryable: false })
      }
      if (code === 'rate_limited') {
        throw new SearchProviderError('rate_limited', 'Miniflux rate limited the request', { retryable: true })
      }
      if (code === 'invalid_response') {
        throw new SearchProviderError('invalid_response', 'Miniflux returned an invalid response', { retryable: false })
      }
      throw new SearchProviderError('failed', 'Feed search failed', { retryable: true })
    }
  }
}

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

function feedState(status: 'empty' | 'unavailable'): SearchProviderResults {
  return Object.freeze({
    candidates: Object.freeze([]),
    statuses: Object.freeze([Object.freeze({
      id: 'feeds' as const,
      status,
      resultCount: 0,
      ...(status === 'unavailable'
        ? { retryable: false, message: 'Connect a personal Miniflux account to search Feeds.' }
        : {}),
    })]),
  })
}

function providerCode(error: unknown): string | null {
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
