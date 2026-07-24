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
import { MinifluxClient, type MinifluxFeed } from './miniflux/client'
import { FeedService } from './service'

export interface ExploreCategoryView {
  id: string
  title: string
  sourceCount: number
  featuredSource: ExploreSourceSummaryView
}

export interface ExploreSourceSummaryView {
  id: string
  title: string
  siteUrl: string | null
}

export interface ExploreSourceView extends ExploreSourceSummaryView {
  category: {
    id: string
    title: string
  }
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
    const [categories, feeds] = await Promise.all([client.listCategories(), client.listFeeds()])
    const publicCategoryIds = new Set(categories.map(category => category.id))
    return categories.flatMap(category => {
      const categoryFeeds = feeds
        .filter(feed => isPublicCuratedSource(feed, publicCategoryIds) && feed.category?.id === category.id)
        .sort((left, right) => left.id - right.id)
      const featured = categoryFeeds[0]
      if (!featured) return []
      return [Object.freeze({
        id: exploreCategoryRef(category.id),
        title: category.title,
        sourceCount: categoryFeeds.length,
        featuredSource: sourceSummaryView(featured),
      })]
    }).sort((left, right) => compareText(left.title, right.title))
  }

  async listSources(params: {
    categoryRef: string | null
    search: string | null
  }): Promise<ExploreSourceView[]> {
    const categoryId = params.categoryRef ? parseExploreCategoryRef(params.categoryRef) : null
    const client = await this.collectorClient()
    const [categories, feeds] = await Promise.all([client.listCategories(), client.listFeeds()])
    if (categoryId && !categories.some(category => category.id === categoryId)) {
      throw new FeedApiError('not_found', 404, 'The requested Explore category was not found.')
    }
    const categoryTitles = new Map(categories.map(category => [category.id, category.title]))
    const publicCategoryIds = new Set(categoryTitles.keys())
    const search = params.search?.trim().toLocaleLowerCase() ?? ''
    return feeds
      .filter(feed => isPublicCuratedSource(feed, publicCategoryIds))
      .filter(feed => !categoryId || feed.category?.id === categoryId)
      .filter(feed => !search || sourceSearchText(feed, categoryTitles.get(feed.category!.id)!).includes(search))
      .map(feed => Object.freeze({
        ...sourceSummaryView(feed),
        category: Object.freeze({
          id: exploreCategoryRef(feed.category!.id),
          title: categoryTitles.get(feed.category!.id)!,
        }),
      }))
      .sort((left, right) => compareText(left.title, right.title) || left.id.localeCompare(right.id))
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
    const [categories, collectorFeeds, personalCatalog] = await Promise.all([
      client.listCategories(),
      client.listFeeds(),
      this.personal.listSources(userId, null),
    ])
    const publicCategoryIds = new Set(categories.map(category => category.id))
    const followedUrls = new Set(personalCatalog.sources.flatMap(source =>
      source.endpoints.map(endpoint => canonicalFeedUrl(endpoint.feedUrl)),
    ))
    return collectorFeeds
      .filter(feed => (
        isPublicCuratedSource(feed, publicCategoryIds)
        && followedUrls.has(canonicalFeedUrl(feed.feedUrl))
      ))
      .map(feed => exploreSourceRef(feed.id))
  }

  async followSource(userId: string, reference: string) {
    const sourceId = parseExploreSourceRef(reference)
    const client = await this.collectorClient()
    const [categories, feeds] = await Promise.all([client.listCategories(), client.listFeeds()])
    const publicCategoryIds = new Set(categories.map(category => category.id))
    const source = feeds.find(feed => (
      feed.id === sourceId && isPublicCuratedSource(feed, publicCategoryIds)
    ))
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

function isPublicCuratedSource(feed: MinifluxFeed, publicCategoryIds: ReadonlySet<number>): boolean {
  return !feed.disabled && Boolean(feed.category && publicCategoryIds.has(feed.category.id))
}

function sourceSummaryView(feed: { id: number; title: string; siteUrl: string | null }): ExploreSourceSummaryView {
  return Object.freeze({
    id: exploreSourceRef(feed.id),
    title: feed.title,
    siteUrl: feed.siteUrl,
  })
}

function sourceSearchText(
  feed: { title: string; siteUrl: string | null },
  categoryTitle: string,
): string {
  return [feed.title, feed.siteUrl ?? '', categoryTitle]
    .join('\n')
    .toLocaleLowerCase()
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
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
