import type { SupabaseClient } from '@supabase/supabase-js'
import { assertPublicDiscoveryUrl } from './url-policy'
import {
  MinifluxClient,
  MinifluxError,
  type MinifluxFeed,
} from './miniflux/client'
import type { FeedEntry } from './contracts'
import {
  assertMinifluxAccountAvailable,
  deleteMinifluxCredential,
  getMinifluxConnectionMetadata,
  getMinifluxCredential,
  saveMinifluxCredential,
} from './credentials'
import { FeedApiError } from './errors'
import { configuredMinifluxBaseUrl } from './config'

export type FeedEntryView = FeedEntry

export class FeedService {
  constructor(private readonly admin: SupabaseClient) {}

  async connectionStatus(userId: string) {
    const metadata = await getMinifluxConnectionMetadata(this.admin, userId)
    const readable = !metadata.connected || Boolean(await getMinifluxCredential(this.admin, userId))
    return {
      ...metadata,
      connected: metadata.connected && readable,
      lastError: metadata.connected && !readable
        ? 'Stored feed credential could not be read. Reconnect Miniflux.'
        : metadata.lastError,
      baseUrlConfigured: Boolean(configuredMinifluxBaseUrl(false)),
    }
  }

  async connect(userId: string, apiToken: string) {
    const client = this.client(apiToken)
    const user = await client.verifyConnection()
    if (user.isAdmin) {
      throw new FeedApiError('invalid_request', 400, 'Use a dedicated non-admin Miniflux API token for your Reporting account.')
    }
    await assertMinifluxAccountAvailable(this.admin, userId, user.id)
    const existing = await getMinifluxCredential(this.admin, userId)
    if (existing && existing.externalUserId !== user.id) {
      throw new FeedApiError('invalid_request', 409, 'Disconnect the current Miniflux account before connecting a different account.')
    }
    await saveMinifluxCredential(this.admin, {
      userId,
      apiToken,
      externalUserId: user.id,
      username: user.username,
    })
    return this.connectionStatus(userId)
  }

  async disconnect(userId: string): Promise<void> {
    await deleteMinifluxCredential(this.admin, userId)
  }

