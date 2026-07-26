import {
  configuredMinifluxBaseUrl,
  loadMinifluxExploreToken,
  loadMinifluxExploreUserId,
} from '../config'
import type { FeedEntry, FeedEntryPage } from '../contracts'
import { MinifluxClient, type MinifluxCategory, type MinifluxFeed } from '../miniflux/client'

interface ReadOnlyCollectorClient {
  verifyConnection(signal?: AbortSignal): Promise<{ id: number; username: string; isAdmin: boolean }>
  listCategories(): Promise<MinifluxCategory[]>
  listFeeds(signal?: AbortSignal): Promise<MinifluxFeed[]>
  listIncrementalEntries(params: {
    limit: number
    offset?: number
    afterEntryId?: number
    changedAfter?: Date
    signal?: AbortSignal
  }): Promise<FeedEntryPage>
}

interface PublicExploreCollectorOptions {
  expectedUserId: number
  clientFactory: () => Promise<ReadOnlyCollectorClient>
}

export type CollectorIncrementalRequest = {
  readonly limit: number
  readonly offset?: number
  readonly signal?: AbortSignal
  readonly afterEntryId?: number
  readonly changedAfter?: Date
}

export type CollectorIncrementalPage = FeedEntryPage & {
  readonly scanCursor: number | null
}

export class PublicExploreCollector {
  constructor(private readonly options: PublicExploreCollectorOptions) {}

  async listIncremental(request: CollectorIncrementalRequest): Promise<CollectorIncrementalPage> {
    if (request.afterEntryId === undefined && request.changedAfter === undefined) {
      throw new Error('Public Explore incremental watermark is required')
    }
    const client = await this.options.clientFactory()
    const identity = await client.verifyConnection(request.signal)
    if (
      identity.isAdmin
      || identity.id !== this.options.expectedUserId
      || identity.username !== 'reporting_explore'
    ) {
      throw new Error('Public Explore collector identity is invalid')
    }

    const [categories, feeds] = await Promise.all([
      client.listCategories(),
      client.listFeeds(request.signal),
    ])
    const categoryIds = new Set(categories.map(category => category.id))
    const allowedFeedIds = new Set(feeds
      .filter(feed => isAllowedFeed(feed, categoryIds))
      .map(feed => feed.id))
    const offset = request.offset ?? 0
    const incrementalRequest = {
      limit: request.limit,
      offset,
      afterEntryId: request.afterEntryId,
      changedAfter: request.changedAfter,
      signal: request.signal,
    }
    const page = await client.listIncrementalEntries(removeUndefined(incrementalRequest))
    const scanCursor = page.items.reduce<number | null>(
      (highest, entry) => highest === null ? entry.upstreamId : Math.max(highest, entry.upstreamId),
      null,
    )
    const items = page.items.filter(entry => {
      const categoryId = entry.source.category?.externalCategoryId
      return allowedFeedIds.has(entry.feedId)
        && entry.source.externalFeedId === entry.feedId
        && categoryId !== undefined
        && categoryIds.has(categoryId)
    })

    return Object.freeze({
      items: Object.freeze(items.slice()) as unknown as FeedEntry[],
      total: page.total,
      nextOffset: page.nextOffset,
      scanCursor,
    })
  }
}

function isAllowedFeed(feed: MinifluxFeed, categoryIds: ReadonlySet<number>): boolean {
  return !feed.disabled && feed.category !== null && categoryIds.has(feed.category.id)
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

export function createPublicExploreCollector(): PublicExploreCollector {
  return new PublicExploreCollector({
    expectedUserId: loadMinifluxExploreUserId(),
    clientFactory: async () => new MinifluxClient({
      baseUrl: configuredMinifluxBaseUrl(true),
      apiKey: await loadMinifluxExploreToken(),
    }),
  })
}
