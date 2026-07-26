import { safeExternalHttpUrl } from './url-policy'

export interface FeedCategoryRef {
  externalCategoryId: number
  title: string
}

export interface FeedSourceRef {
  externalFeedId: number
  title: string
  siteUrl: string | null
  feedUrl: string | null
  category: FeedCategoryRef | null
}

export interface FeedEntry {
  externalId: number
  upstreamId: number
  feedId: number
  title: string
  url: string | null
  commentsUrl: string | null
  author: string | null
  contentText: string
  summary: string
  imageUrl: string | null
  publishedAt: string | null
  createdAt: string | null
  changedAt?: string | null
  readingTimeMinutes: number | null
  isRead: boolean
  isSaved: boolean
  source: FeedSourceRef
}

export interface FeedEntryPage {
  items: FeedEntry[]
  total: number
  nextOffset: number | null
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function numericId(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Miniflux ${label} must be a positive numeric id`)
  }
  return value
}

function optionalNumericId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function categoryTitle(value: unknown): string {
  const cleaned = (stringValue(value) ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, 200)
    .trim()
  return cleaned || 'Uncategorized'
}

function dateValue(value: unknown): string | null {
  const text = stringValue(value)
  if (!text) return null
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function htmlToText(input: string): string {
  if (!input) return ''
  return input.slice(0, 1_000_000)
    .replace(/<(script|style|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 100_000)
}

function summarize(content: string): string {
  const oneLine = content.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= 280) return oneLine
  return `${oneLine.slice(0, 277).trimEnd()}…`
}

function imageFrom(raw: Record<string, unknown>, content: string): string | null {
  const enclosures = Array.isArray(raw.enclosures) ? raw.enclosures : []
  for (const value of enclosures) {
    const item = record(value)
    if (!item) continue
    const mime = stringValue(item.mime_type ?? item.mimeType)
    if (mime && !mime.startsWith('image/')) continue
    const url = safeExternalHttpUrl(item.url)
    if (url) return url
  }
  const match = content.match(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i)
  return safeExternalHttpUrl(match?.[1] ?? match?.[2] ?? match?.[3])
}

export function normalizeMinifluxEntry(value: unknown): FeedEntry {
  const raw = record(value)
  if (!raw) throw new Error('Miniflux entry id is required')
  const upstreamId = numericId(raw.id, 'entry id')
  const feed = record(raw.feed) ?? {}
  const feedId = numericId(raw.feed_id ?? feed.id, 'feed id')
  const rawCategory = record(feed.category)
  const categoryId = optionalNumericId(rawCategory?.id)
  const contentHtml = stringValue(raw.content) ?? ''
  const contentText = htmlToText(contentHtml)
  const category = categoryId ? Object.freeze({
    externalCategoryId: categoryId,
    title: categoryTitle(rawCategory?.title),
  }) : null
  const source = Object.freeze({
    externalFeedId: feedId,
    title: stringValue(feed.title) ?? 'Unknown source',
    siteUrl: safeExternalHttpUrl(feed.site_url),
    feedUrl: safeExternalHttpUrl(feed.feed_url),
    category,
  })
  const readingTime = typeof raw.reading_time === 'number' && Number.isFinite(raw.reading_time)
    ? Math.max(0, Math.round(raw.reading_time))
    : null

  return Object.freeze({
    externalId: upstreamId,
    upstreamId,
    feedId,
    title: (stringValue(raw.title) ?? 'Untitled').slice(0, 500),
    url: safeExternalHttpUrl(raw.url),
    commentsUrl: safeExternalHttpUrl(raw.comments_url),
    author: stringValue(raw.author)?.slice(0, 300) ?? null,
    contentText,
    summary: summarize(contentText),
    imageUrl: imageFrom(raw, contentHtml),
    publishedAt: dateValue(raw.published_at),
    createdAt: dateValue(raw.created_at),
    changedAt: dateValue(raw.changed_at),
    readingTimeMinutes: readingTime,
    isRead: raw.status === 'read',
    isSaved: raw.starred === true,
    source,
  })
}

export function normalizeMinifluxEntryPage(
  value: unknown,
  pagination: { limit: number; offset: number },
): FeedEntryPage {
  const raw = record(value) ?? {}
  const entries = Array.isArray(raw.entries) ? raw.entries : []
  const items: FeedEntry[] = []
  for (const entry of entries) {
    try {
      items.push(normalizeMinifluxEntry(entry))
    } catch {
      // One malformed upstream entry must not blank the complete reader page.
    }
  }
  const total = typeof raw.total === 'number' && raw.total >= 0 ? raw.total : entries.length
  const consumed = pagination.offset + entries.length
  return Object.freeze({
    items: Object.freeze(items.slice()) as unknown as FeedEntry[],
    total,
    nextOffset: consumed < total ? consumed : null,
  })
}
