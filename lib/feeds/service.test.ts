import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedEntry, FeedEntryPage } from './contracts'
import type { MinifluxCategory, MinifluxFeed } from './miniflux/client'

const credentials = vi.hoisted(() => new Map<string, { apiToken: string; externalUserId: number; username: string }>())
const clients = vi.hoisted(() => new Map<string, ReturnType<typeof clientDouble>>())
const getMinifluxCredential = vi.hoisted(() => vi.fn(async (_admin: unknown, userId: string) => {
  const value = credentials.get(userId)
  return value ? { ...value, lastVerifiedAt: null, lastError: null } : null
}))

vi.mock('./credentials', () => ({
  getMinifluxCredential,
  getMinifluxConnectionMetadata: vi.fn(),
  assertMinifluxAccountAvailable: vi.fn(),
  saveMinifluxCredential: vi.fn(),
  deleteMinifluxCredential: vi.fn(),
}))

vi.mock('./miniflux/client', () => {
  class MinifluxError extends Error {
    constructor(public code: string) { super(code) }
  }
  class MinifluxClient {
    private readonly double: ReturnType<typeof clientDouble>
    constructor(options: { apiKey: string }) {
      const double = clients.get(options.apiKey)
      if (!double) throw new Error(`Unexpected test token: ${options.apiKey}`)
      this.double = double
    }
    verifyConnection = () => this.double.verifyConnection()
    listFeeds = () => this.double.listFeeds()
    listCategories = () => this.double.listCategories()
    createCategory = (title: string) => this.double.createCategory(title)
    discover = (input: string) => this.double.discover(input)
    createFeed = (url: string, categoryId?: number | null) => this.double.createFeed(url, categoryId)
    deleteFeed = (id: number) => this.double.deleteFeed(id)
    listEntries = (params: unknown) => this.double.listEntries(params)
    getEntry = (id: number) => this.double.getEntry(id)
    updateEntryState = (id: number, state: { isRead?: boolean; isSaved?: boolean }) => this.double.updateEntryState(id, state)
  }
  return { MinifluxClient, MinifluxError }
})

import { FeedService } from './service'

function clientDouble() {
  return {
    verifyConnection: vi.fn(async () => ({ id: 1, username: 'reader', isAdmin: false })),
    listFeeds: vi.fn(async () => [] as MinifluxFeed[]),
    listCategories: vi.fn(async () => [] as MinifluxCategory[]),
    createCategory: vi.fn(async (_title: string) => null as unknown as MinifluxCategory),
    discover: vi.fn(async (_input: string) => [] as Array<{ url: string; title: string; type: string }>),
    createFeed: vi.fn(async (_url: string, _categoryId?: number | null) => 0),
    deleteFeed: vi.fn(async (_id: number) => undefined),
    listEntries: vi.fn(async (_params: unknown) => ({ items: [], total: 0, nextOffset: null }) as FeedEntryPage),
    getEntry: vi.fn(async (_id: number) => null as unknown as FeedEntry),
    updateEntryState: vi.fn(async (_id: number, state: { isRead?: boolean; isSaved?: boolean }) => ({ ...state })),
  }
}

const admin = { from: vi.fn(() => { throw new Error('Feed service must not query mirrored feed tables') }) }

