import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedEntry, FeedEntryPage } from './contracts'
import type { MinifluxCategory, MinifluxFeed } from './miniflux/client'

const loadMinifluxExploreToken = vi.hoisted(() => vi.fn(async () => 'collector-token'))
const loadMinifluxExploreUserId = vi.hoisted(() => vi.fn(() => 900))
const configuredMinifluxBaseUrl = vi.hoisted(() => vi.fn(() => 'https://feeds.example.com'))
const collector = vi.hoisted(() => collectorDouble())
const personalFollow = vi.hoisted(() => vi.fn())
const personalListSources = vi.hoisted(() => vi.fn())

vi.mock('./config', () => ({ loadMinifluxExploreToken, loadMinifluxExploreUserId, configuredMinifluxBaseUrl }))
vi.mock('./miniflux/client', () => ({
  MinifluxClient: class {
    verifyConnection = collector.verifyConnection
    listCategories = collector.listCategories
    listEntries = collector.listEntries
    getEntry = collector.getEntry
    listFeeds = collector.listFeeds
  },
}))
vi.mock('./service', () => ({
  FeedService: class {
    followResolvedSource = personalFollow
    listSources = personalListSources
  },
}))

import { ExploreFeedService } from './explore-service'

function collectorDouble() {
  return {
    verifyConnection: vi.fn(async () => ({ id: 900, username: 'reporting_explore', isAdmin: false })),
    listCategories: vi.fn(async () => [] as MinifluxCategory[]),
    listEntries: vi.fn(async () => ({ items: [], total: 0, nextOffset: null }) as FeedEntryPage),
    getEntry: vi.fn(async () => null as unknown as FeedEntry),
    listFeeds: vi.fn(async () => [] as MinifluxFeed[]),
    updateEntryState: vi.fn(),
    createFeed: vi.fn(),
    deleteFeed: vi.fn(),
    createCategory: vi.fn(),
  }
}

const admin = { from: vi.fn(() => { throw new Error('Explore must not use Reporting feed tables') }) }

beforeEach(() => {
  vi.clearAllMocks()
  loadMinifluxExploreToken.mockResolvedValue('collector-token')
  loadMinifluxExploreUserId.mockReturnValue(900)
  collector.verifyConnection.mockResolvedValue({ id: 900, username: 'reporting_explore', isAdmin: false })
  collector.listCategories.mockResolvedValue([])
  collector.listEntries.mockResolvedValue({ items: [], total: 0, nextOffset: null })
  collector.listFeeds.mockResolvedValue([])
  personalFollow.mockResolvedValue({ id: 501, externalFeedId: 501 })
  personalListSources.mockResolvedValue({ sources: [], topics: [] })
})