  async listSources(userId: string, search: string | null) {
    const client = await this.clientForUser(userId)
    const [feeds, categories] = await Promise.all([client.listFeeds(), client.listCategories()])
    const query = search?.trim().toLocaleLowerCase() ?? ''
    const sources = feeds
      .filter(feed => !query || [feed.title, feed.siteUrl, feed.feedUrl, feed.category?.title]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase().includes(query)))
      .map(sourceView)
    return {
      sources,
      topics: categories
        .filter(category => category.feedCount > 0)
        .map(category => ({
          id: category.id,
          name: category.title,
          count: category.feedCount,
          description: category.totalUnread > 0 ? `${category.totalUnread} unread` : null,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    }
  }

  async discover(userId: string, input: string) {
    const client = await this.clientForUser(userId)
    const discoveryUrl = await validDiscoveryUrl(input)
    const [results, feeds] = await Promise.all([
      client.discover(discoveryUrl),
      client.listFeeds(),
    ])
    const followed = new Map(feeds.map(feed => [canonicalUrl(feed.feedUrl), feed]))
    const publicResults = []
    for (const result of results) {
      try {
        const url = await validDiscoveryUrl(result.url)
        const existing = followed.get(canonicalUrl(url))
        publicResults.push({
          url,
          title: result.title,
          type: result.type,
          siteUrl: null,
          sourceName: null,
          isFollowing: Boolean(existing),
          subscriptionId: existing?.id ?? null,
        })
      } catch {
        // Miniflux discovery output remains untrusted at the Reporting boundary.
      }
    }
    return publicResults
  }

  async follow(userId: string, input: {
    feedUrl: string
    title?: string | null
    siteUrl?: string | null
    format?: string | null
    topic?: string | null
  }) {
    const feedUrl = await validDiscoveryUrl(input.feedUrl)
    const client = await this.clientForUser(userId)
    const feeds = await client.listFeeds()
    const existing = feeds.find(feed => canonicalUrl(feed.feedUrl) === canonicalUrl(feedUrl))
    if (existing) return subscriptionView(existing.id)

    const topic = cleanText(input.topic, 100)
    let categoryId: number | null = null
    if (topic) {
      const categories = await client.listCategories()
      const category = categories.find(item => item.title.toLocaleLowerCase() === topic.toLocaleLowerCase())
        ?? await client.createCategory(topic)
      categoryId = category.id
    }
    return this.createFeedWithRecovery(client, feedUrl, categoryId)
  }

  async followResolvedSource(userId: string, trustedUrl: string) {
    const feedUrl = await validDiscoveryUrl(trustedUrl)
    const client = await this.clientForUser(userId)
    const existing = (await client.listFeeds()).find(
      feed => canonicalUrl(feed.feedUrl) === canonicalUrl(feedUrl),
    )
    if (existing) return subscriptionView(existing.id)
    return this.createFeedWithRecovery(client, feedUrl, null)
  }

  async unfollow(userId: string, feedId: number): Promise<void> {
    const client = await this.clientForUser(userId)
    try {
      await client.deleteFeed(feedId)
    } catch (error) {
      if (!(error instanceof MinifluxError && error.code === 'not_found')) throw error
    }
  }

  private async createFeedWithRecovery(
    client: MinifluxClient,
    feedUrl: string,
    categoryId: number | null,
  ) {
    try {
      return subscriptionView(await client.createFeed(feedUrl, categoryId))
    } catch (error) {
      try {
        const recovered = (await client.listFeeds()).find(
          feed => canonicalUrl(feed.feedUrl) === canonicalUrl(feedUrl),
        )
        if (recovered) return subscriptionView(recovered.id)
      } catch {
        // Preserve the original create failure when recovery is also unavailable.
      }
      throw error
    }
  }

  async listEntries(params: {
    userId: string
    limit: number
    offset: number
    search: string | null
    filter?: 'all' | 'unread' | 'saved'
  }) {
    const credential = await getMinifluxCredential(this.admin, params.userId)
    if (!credential) {
      return { items: [], total: 0, nextOffset: null, connected: false, hasSubscriptions: false }
    }
    const client = await this.verifiedClient(credential)
    const feeds = await client.listFeeds()
    if (feeds.length === 0) {
      return { items: [], total: 0, nextOffset: null, connected: true, hasSubscriptions: false }
    }
    const page = await client.listEntries({
      limit: params.limit,
      offset: params.offset,
      search: params.search,
      status: params.filter === 'unread' ? 'unread' : null,
      starred: params.filter === 'saved' ? true : null,
    })
    return { ...page, connected: true, hasSubscriptions: true }
  }

  async getEntry(userId: string, entryId: number): Promise<FeedEntryView> {
    return (await this.clientForUser(userId)).getEntry(entryId)
  }

  async updateEntryState(params: {
    userId: string
    entryId: number
    isRead?: boolean
    isSaved?: boolean
  }): Promise<{ isRead: boolean; isSaved: boolean }> {
    if (params.isRead === undefined && params.isSaved === undefined) {
      throw new FeedApiError('invalid_request', 400, 'At least one state field is required.')
    }
    const client = await this.clientForUser(params.userId)
    const patch = {
      ...(params.isRead !== undefined ? { isRead: params.isRead } : {}),
      ...(params.isSaved !== undefined ? { isSaved: params.isSaved } : {}),
    }
    await client.updateEntryState(params.entryId, patch)
    const current = await client.getEntry(params.entryId)
    return { isRead: current.isRead, isSaved: current.isSaved }
  }

  private async clientForUser(userId: string): Promise<MinifluxClient> {
    const credential = await getMinifluxCredential(this.admin, userId)
    if (!credential) throw new FeedApiError('not_configured', 409, 'Connect your Miniflux account before using feeds.')
    return this.verifiedClient(credential)
  }

  private async verifiedClient(credential: { apiToken: string; externalUserId: number }): Promise<MinifluxClient> {
    const client = this.client(credential.apiToken)
    const user = await client.verifyConnection()
    if (user.isAdmin || user.id !== credential.externalUserId) {
      throw new FeedApiError('authentication', 409, 'The feed connection identity changed. Reconnect Miniflux.')
    }
    return client
  }

  private client(apiToken: string): MinifluxClient {
    return new MinifluxClient({ baseUrl: configuredMinifluxBaseUrl(true), apiKey: apiToken })
  }
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  return value.trim().slice(0, maxLength)
}

async function validDiscoveryUrl(value: string): Promise<string> {
  try { return await assertPublicDiscoveryUrl(value) } catch {
    throw new FeedApiError('invalid_request', 400, 'A valid public HTTP(S) website or feed URL is required.')
  }
}

function canonicalUrl(value: string): string {
  return new URL(value).toString()
}

function sourceView(feed: MinifluxFeed) {
  const health = feed.disabled ? 'unavailable' : feed.parsingErrorCount > 0 ? 'degraded' : 'healthy'
  return {
    id: String(feed.id),
    name: feed.title,
    siteUrl: feed.siteUrl,
    description: null,
    logoUrl: null,
    topics: feed.category ? [feed.category.title] : [],
    endpoints: [{
      id: String(feed.id),
      feedUrl: feed.feedUrl,
      title: feed.title,
      format: 'rss',
      health,
      isFollowing: true,
      subscriptionId: feed.id,
    }],
  }
}

function subscriptionView(feedId: number) {
  return {
    id: feedId,
    sourceId: feedId,
    endpointId: feedId,
    externalFeedId: feedId,
    isActive: true,
    createdAt: null,
  }
}
