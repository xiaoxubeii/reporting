import type { SupabaseClient } from '@supabase/supabase-js'
import {
  configuredMinifluxBaseUrl,
  loadMinifluxExploreToken,
  loadMinifluxExploreUserId,
} from './config'
import type { FeedEntry } from './contracts'
import { FeedApiError } from './errors'
import {
  exploreCategoryRef,
  exploreEntryRef,
  exploreSourceRef,
  parseExploreCategoryRef,
  parseExploreEntryRef,
  parseExploreSourceRef,
} from './explore-references'
import { MinifluxClient } from './miniflux/client'
import { FeedService } from './service'

export interface ExploreCategoryView {
  id: string
  title: string
  sourceCount: number
}

export interface ExploreEntrySummaryView {
  id: string
  title: string
  summary: string
  imageUrl: string | null
  publishedAt: string | null
  originalUrl: string | null
  author: string | null
  readingTimeMinutes: number | null
  source: {
    id: string
    title: string
    siteUrl: string | null
  }
  category: {
    id: string
    title: string
  } | null
}

export interface ExploreEntryDetailView extends ExploreEntrySummaryView {
  contentText: string
}

export interface ExploreEntryPageView {
  items: ExploreEntrySummaryView[]
  total: number
  nextOffset: number | null
}

export class ExploreFeedService {
  private readonly personal: FeedService

  constructor(admin: SupabaseClient) {
    this.personal = new FeedService(admin)
  }

  async listCategories(): Promise<ExploreCategoryView[]> {
    const client = await this.collectorClient()
    const categories = await client.listCategories()
    return categories
      .filter(category => category.feedCount > 0)
      .map(category => Object.freeze({
        id: exploreCategoryRef(category.id),
        title: category.title,
        sourceCount: category.feedCount,
      }))
  }

  async listEntries(params: {
    categoryRef: string | null
    limit: number
    offset: number
    search: string | null
  }): Promise<ExploreEntryPageView> {
    const client = await this.collectorClient()
    const categoryId = params.categoryRef
      ? parseExploreCategoryRef(params.categoryRef)
      : null
    if (categoryId) {
      const owned = (await client.listCategories()).some(category => category.id === categoryId)
      if (!owned) {
        throw new FeedApiError('not_found', 404, 'The requested Explore category was not found.')
      }
    }
    const page = await client.listEntries({
      limit: params.limit,
      offset: params.offset,
      search: params.search,
      ...(categoryId ? { categoryId } : {}),
    })
    return Object.freeze({
      items: page.items.map(exploreEntrySummaryView),
      total: page.total,
      nextOffset: page.nextOffset,
    })
  }

  async getEntry(reference: string): Promise<ExploreEntryDetailView> {
    const entryId = parseExploreEntryRef(reference)
    const client = await this.collectorClient()
    return exploreEntryDetailView(await client.getEntry(entryId))
  }

  async listFollowedSourceRefs(userId: string): Promise<string[]> {
    const client = await this.collectorClient()
    const [collectorFeeds, personalCatalog] = await Promise.all([
      client.listFeeds(),
      this.personal.listSources(userId, null),
    ])
    const followedUrls = new Set(personalCatalog.sources.flatMap(source =>
      source.endpoints.map(endpoint => canonicalFeedUrl(endpoint.feedUrl)),
    ))
    return collectorFeeds
      .filter(feed => followedUrls.has(canonicalFeedUrl(feed.feedUrl)))
      .map(feed => exploreSourceRef(feed.id))
  }

  async followSource(userId: string, reference: string) {
    const sourceId = parseExploreSourceRef(reference)
    const client = await this.collectorClient()
    const source = (await client.listFeeds()).find(feed => feed.id === sourceId)
    if (!source) {
      throw new FeedApiError('not_found', 404, 'The requested Explore source was not found.')
    }
    return this.personal.followResolvedSource(userId, source.feedUrl)
  }

  private async collectorClient(): Promise<MinifluxClient> {
    try {
      const token = await loadMinifluxExploreToken()
      const expectedUserId = loadMinifluxExploreUserId()
      const client = new MinifluxClient({
        baseUrl: configuredMinifluxBaseUrl(true),
        apiKey: token,
      })
      const identity = await client.verifyConnection()
      if (
        identity.isAdmin
        || identity.id !== expectedUserId
        || identity.username !== 'reporting_explore'
      ) {
        throw new FeedApiError('not_configured', 503, 'Curated Explore is not configured.')
      }
      return client
    } catch (error) {
      if (error instanceof FeedApiError && error.safeMessage === 'Curated Explore is not configured.') {
        throw error
      }
      throw new FeedApiError('upstream', 503, 'Curated Explore is temporarily unavailable.')
    }
  }
}

function canonicalFeedUrl(value: string): string {
  return new URL(value).toString()
}

function exploreEntrySummaryView(entry: FeedEntry): ExploreEntrySummaryView {
  const category = entry.source.category
    ? Object.freeze({
      id: exploreCategoryRef(entry.source.category.externalCategoryId),
      title: entry.source.category.title,
    })
    : null
  return Object.freeze({
    id: exploreEntryRef(entry.upstreamId),
    title: entry.title,
    summary: entry.summary,
    imageUrl: entry.imageUrl,
    publishedAt: entry.publishedAt,
    originalUrl: entry.url,
    author: entry.author,
    readingTimeMinutes: entry.readingTimeMinutes,
    source: Object.freeze({
      id: exploreSourceRef(entry.source.externalFeedId),
      title: entry.source.title,
      siteUrl: entry.source.siteUrl,
    }),
    category,
  })
}

function exploreEntryDetailView(entry: FeedEntry): ExploreEntryDetailView {
  return Object.freeze({
    ...exploreEntrySummaryView(entry),
    contentText: entry.contentText,
  })
}
