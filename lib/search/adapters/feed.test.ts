import { describe, expect, it, vi } from 'vitest'
import type { FeedEntry } from '@/lib/feeds/contracts'
import { MinifluxFeedSearchAdapter } from './feed'

const context = (signal = new AbortController().signal) => ({ fundId: 'fund-1', userId: 'user-1', signal })
const entry = (upstreamId = 101): FeedEntry => ({
  externalId: upstreamId, upstreamId, feedId: 12, title: `Result ${upstreamId}`,
  url: 'https://example.com/device', commentsUrl: null, author: 'Reporter',
  contentText: 'Full content must not be copied into Search.', summary: 'A concise feed summary.',
  imageUrl: 'https://example.com/remote.jpg', publishedAt: '2026-07-20T00:00:00.000Z',
  createdAt: '2026-07-20T01:00:00.000Z', readingTimeMinutes: 3, isRead: false, isSaved: true,
  source: { externalFeedId: 12, title: 'Example Medical', siteUrl: 'https://example.com', feedUrl: 'https://example.com/rss', category: null },
})

describe('MinifluxFeedSearchAdapter', () => {
  it('queries only the caller and returns at most its requested limit with reader state', async () => {
    const service = { listEntries: vi.fn().mockResolvedValue({
      items: Array.from({ length: 12 }, (_, index) => entry(index + 1)), total: 12, nextOffset: null,
      connected: true, hasSubscriptions: true,
    }) }
    const response = await new MinifluxFeedSearchAdapter(service).search({ query: 'devices', limit: 10 }, context())
    expect(service.listEntries).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', limit: 10, search: 'devices' }))
    expect(response.candidates).toHaveLength(10)
    expect(response.candidates[0]).toMatchObject({ origin: 'feed', feedEntryId: 1, source: { id: 'feeds' } })
    expect(JSON.stringify(response)).not.toContain('Full content')
    expect(JSON.stringify(response)).not.toContain('remote.jpg')
  })

  it('returns empty for no subscriptions and unavailable for a disconnected account', async () => {
    const empty = { listEntries: vi.fn().mockResolvedValue({ items: [], total: 0, nextOffset: null, connected: true, hasSubscriptions: false }) }
    await expect(new MinifluxFeedSearchAdapter(empty).search({ query: 'q', limit: 10 }, context())).resolves.toEqual({ candidates: [] })
    const disconnected = { listEntries: vi.fn().mockResolvedValue({ items: [], total: 0, nextOffset: null, connected: false, hasSubscriptions: false }) }
    await expect(new MinifluxFeedSearchAdapter(disconnected).search({ query: 'q', limit: 10 }, context())).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('normalizes aborted and upstream failures', async () => {
    const aborted = new AbortController(); aborted.abort()
    const timeout = { listEntries: vi.fn().mockRejectedValue(new DOMException('secret', 'AbortError')) }
    await expect(new MinifluxFeedSearchAdapter(timeout).search({ query: 'q', limit: 10 }, context(aborted.signal))).rejects.toMatchObject({ code: 'timeout' })
    const failure = { listEntries: vi.fn().mockRejectedValue(Object.assign(new Error('secret'), { code: 'upstream' })) }
    await expect(new MinifluxFeedSearchAdapter(failure).search({ query: 'q', limit: 10 }, context())).rejects.toMatchObject({ code: 'failed' })
  })
})