describe('FeedService Miniflux-only user isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    credentials.clear()
    clients.clear()
    process.env.MINIFLUX_BASE_URL = 'https://feeds.example.com'
    credentials.set('user-a', { apiToken: 'token-a', externalUserId: 1, username: 'reader-a' })
    credentials.set('user-b', { apiToken: 'token-b', externalUserId: 2, username: 'reader-b' })
    clients.set('token-a', clientDouble())
    clients.set('token-b', clientDouble())
    clients.get('token-a')!.verifyConnection.mockResolvedValue({ id: 1, username: 'reader-a', isAdmin: false })
    clients.get('token-b')!.verifyConnection.mockResolvedValue({ id: 2, username: 'reader-b', isAdmin: false })
  })

  afterEach(() => { delete process.env.MINIFLUX_BASE_URL })

  it('uses a different Miniflux client for two Reporting users in the same application', async () => {
    clients.get('token-a')!.listFeeds.mockResolvedValue([feed(11, 'User A source')])
    clients.get('token-b')!.listFeeds.mockResolvedValue([feed(22, 'User B source')])

    const service = new FeedService(admin as never)
    const [a, b] = await Promise.all([service.listSources('user-a', null), service.listSources('user-b', null)])

    expect(a.sources.map(source => source.name)).toEqual(['User A source'])
    expect(b.sources.map(source => source.name)).toEqual(['User B source'])
    expect(getMinifluxCredential).toHaveBeenCalledWith(admin, 'user-a')
    expect(getMinifluxCredential).toHaveBeenCalledWith(admin, 'user-b')
    expect(admin.from).not.toHaveBeenCalled()
  })

  it('verifies the stored Miniflux identity before serving connected resources', async () => {
    const client = clients.get('token-a')!
    client.verifyConnection.mockResolvedValue({ id: 99, username: 'other-user', isAdmin: false })

    await expect(new FeedService(admin as never).listSources('user-a', null)).rejects.toMatchObject({
      code: 'authentication',
    })
    expect(client.verifyConnection).toHaveBeenCalledOnce()
    expect(client.listFeeds).not.toHaveBeenCalled()
    expect(client.listCategories).not.toHaveBeenCalled()
  })

  it('rejects a connected token that has become an administrator', async () => {
    const client = clients.get('token-a')!
    client.verifyConnection.mockResolvedValue({ id: 1, username: 'reader-a', isAdmin: true })

    await expect(new FeedService(admin as never).getEntry('user-a', 101)).rejects.toMatchObject({
      code: 'authentication',
    })
    expect(client.getEntry).not.toHaveBeenCalled()
  })

  it('passes unread and saved filters to Miniflux and returns its state unchanged', async () => {
    const upstreamEntry = entry(101, { isRead: false, isSaved: true })
    clients.get('token-a')!.listFeeds.mockResolvedValue([feed(11, 'Example')])
    clients.get('token-a')!.listEntries.mockResolvedValue({ items: [upstreamEntry], total: 1, nextOffset: null })

    const result = await new FeedService(admin as never).listEntries({
      userId: 'user-a', limit: 20, offset: 0, search: 'climate', filter: 'saved',
    })

    expect(clients.get('token-a')!.listEntries).toHaveBeenCalledWith(expect.objectContaining({
      search: 'climate', starred: true, status: null,
    }))
    expect(result.items[0]).toMatchObject({ isRead: false, isSaved: true })
    expect(clients.get('token-a')!.verifyConnection).toHaveBeenCalledOnce()
    expect(admin.from).not.toHaveBeenCalled()
  })

  it('preserves Miniflux category ids for collision-free topic navigation', async () => {
    const client = clients.get('token-a')!
    client.listFeeds.mockResolvedValue([{
      ...feed(11, '中文科技'),
      category: { id: 7, title: '中文科技' },
    }])
    client.listCategories.mockResolvedValue([{
      id: 7,
      title: '中文科技',
      feedCount: 1,
      totalUnread: 3,
    }])

    const result = await new FeedService(admin as never).listSources('user-a', null)

    expect(result.topics).toEqual([expect.objectContaining({ id: 7, name: '中文科技' })])
  })

  it('delegates website discovery to Miniflux exactly once without guessing feed endpoints', async () => {
    const client = clients.get('token-a')!
    client.discover.mockResolvedValue([{
      url: 'https://example.com/rss.xml',
      title: 'Example feed',
      type: 'rss',
    }])

    const results = await new FeedService(admin as never).discover('user-a', 'example.com')

    expect(client.discover).toHaveBeenCalledOnce()
    expect(client.discover).toHaveBeenCalledWith('https://example.com')
    expect(results).toEqual([expect.objectContaining({
      url: 'https://example.com/rss.xml',
      title: 'Example feed',
    })])
  })

  it('does not guess another endpoint when the user supplies a feed URL', async () => {
    const client = clients.get('token-a')!
    client.discover.mockResolvedValue([{
      url: 'https://example.com/rss.xml',
      title: 'Example RSS',
      type: 'rss',
    }])

    await new FeedService(admin as never).discover('user-a', 'https://example.com/rss.xml')

    expect(client.discover).toHaveBeenCalledOnce()
    expect(client.discover).toHaveBeenCalledWith('https://example.com/rss.xml')
  })

  it('creates categories and subscriptions only through the caller Miniflux API', async () => {
    const client = clients.get('token-a')!
    client.createCategory.mockResolvedValue({ id: 7, title: 'Climate', feedCount: 0, totalUnread: 0 })
    client.createFeed.mockResolvedValue(42)

    const result = await new FeedService(admin as never).follow('user-a', {
      feedUrl: 'https://example.com/feed.xml', topic: 'Climate',
    })

    expect(client.createCategory).toHaveBeenCalledWith('Climate')
    expect(client.createFeed).toHaveBeenCalledWith('https://example.com/feed.xml', 7)
    expect(result).toMatchObject({ id: 42, externalFeedId: 42 })
    expect(admin.from).not.toHaveBeenCalled()
  })

  it('returns an existing personal subscription without creating a duplicate feed', async () => {
    const client = clients.get('token-a')!
    client.listFeeds.mockResolvedValue([{
      ...feed(42, 'Existing source'),
      feedUrl: 'https://example.com/feed.xml',
    }])

    const first = await new FeedService(admin as never).follow('user-a', {
      feedUrl: 'https://example.com/feed.xml',
    })
    const second = await new FeedService(admin as never).follow('user-a', {
      feedUrl: 'https://example.com/feed.xml',
    })

    expect(first).toEqual(second)
    expect(first).toMatchObject({ id: 42, externalFeedId: 42 })
    expect(client.createFeed).not.toHaveBeenCalled()
    expect(clients.get('token-b')!.createFeed).not.toHaveBeenCalled()
  })

  it('recovers an idempotent Follow when Miniflux commits before returning an error', async () => {
    const client = clients.get('token-a')!
    client.listFeeds
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        ...feed(42, 'Recovered source'),
        feedUrl: 'https://example.com/feed.xml',
      }])
    client.createFeed.mockRejectedValueOnce(new Error('connection closed after commit'))

    await expect(new FeedService(admin as never).followResolvedSource(
      'user-a',
      'https://example.com/feed.xml',
    )).resolves.toMatchObject({ id: 42, externalFeedId: 42 })
    expect(client.listFeeds).toHaveBeenCalledTimes(2)
  })

  it('writes only supplied state fields, then reads back the final Miniflux state', async () => {
    const client = clients.get('token-a')!
    client.getEntry.mockResolvedValue(entry(101, { isRead: true, isSaved: true }))
    client.updateEntryState.mockResolvedValue({ isRead: true })

    const state = await new FeedService(admin as never).updateEntryState({
      userId: 'user-a', entryId: 101, isRead: true,
    })

    expect(client.updateEntryState).toHaveBeenCalledWith(101, { isRead: true })
    expect(client.getEntry).toHaveBeenCalledWith(101)
    expect(client.updateEntryState.mock.invocationCallOrder[0]).toBeLessThan(client.getEntry.mock.invocationCallOrder[0])
    expect(state).toEqual({ isRead: true, isSaved: true })
    expect(clients.get('token-b')!.updateEntryState).not.toHaveBeenCalled()
    expect(admin.from).not.toHaveBeenCalled()
  })
})

function feed(id: number, title: string) {
  return {
    id,
    title,
    siteUrl: 'https://example.com',
    feedUrl: `https://example.com/${id}.xml`,
    category: null,
    parsingErrorCount: 0,
    disabled: false,
  }
}

function entry(id: number, state: { isRead: boolean; isSaved: boolean }) {
  return {
    externalId: id,
    upstreamId: id,
    feedId: 11,
    title: `Entry ${id}`,
    url: 'https://example.com/article',
    commentsUrl: null,
    author: null,
    contentText: '',
    summary: '',
    imageUrl: null,
    publishedAt: null,
    createdAt: null,
    readingTimeMinutes: null,
    source: { externalFeedId: 11, title: 'Example', siteUrl: null, feedUrl: null, category: null },
    ...state,
  }
}
