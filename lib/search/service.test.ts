import { describe, expect, it, vi } from 'vitest'
import type { SearchRequest, SearchSourceId, SearchSourceStatus } from './contracts'
import {
  SearchProviderError,
  type FeedSearchProvider,
  type SearchCandidate,
  type SearchContext,
  type SearchProviderRequest,
  type SearchProviderResults,
  type SpecializedSearchProvider,
  type WebSearchProvider,
} from './provider-contracts'
import { SearchService } from './service'

const BASE_REQUEST: SearchRequest = Object.freeze({
  query: 'heart valve',
  sources: Object.freeze({
    feeds: true,
    web: true,
    specialized: Object.freeze(['pubmed'] as const),
  }),
})

function candidate(
  id: string,
  sourceId: SearchSourceId,
  overrides: Partial<SearchCandidate> = {},
): SearchCandidate {
  const origin = sourceId === 'feeds' ? 'feed' : sourceId === 'web' ? 'web' : 'specialized'
  return Object.freeze({
    id,
    origin,
    title: `Result ${id}`,
    url: `https://example.com/${id}`,
    source: Object.freeze({ id: sourceId, label: sourceId }),
    ...(sourceId === 'feeds' ? { feedEntryId: Number(id.match(/\d+/)?.[0] ?? 1) } : {}),
    ...overrides,
  })
}

function results(
  candidates: readonly SearchCandidate[],
  statuses: readonly SearchSourceStatus[],
): SearchProviderResults {
  return Object.freeze({
    candidates: Object.freeze([...candidates]),
    statuses: Object.freeze(statuses.map(status => Object.freeze({ ...status }))),
  })
}

function context(signal?: AbortSignal) {
  return Object.freeze({ fundId: 'fund-1', userId: 'user-1', ...(signal ? { signal } : {}) })
}

