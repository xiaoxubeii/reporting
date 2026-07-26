import { describe, expect, it, vi } from 'vitest'

import type { FeedEntry, FeedEntryPage } from '../contracts'
import type { MinifluxCategory, MinifluxFeed } from '../miniflux/client'
import { PublicExploreCollector } from './collector'

function entry(id: number, feedId: number, categoryId: number | null): FeedEntry {
  return {
    externalId: id,
    upstreamId: id,
    feedId,
    title: `Entry ${id}`,
    url: `https://example.com/${id}`,
    commentsUrl: null,
    author: null,
    contentText: 'Body',
    summary: 'Body',
    imageUrl: null,
    publishedAt: '2026-07-25T10:00:00.000Z',
    createdAt: '2026-07-25T10:00:00.000Z',
    changedAt: '2026-07-25T10:05:00.000Z',
    readingTimeMinutes: 1,
    isRead: false,
    isSaved: false,
    source: {
      externalFeedId: feedId,
      title: `Feed ${feedId}`,
      siteUrl: 'https://example.com',
      feedUrl: `https://example.com/${feedId}.xml`,
      category: categoryId ? { externalCategoryId: categoryId, title: 'Tech' } : null,
    },
  }
}

function setup(overrides: {
  identity?: { id: number; username: string; isAdmin: boolean }
  categories?: MinifluxCategory[]
  feeds?: MinifluxFeed[]
  page?: FeedEntryPage
} = {}) {
  const listIncrementalEntries = vi.fn(async () => overrides.page ?? {
    items: [entry(1, 10, 7), entry(2, 11, 7), entry(3, 12, null)],
    total: 3,
    nextOffset: null,
  })
  const client = {
    verifyConnection: vi.fn(async () => overrides.identity ?? { id: 99, username: 'reporting_explore', isAdmin: false }),
    listCategories: vi.fn(async () => overrides.categories ?? [{ id: 7, title: 'Tech', feedCount: 2, totalUnread: 0 }]),
    listFeeds: vi.fn(async () => overrides.feeds ?? [
      { id: 10, title: 'Allowed', siteUrl: 'https://example.com', feedUrl: 'https://example.com/10.xml', category: { id: 7, title: 'Tech' }, parsingErrorCount: 0, disabled: false },
      { id: 11, title: 'Disabled', siteUrl: 'https://example.com', feedUrl: 'https://example.com/11.xml', category: { id: 7, title: 'Tech' }, parsingErrorCount: 0, disabled: true },
      { id: 12, title: 'Uncategorized', siteUrl: 'https://example.com', feedUrl: 'https://example.com/12.xml', category: null, parsingErrorCount: 0, disabled: false },
    ]),
    listIncrementalEntries,
  }
  return { client, listIncrementalEntries }
}

describe('PublicExploreCollector', () => {
  it('returns only enabled entries whose feed and category are owned by the collector', async () => {
    const { client, listIncrementalEntries } = setup()
    const collector = new PublicExploreCollector({ expectedUserId: 99, clientFactory: async () => client })

    const page = await collector.listIncremental({ limit: 20, afterEntryId: 0 })

    expect(page.items.map(item => item.upstreamId)).toEqual([1])
    expect(listIncrementalEntries).toHaveBeenCalledWith({ limit: 20, afterEntryId: 0, offset: 0 })
    expect(Object.isFrozen(page.items)).toBe(true)
  })

  it.each([
    [{ id: 99, username: 'reporting_explore', isAdmin: true }],
    [{ id: 98, username: 'reporting_explore', isAdmin: false }],
    [{ id: 99, username: 'someone_else', isAdmin: false }],
  ])('fails closed for an unexpected collector identity', async (identity) => {
    const { client } = setup({ identity })
    const collector = new PublicExploreCollector({ expectedUserId: 99, clientFactory: async () => client })
    await expect(collector.listIncremental({ limit: 20, afterEntryId: 0 })).rejects.toThrow(/collector/i)
    expect(client.listIncrementalEntries).not.toHaveBeenCalled()
  })

  it('forwards changed-time reconciliation without exposing personal state methods', async () => {
    const { client, listIncrementalEntries } = setup({ page: { items: [entry(4, 10, 7)], total: 1, nextOffset: null } })
    const collector = new PublicExploreCollector({ expectedUserId: 99, clientFactory: async () => client })
    const changedAfter = new Date('2026-07-24T00:00:00Z')

    await collector.listIncremental({ limit: 40, afterEntryId: 10, changedAfter })

    expect(listIncrementalEntries).toHaveBeenCalledWith({ limit: 40, offset: 0, afterEntryId: 10, changedAfter })
    expect(client).not.toHaveProperty('updateEntryState')
    expect(client).not.toHaveProperty('createFeed')
  })
})
