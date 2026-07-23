import { describe, expect, it, vi } from 'vitest'
import type { FeedEntry } from '@/lib/feeds/contracts'
import { MinifluxFeedSearchProvider } from './feed'

const context = (signal = new AbortController().signal) => ({
  fundId: 'fund-1',
  userId: 'user-1',
  signal,
})

function entry(overrides: Partial<FeedEntry> = {}): FeedEntry {
  return {
    externalId: 101,
    upstreamId: 101,
    feedId: 12,
    title: 'Medical device update',
    url: 'https://example.com/device',
    commentsUrl: null,
    author: 'Reporter',
    contentText: 'Full content must not be copied into Search.',
    summary: 'A concise feed summary.',
    imageUrl: 'https://example.com/remote.jpg',
    publishedAt: '2026-07-20T00:00:00.000Z',
    createdAt: '2026-07-20T01:00:00.000Z',
    readingTimeMinutes: 3,
    isRead: false,
    isSaved: true,
    source: {
      externalFeedId: 12,
      title: 'Example Medical',
      siteUrl: 'https://example.com',
      feedUrl: 'https://example.com/rss',
      category: null,
    },
    ...overrides,
  }
}

describe('MinifluxFeedSearchProvider', () => {
  it('queries only the authenticated caller and maps reader state with a ten-result cap', async () => {
    const items = Array.from({ length: 12 }, (_, index) => entry({
      externalId: index + 1,
      upstreamId: index + 1,
      title: `Result ${index + 1}`,
    }))
    const service = {
      listEntries: vi.fn().mockResolvedValue({
        items,
        total: items.length,
        nextOffset: null,
        connected: true,
        hasSubscriptions: true,
      }),
    }
    const response = await new MinifluxFeedSearchProvider(service)
      .search({ query: 'devices' }, context())

    expect(service.listEntries).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      limit: 10,
      offset: 0,
      search: 'devices',
      filter: 'all',
    }))
    expect(response.candidates).toHaveLength(10)
    expect(response.candidates[0]).toEqual(expect.objectContaining({
      id: 'feed:1',
      origin: 'feed',
      feedEntryId: 1,
      isRead: false,
      isSaved: true,
      source: { id: 'feeds', label: 'Example Medical' },
    }))
    expect(JSON.stringify(response)).not.toContain('Full content must not be copied')
    expect(JSON.stringify(response)).not.toContain('remote.jpg')
    expect(response.statuses).toEqual([{ id: 'feeds', status: 'ok', resultCount: 10 }])
  })

  it('keeps URL-less entries because the authenticated reader only needs entry id', async () => {
    const service = {
      listEntries: vi.fn().mockResolvedValue({
        items: [entry({ url: null })], total: 1, nextOffset: null, connected: true, hasSubscriptions: true,
      }),
    }
    const response = await new MinifluxFeedSearchProvider(service)
      .search({ query: 'reader' }, context())
    expect(response.candidates[0]).not.toHaveProperty('url')
    expect(response.candidates[0].feedEntryId).toBe(101)
  })

  it.each([
    [{ connected: false, hasSubscriptions: false }, 'unavailable'],
    [{ connected: true, hasSubscriptions: false }, 'empty'],
  ] as const)('maps connection/subscription state to %s', async (state, status) => {
    const service = {
      listEntries: vi.fn().mockResolvedValue({ items: [], total: 0, nextOffset: null, ...state }),
    }
    const response = await new MinifluxFeedSearchProvider(service)
      .search({ query: 'reader' }, context())
    expect(response.statuses[0]).toMatchObject({ id: 'feeds', status, resultCount: 0 })
  })

  it('normalizes aborted and upstream failures without leaking messages', async () => {
    const aborted = new AbortController()
    aborted.abort()
    const timeoutService = { listEntries: vi.fn().mockRejectedValue(new DOMException('secret', 'AbortError')) }
    await expect(new MinifluxFeedSearchProvider(timeoutService).search({ query: 'q' }, context(aborted.signal)))
      .rejects.toMatchObject({ code: 'timeout' })

    const failureService = { listEntries: vi.fn().mockRejectedValue(Object.assign(new Error('secret'), { code: 'upstream' })) }
    await expect(new MinifluxFeedSearchProvider(failureService).search({ query: 'q' }, context()))
      .rejects.toMatchObject({ code: 'failed', message: expect.not.stringContaining('secret') })
  })
})