describe('SearchService', () => {
  it('starts the three selected provider boundaries concurrently and merges native results', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    const started: string[] = []
    const makeSearch = (id: SearchSourceId) => vi.fn(async (
      receivedRequest: SearchProviderRequest,
      receivedContext: SearchContext,
    ) => {
      void receivedRequest
      void receivedContext
      started.push(id)
      await gate
      return results(
        [candidate(`${id}-1`, id)],
        [{ id, status: 'ok', resultCount: 1 }],
      )
    })
    const feedSearch = makeSearch('feeds')
    const webSearch = makeSearch('web')
    const specializedSearch = makeSearch('pubmed')
    const service = new SearchService({
      feedProvider: { search: feedSearch } satisfies FeedSearchProvider,
      webProvider: { search: webSearch } satisfies WebSearchProvider,
      specializedProvider: { search: specializedSearch } satisfies SpecializedSearchProvider,
      timeoutMs: 250,
    })

    const pending = service.search(BASE_REQUEST, context())
    await vi.waitFor(() => expect(started).toHaveLength(3))
    expect(started).toEqual(['feeds', 'pubmed', 'web'])
    release?.()

    const response = await pending
    expect(response.results.map(result => result.id)).toEqual(['feeds-1', 'pubmed-1', 'web-1'])
    expect(response.sources.map(source => source.id)).toEqual(['feeds', 'pubmed', 'web'])
    expect(response.partial).toBe(false)
    expect(feedSearch.mock.calls[0][1]).toMatchObject({ fundId: 'fund-1', userId: 'user-1' })
    expect(specializedSearch.mock.calls[0][0]).toEqual({
      query: 'heart valve',
      sources: ['pubmed'],
    })
  })

  it('uses all-settled behavior and exposes only deterministic public source errors', async () => {
    const service = new SearchService({
      feedProvider: {
        search: async () => results(
          [candidate('feed-1', 'feeds')],
          [{ id: 'feeds', status: 'ok', resultCount: 1 }],
        ),
      },
      webProvider: {
        search: async () => { throw new Error('secret upstream hostname and query') },
      },
      specializedProvider: {
        search: async () => {
          throw new SearchProviderError('rate_limited', 'secret vendor quota detail', { retryable: true })
        },
      },
    })

    const response = await service.search(BASE_REQUEST, context())

    expect(response.results.map(result => result.id)).toEqual(['feed-1'])
    expect(response.sources).toEqual([
      { id: 'feeds', status: 'ok', resultCount: 1 },
      {
        id: 'pubmed',
        status: 'rate_limited',
        resultCount: 0,
        retryable: true,
        message: 'The source is temporarily rate-limited. Try again shortly.',
      },
      {
        id: 'web',
        status: 'failed',
        resultCount: 0,
        retryable: true,
        message: 'The source could not be searched. Try again shortly.',
      },
    ])
    expect(JSON.stringify(response)).not.toContain('secret')
    expect(response.partial).toBe(true)
  })

  it('enforces an independent deadline even when a provider ignores cancellation', async () => {
    let webSignal: AbortSignal | undefined
    const never = new Promise<SearchProviderResults>(() => undefined)
    const service = new SearchService({
      feedProvider: {
        search: async () => results([], [{ id: 'feeds', status: 'empty', resultCount: 0 }]),
      },
      webProvider: {
        search: async (_request, receivedContext) => {
          webSignal = receivedContext.signal
          return never
        },
      },
      timeoutMs: 15,
    })
    const request: SearchRequest = {
      query: 'device',
      sources: { feeds: true, web: true, specialized: [] },
    }

    const startedAt = Date.now()
    const response = await service.search(request, context())

    expect(Date.now() - startedAt).toBeLessThan(250)
    expect(webSignal?.aborted).toBe(true)
    expect(response.sources).toEqual([
      { id: 'feeds', status: 'empty', resultCount: 0 },
      {
        id: 'web',
        status: 'timeout',
        resultCount: 0,
        retryable: true,
        message: 'The source timed out. Try again shortly.',
      },
    ])
    expect(response.partial).toBe(true)
  })

  it('allows the specialized boundary to preserve results beyond one adapter deadline', async () => {
    const service = new SearchService({
      specializedProvider: {
        search: async () => {
          await new Promise(resolve => setTimeout(resolve, 25))
          return results(
            [candidate('pubmed-1', 'pubmed')],
            [{ id: 'pubmed', status: 'ok', resultCount: 1 }],
          )
        },
      },
      timeoutMs: 15,
    })

    const response = await service.search({
      query: 'device',
      sources: { feeds: false, web: false, specialized: ['pubmed'] },
    }, context())

    expect(response.results.map(result => result.id)).toEqual(['pubmed-1'])
    expect(response.sources).toEqual([{ id: 'pubmed', status: 'ok', resultCount: 1 }])
    expect(response.partial).toBe(false)
  })

  it('enforces source and final caps independently of provider behavior', async () => {
    const sourceCandidates = (sourceId: SearchSourceId, count: number) => Array.from(
      { length: count },
      (_, index) => candidate(`${sourceId}-${index + 1}`, sourceId),
    )
    const specializedIds = ['pubmed', 'clinical_trials', 'fda', 'tctmd', 'massdevice'] as const
    const service = new SearchService({
      feedProvider: {
        search: async () => results(
          sourceCandidates('feeds', 14),
          [{ id: 'feeds', status: 'ok', resultCount: 14 }],
        ),
      },
      webProvider: {
        search: async () => results(
          sourceCandidates('web', 13),
          [{ id: 'web', status: 'ok', resultCount: 13 }],
        ),
      },
      specializedProvider: {
        search: async () => results(
          specializedIds.flatMap(sourceId => sourceCandidates(sourceId, 8)),
          specializedIds.map(id => ({ id, status: 'ok', resultCount: 8 })),
        ),
      },
    })
    const request: SearchRequest = {
      query: 'device',
      sources: { feeds: true, web: true, specialized: specializedIds },
    }

    const response = await service.search(request, context())

    expect(response.results).toHaveLength(30)
    expect(response.sources).toEqual([
      { id: 'feeds', status: 'ok', resultCount: 10 },
      { id: 'pubmed', status: 'ok', resultCount: 5 },
      { id: 'clinical_trials', status: 'ok', resultCount: 5 },
      { id: 'fda', status: 'ok', resultCount: 5 },
      { id: 'tctmd', status: 'ok', resultCount: 5 },
      { id: 'massdevice', status: 'ok', resultCount: 5 },
      { id: 'web', status: 'ok', resultCount: 10 },
    ])
  })

  it('drops unsafe external targets and reduces upstream markup to bounded plain text', async () => {
    const service = new SearchService({
      webProvider: {
        search: async () => results([
          candidate('private', 'web', { url: 'http://127.0.0.1/admin' }),
          candidate('credentials', 'web', { url: 'https://user:pass@example.com/secret' }),
          candidate('safe', 'web', {
            title: '<script>instructions()</script><b>Safe title</b>',
            snippet: `<p>${'bounded '.repeat(200)}</p>`,
          }),
        ], [{ id: 'web', status: 'ok', resultCount: 3, message: 'raw detail' }]),
      },
    })
    const request: SearchRequest = {
      query: 'device',
      sources: { feeds: false, web: true, specialized: [] },
    }

    const response = await service.search(request, context())

    expect(response.results).toHaveLength(1)
    expect(response.results[0]).toMatchObject({ id: 'safe', title: 'Safe title' })
    expect(response.results[0].snippet?.length).toBeLessThanOrEqual(800)
    expect(response.results[0].snippet).not.toContain('<')
    expect(JSON.stringify(response)).not.toContain('raw detail')
  })

  it('reports selected but unconfigured boundaries as unavailable without calling others', async () => {
    const feedSearch = vi.fn(async () => results(
      [],
      [{ id: 'feeds', status: 'empty', resultCount: 0 }],
    ))
    const service = new SearchService({ feedProvider: { search: feedSearch } })

    const response = await service.search(BASE_REQUEST, context())

    expect(feedSearch).toHaveBeenCalledOnce()
    expect(response.sources.map(status => [status.id, status.status])).toEqual([
      ['feeds', 'empty'],
      ['pubmed', 'unavailable'],
      ['web', 'unavailable'],
    ])
    expect(response.partial).toBe(true)
  })
})
