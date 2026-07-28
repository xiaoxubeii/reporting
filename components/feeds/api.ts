import type { FeedEntryView } from '@/lib/feeds/today-state'

export interface FeedsApiErrorBody {
  code: string
  message: string
  retryable?: boolean
}

export class FeedsApiError extends Error {
  constructor(public readonly detail: FeedsApiErrorBody, public readonly status: number) {
    super(detail.message)
    this.name = 'FeedsApiError'
  }
}

const FEED_ERROR_KEYS = Object.freeze({
  invalid_request: 'invalidRequest',
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  authentication: 'authentication',
  rate_limited: 'rateLimited',
  not_found: 'notFound',
  not_configured: 'notConfigured',
  upstream: 'upstream',
  internal: 'internal',
  REQUEST_FAILED: 'requestFailed',
} as const)

export type FeedErrorMessageKey = typeof FEED_ERROR_KEYS[keyof typeof FEED_ERROR_KEYS]

export function feedErrorMessageKey(value: unknown): FeedErrorMessageKey {
  if (!(value instanceof FeedsApiError)) return 'requestFailed'
  return FEED_ERROR_KEYS[value.detail.code as keyof typeof FEED_ERROR_KEYS] ?? 'requestFailed'
}

interface Envelope<T> {
  success: boolean
  data?: T
  error?: FeedsApiErrorBody | string | null
  meta?: Record<string, unknown>
}

export async function feedsRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const body = await response.json().catch(() => null) as Envelope<T> | null
  if (!response.ok || !body?.success || body.data === undefined) {
    const raw = body?.error
    const detail: FeedsApiErrorBody = typeof raw === 'object' && raw
      ? raw
      : { code: 'REQUEST_FAILED', message: typeof raw === 'string' ? raw : 'Feeds request failed', retryable: response.status >= 500 }
    throw new FeedsApiError(detail, response.status)
  }
  return body.data
}

export interface ConnectionStatus {
  connected: boolean
  baseUrlConfigured: boolean
  managed: boolean
  username: string | null
  lastVerifiedAt: string | null
  lastError: string | null
  canManage: boolean
}

export interface FeedEndpointResult {
  id: string
  feedUrl: string
  title: string
  format: string | null
  health: 'healthy' | 'degraded' | 'unavailable' | 'unknown'
  isFollowing: boolean
  subscriptionId: number | null
}

export interface FeedSourceResult {
  id: string
  name: string
  siteUrl: string | null
  description: string | null
  logoUrl: string | null
  topics: string[]
  endpoints: FeedEndpointResult[]
}

export interface FeedTopicResult {
  id: number
  name: string
  count: number
  description?: string | null
  unreadCount: number
}

export interface FeedCategoryResult {
  id: number
  name: string
}

export interface DiscoveredFeed {
  url: string
  title: string
  type: string
  siteUrl?: string | null
  sourceName?: string | null
  isFollowing?: boolean
  subscriptionId?: number | null
}

export interface EntriesPayload {
  items: FeedEntryView[]
  total: number
  nextOffset: number | null
  connected: boolean
  hasSubscriptions: boolean
}

export interface ExploreCategoryResult {
  id: string
  title: string
  sourceCount: number
  featuredSource: ExploreSourceSummaryResult
}

export interface ExploreSourceSummaryResult {
  id: string
  title: string
  siteUrl: string | null
}

export interface ExploreSourceResult extends ExploreSourceSummaryResult {
  category: {
    id: string
    title: string
  }
}

export interface ExploreEntryResult {
  id: string
  title: string
  summary: string
  contentText?: string
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

export interface ExploreEntriesPayload {
  items: ExploreEntryResult[]
  total: number
  nextOffset: number | null
}

export interface DiscoverySourceResult {
  entryId: number
  title: string
  url: string
  sourceTitle: string
  publishedAt: string | null
}

export interface TrendingDiscoveryResult {
  kind: 'trending'
  id: string
  label: string
  summary: string
  score: number
  metrics: {
    articleCount: number
    sourceCount: number
    priorArticleCount: number
    growth: number
    freshness: number
    currentWindowHours: 24
    baselineWindowDays: 7
  }
  sources: DiscoverySourceResult[]
  generatedAt: string
}

export interface DealSignalDiscoveryResult {
  kind: 'deal_signal'
  id: string
  companyName: string
  companyDomain: string | null
  stage: string | null
  amount: string | null
  eventDate: string | null
  confidence: number
  evidence: string[]
  sources: DiscoverySourceResult[]
  generatedAt: string
  existingDealId: string | null
}

export interface DiscoveryPayload<T extends TrendingDiscoveryResult | DealSignalDiscoveryResult> {
  items: T[]
  generationId: string | null
  generatedAt: string | null
  isStale: boolean
  refresh: {
    state: 'ready' | 'queued' | 'running' | 'stale' | 'degraded'
    reason: 'provider_not_configured' | 'refresh_failed' | 'results_stale' | null
    retryable: boolean
    lastAttemptAt: string | null
  }
  total: number
  limit: number
  offset: number
}