describe('ExploreFeedService collector boundary', () => {
  it('rejects an administrator collector before reading any content', async () => {
    collector.verifyConnection.mockResolvedValue({ id: 1, username: 'admin', isAdmin: true })

    await expect(new ExploreFeedService(admin as never).listCategories()).rejects.toMatchObject({
      code: 'not_configured', status: 503,
    })
    expect(collector.listCategories).not.toHaveBeenCalled()
    expect(collector.listEntries).not.toHaveBeenCalled()
  })

  it.each([
    [{ id: 901, username: 'reporting_explore', isAdmin: false }, 'wrong user id'],
    [{ id: 900, username: 'personal_reader', isAdmin: false }, 'wrong username'],
  ])('rejects a non-admin token for the %s', async (identity) => {
    collector.verifyConnection.mockResolvedValue(identity)

    await expect(new ExploreFeedService(admin as never).listCategories()).rejects.toMatchObject({
      code: 'not_configured', status: 503,
    })
    expect(collector.listCategories).not.toHaveBeenCalled()
  })

  it('maps collector authentication failures to a Curated Explore-specific safe error', async () => {
    collector.verifyConnection.mockRejectedValue(new Error('secret collector auth failure'))

    const error = await new ExploreFeedService(admin as never).listCategories().catch(value => value)
    expect(error).toMatchObject({ code: 'upstream', status: 503 })
    expect(error.message).toBe('Curated Explore is temporarily unavailable.')
    expect(error.message).not.toContain('secret')
  })

  it('returns shared categories without exposing collector unread state', async () => {
    collector.listCategories.mockResolvedValue([
      { id: 8, title: 'Healthcare AI', feedCount: 4, totalUnread: 19 },
      { id: 9, title: 'Empty editorial draft', feedCount: 0, totalUnread: 0 },
    ])

    const result = await new ExploreFeedService(admin as never).listCategories()

    expect(result).toEqual([{ id: 'explore-category:8', title: 'Healthcare AI', sourceCount: 4 }])
    expect(JSON.stringify(result)).not.toContain('Unread')
    expect(collector.verifyConnection).toHaveBeenCalledOnce()
    expect(admin.from).not.toHaveBeenCalled()
  })

  it('lists latest entries by collector category without shared read or saved fields', async () => {
    collector.listCategories.mockResolvedValue([
      { id: 8, title: 'Healthcare AI', feedCount: 4, totalUnread: 19 },
    ])
    collector.listEntries.mockResolvedValue({
      items: [entry(101)], total: 1, nextOffset: null,
    })

    const result = await new ExploreFeedService(admin as never).listEntries({
      categoryRef: 'explore-category:8', limit: 20, offset: 0, search: 'diagnostics',
    })

    expect(collector.listEntries).toHaveBeenCalledWith({
      categoryId: 8, limit: 20, offset: 0, search: 'diagnostics',
    })
    expect(result.items[0]).toMatchObject({
      id: 'explore-entry:101',
      source: { id: 'explore-source:42', title: 'Medical AI News' },
      category: { id: 'explore-category:8', title: 'Healthcare AI' },
    })
    expect(result.items[0]).not.toHaveProperty('isRead')
    expect(result.items[0]).not.toHaveProperty('isSaved')
    expect(result.items[0]).not.toHaveProperty('contentText')
    expect(collector.updateEntryState).not.toHaveBeenCalled()
  })

  it('fails closed when a category reference is not owned by the collector', async () => {
    collector.listCategories.mockResolvedValue([
      { id: 7, title: 'Other', feedCount: 1, totalUnread: 0 },
    ])

    await expect(new ExploreFeedService(admin as never).listEntries({
      categoryRef: 'explore-category:8', limit: 20, offset: 0, search: null,
    })).rejects.toMatchObject({ code: 'not_found', status: 404 })
    expect(collector.listEntries).not.toHaveBeenCalled()
  })

  it('gets read-only detail through the collector identity', async () => {
    collector.getEntry.mockResolvedValue(entry(101))

    const result = await new ExploreFeedService(admin as never).getEntry('explore-entry:101')

    expect(collector.getEntry).toHaveBeenCalledWith(101)
    expect(result).toMatchObject({ id: 'explore-entry:101', contentText: 'Full article' })
    expect(result).not.toHaveProperty('isRead')
    expect(result).not.toHaveProperty('isSaved')
    expect(collector.updateEntryState).not.toHaveBeenCalled()
  })

  it('resolves a collector-owned source URL server-side before following personally', async () => {
    collector.listFeeds.mockResolvedValue([feed(42, 'https://trusted.example/feed.xml')])

    const result = await new ExploreFeedService(admin as never).followSource(
      'reporting-user-a',
      'explore-source:42',
    )

    expect(personalFollow).toHaveBeenCalledWith('reporting-user-a', 'https://trusted.example/feed.xml')
    expect(result).toEqual({ id: 501, externalFeedId: 501 })
    expect(collector.createFeed).not.toHaveBeenCalled()
    expect(collector.createCategory).not.toHaveBeenCalled()
  })

  it('fails closed when a source is not owned by the collector', async () => {
    collector.listFeeds.mockResolvedValue([feed(41, 'https://other.example/feed.xml')])

    await expect(new ExploreFeedService(admin as never).followSource(
      'reporting-user-a',
      'explore-source:42',
    )).rejects.toMatchObject({ code: 'not_found', status: 404 })
    expect(personalFollow).not.toHaveBeenCalled()
  })

  it('uses the current Reporting user for every personal write', async () => {
    collector.listFeeds.mockResolvedValue([feed(42, 'https://trusted.example/feed.xml')])
    const service = new ExploreFeedService(admin as never)

    await service.followSource('reporting-user-a', 'explore-source:42')
    await service.followSource('reporting-user-b', 'explore-source:42')

    expect(personalFollow.mock.calls).toEqual([
      ['reporting-user-a', 'https://trusted.example/feed.xml'],
      ['reporting-user-b', 'https://trusted.example/feed.xml'],
    ])
  })

  it('restores personal Follow state with collector references after reload', async () => {
    collector.listFeeds.mockResolvedValue([
      feed(42, 'https://trusted.example/feed.xml'),
      feed(43, 'https://other.example/feed.xml'),
    ])
    personalListSources.mockResolvedValue({
      sources: [{
        endpoints: [{ feedUrl: 'https://trusted.example/feed.xml' }],
      }],
      topics: [],
    })

    await expect(new ExploreFeedService(admin as never).listFollowedSourceRefs(
      'reporting-user-a',
    )).resolves.toEqual(['explore-source:42'])
    expect(personalListSources).toHaveBeenCalledWith('reporting-user-a', null)
  })

  it('does not access personal credentials while browsing Explore', async () => {
    await new ExploreFeedService(admin as never).listCategories()
    await new ExploreFeedService(admin as never).listEntries({
      categoryRef: null, limit: 10, offset: 0, search: null,
    })

    expect(personalFollow).not.toHaveBeenCalled()
  })
})

function feed(id: number, feedUrl: string): MinifluxFeed {
  return {
    id, title: 'Medical AI News', siteUrl: 'https://trusted.example', feedUrl,
    category: { id: 8, title: 'Healthcare AI' }, parsingErrorCount: 0, disabled: false,
  }
}

function entry(id: number): FeedEntry {
  return {
    externalId: id,
    upstreamId: id,
    feedId: 42,
    title: 'AI improves diagnostics',
    url: 'https://trusted.example/article',
    commentsUrl: null,
    author: 'Author',
    contentText: 'Full article',
    summary: 'Summary',
    imageUrl: 'https://trusted.example/image.jpg',
    publishedAt: '2026-07-22T10:00:00Z',
    createdAt: '2026-07-22T10:01:00Z',
    readingTimeMinutes: 4,
    isRead: true,
    isSaved: true,
    source: {
      externalFeedId: 42,
      title: 'Medical AI News',
      siteUrl: 'https://trusted.example',
      feedUrl: 'https://trusted.example/feed.xml',
      category: { externalCategoryId: 8, title: 'Healthcare AI' },
    },
  }
}
