import { normalizeMinifluxEntry, normalizeMinifluxEntryPage, type FeedEntry, type FeedEntryPage } from '../contracts'
import { normalizeDiscoveryUrl, normalizeMinifluxBaseUrl, safeExternalHttpUrl } from '../url-policy'

export type MinifluxErrorCode = 'authentication' | 'rate_limited' | 'not_found' | 'invalid_response' | 'unavailable' | 'upstream'
const MAX_DISCOVERY_RESPONSE_BYTES = 256 * 1024
const MAX_DISCOVERY_RESULTS = 20
const MAX_ENTRY_LIST_RESPONSE_BYTES = 8 * 1024 * 1024
const MAX_ENTRY_DETAIL_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_DEFAULT_RESPONSE_BYTES = 2 * 1024 * 1024

export class MinifluxError extends Error {
  constructor(
    public readonly code: MinifluxErrorCode,
    message: string,
    public readonly status: number | null = null,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message)
    this.name = 'MinifluxError'
  }
}

export interface MinifluxDiscoveryResult {
  url: string
  title: string
  type: string
}

export interface MinifluxFeed {
  id: number
  title: string
  siteUrl: string | null
  feedUrl: string
  category: { id: number; title: string } | null
  parsingErrorCount: number
  disabled: boolean
}

export interface MinifluxCategory {
  id: number
  title: string
  feedCount: number
  totalUnread: number
}

interface ClientOptions {
  baseUrl: string
  apiKey: string
  timeoutMs?: number
}

export class MinifluxClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly timeoutMs: number

  constructor(options: ClientOptions) {
    this.baseUrl = normalizeMinifluxBaseUrl(options.baseUrl)
    this.apiKey = options.apiKey.trim()
    this.timeoutMs = options.timeoutMs ?? 10_000
    if (!this.apiKey) throw new Error('Miniflux API key is required')
  }

  async verifyConnection(signal?: AbortSignal): Promise<{ id: number; username: string; isAdmin: boolean }> {
    const value = await this.request('/v1/me', { signal })
    if (!isRecord(value)) throw new MinifluxError('invalid_response', 'Miniflux returned an invalid user response')
    const id = positiveId(value.id)
    const username = scalarString(value.username)
    const isAdmin = value.is_admin
    if (!id || !username || typeof isAdmin !== 'boolean') {
      throw new MinifluxError('invalid_response', 'Miniflux returned an invalid user response')
    }
    return { id, username, isAdmin }
  }

  async discover(input: string): Promise<MinifluxDiscoveryResult[]> {
    const value = await this.request('/v1/discover', {
      method: 'POST',
      body: JSON.stringify({ url: normalizeDiscoveryUrl(input) }),
    }, MAX_DISCOVERY_RESPONSE_BYTES)
    if (!Array.isArray(value)) throw new MinifluxError('invalid_response', 'Miniflux returned an invalid discovery response')
    return value.slice(0, MAX_DISCOVERY_RESULTS).flatMap(item => {
      if (!isRecord(item)) return []
      const url = scalarString(item.url)
      if (!url) return []
      return [{ url, title: scalarString(item.title) ?? 'Untitled feed', type: scalarString(item.type) ?? 'rss' }]
    })
  }

  async listFeeds(signal?: AbortSignal): Promise<MinifluxFeed[]> {
    const value = await this.request('/v1/feeds', { signal })
    if (!Array.isArray(value)) throw new MinifluxError('invalid_response', 'Miniflux returned an invalid feeds response')
    return value.flatMap(item => {
      if (!isRecord(item)) return []
      const id = positiveId(item.id)
      const feedUrl = safeExternalHttpUrl(item.feed_url)
      if (!id || !feedUrl) return []
      const rawCategory = isRecord(item.category) ? item.category : null
      const categoryId = positiveId(rawCategory?.id)
      return [{
        id,
        title: scalarString(item.title) ?? new URL(feedUrl).hostname,
        siteUrl: safeExternalHttpUrl(item.site_url),
        feedUrl,
        category: rawCategory && categoryId ? {
          id: categoryId,
          title: scalarString(rawCategory.title) ?? 'Uncategorized',
        } : null,
        parsingErrorCount: nonNegativeInteger(item.parsing_error_count),
        disabled: item.disabled === true,
      }]
    })
  }

  async listCategories(): Promise<MinifluxCategory[]> {
    const value = await this.request('/v1/categories?counts=true')
    if (!Array.isArray(value)) throw new MinifluxError('invalid_response', 'Miniflux returned an invalid categories response')
    return value.flatMap(item => {
      if (!isRecord(item)) return []
      const id = positiveId(item.id)
      if (!id) return []
      return [{
        id,
        title: scalarString(item.title) ?? 'Uncategorized',
        feedCount: nonNegativeInteger(item.feed_count),
        totalUnread: nonNegativeInteger(item.total_unread),
      }]
    })
  }

  async createCategory(title: string): Promise<MinifluxCategory> {
    const value = await this.request('/v1/categories', {
      method: 'POST',
      body: JSON.stringify({ title: title.trim() }),
    })
    if (!isRecord(value)) throw new MinifluxError('invalid_response', 'Miniflux returned an invalid category response')
    const id = positiveId(value.id)
    if (!id) throw new MinifluxError('invalid_response', 'Miniflux returned an invalid category response')
    return {
      id,
      title: scalarString(value.title) ?? title.trim(),
      feedCount: nonNegativeInteger(value.feed_count),
      totalUnread: nonNegativeInteger(value.total_unread),
    }
  }

  async createFeed(feedUrl: string, categoryId?: number | null): Promise<number> {
    const payload: Record<string, unknown> = { feed_url: normalizeDiscoveryUrl(feedUrl) }
    if (categoryId) payload.category_id = categoryId
    const value = await this.request('/v1/feeds', { method: 'POST', body: JSON.stringify(payload) })
    const feedId = isRecord(value) ? positiveId(value.feed_id) : null
    if (!feedId) throw new MinifluxError('invalid_response', 'Miniflux returned an invalid create-feed response')
    return feedId
  }

  async deleteFeed(feedId: number): Promise<void> {
    await this.request(`/v1/feeds/${encodeURIComponent(feedId)}`, { method: 'DELETE' })
  }

  async getEntry(entryId: number): Promise<FeedEntry> {
    return normalizeMinifluxEntry(await this.request(
      `/v1/entries/${encodeURIComponent(entryId)}`,
      {},
      MAX_ENTRY_DETAIL_RESPONSE_BYTES,
    ))
  }

  async listEntries(params: {
    limit: number
    offset: number
    categoryId?: number | null
    search?: string | null
    status?: 'read' | 'unread' | null
    starred?: boolean | null
    signal?: AbortSignal
  }): Promise<FeedEntryPage> {
    const query = new URLSearchParams()
    query.set('limit', String(params.limit))
    query.set('offset', String(params.offset))
    query.set('order', 'published_at')
    query.set('direction', 'desc')
    if (params.categoryId) query.set('category_id', String(params.categoryId))
    if (params.search?.trim()) query.set('search', params.search.trim())
    if (params.status) query.set('status', params.status)
    if (params.starred !== undefined && params.starred !== null) query.set('starred', String(params.starred))
    const value = await this.request(
      `/v1/entries?${query.toString()}`,
      { signal: params.signal },
      MAX_ENTRY_LIST_RESPONSE_BYTES,
    )
    return normalizeMinifluxEntryPage(value, params)
  }

  async listIncrementalEntries(params: {
    limit: number
    offset?: number
    afterEntryId?: number
    changedAfter?: Date
    signal?: AbortSignal
  }): Promise<FeedEntryPage> {
    if (!Number.isSafeInteger(params.limit) || params.limit < 1 || params.limit > 100) {
      throw new Error('Incremental entry limit must be between 1 and 100')
    }
    const offset = params.offset ?? 0
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) {
      throw new Error('Incremental entry offset is outside allowed bounds')
    }
    const hasEntryWatermark = params.afterEntryId !== undefined
    const hasChangedWatermark = params.changedAfter !== undefined
    if (!hasEntryWatermark && !hasChangedWatermark) {
      throw new Error('At least one incremental entry watermark is required')
    }
    if (hasEntryWatermark && offset !== 0) {
      throw new Error('Incremental entry ID cursors cannot be combined with an offset')
    }

    const query = new URLSearchParams()
    query.set('limit', String(params.limit))
    query.set('offset', String(offset))
    query.set('order', 'id')
    query.set('direction', 'asc')
    if (hasEntryWatermark) {
      if (!Number.isSafeInteger(params.afterEntryId) || params.afterEntryId! < 0) {
        throw new Error('Incremental entry ID watermark is invalid')
      }
      query.set('after_entry_id', String(params.afterEntryId))
    }
    if (hasChangedWatermark) {
      const changedAt = params.changedAfter!.getTime()
      if (!Number.isFinite(changedAt)) throw new Error('Incremental changed watermark is invalid')
      query.set('changed_after', String(Math.floor(changedAt / 1000)))
    }

    const value = await this.request(
      `/v1/entries?${query.toString()}`,
      { signal: params.signal },
      MAX_ENTRY_LIST_RESPONSE_BYTES,
    )
    return normalizeMinifluxEntryPage(value, { limit: params.limit, offset })
  }

  async updateEntryState(
    entryId: number,
    state: { isRead?: boolean; isSaved?: boolean },
  ): Promise<{ isRead?: boolean; isSaved?: boolean }> {
    if (state.isRead === undefined && state.isSaved === undefined) {
      throw new Error('At least one Miniflux entry state field is required')
    }
    const payload: Record<string, unknown> = { entry_ids: [entryId] }
    if (state.isRead !== undefined) payload.status = state.isRead ? 'read' : 'unread'
    if (state.isSaved !== undefined) payload.starred = state.isSaved
    await this.request('/v1/entries', { method: 'PUT', body: JSON.stringify(payload) })
    return { ...state }
  }

  private async request(path: string, init: RequestInit = {}, maxResponseBytes?: number): Promise<unknown> {
    const controller = new AbortController()
    const parentSignal = init.signal
    const abortFromParent = () => controller.abort(parentSignal?.reason)
    if (parentSignal?.aborted) abortFromParent()
    else parentSignal?.addEventListener('abort', abortFromParent, { once: true })
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Auth-Token': this.apiKey,
          ...(init.headers ?? {}),
        },
      })
      if (!response.ok) throw errorForStatus(response)
      if (response.status === 204) return null
      try {
        return await readLimitedJson(response, maxResponseBytes ?? MAX_DEFAULT_RESPONSE_BYTES)
      } catch (error) {
        if (error instanceof MinifluxError) throw error
        throw new MinifluxError('invalid_response', 'Miniflux returned invalid JSON', response.status)
      }
    } catch (error) {
      if (error instanceof MinifluxError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new MinifluxError('unavailable', 'Miniflux did not respond in time')
      }
      throw new MinifluxError('unavailable', 'Miniflux is unavailable')
    } finally {
      clearTimeout(timeout)
      parentSignal?.removeEventListener('abort', abortFromParent)
    }
  }
}

async function readLimitedJson(response: Response, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    if (response.body) await response.body.cancel().catch(() => undefined)
    throw new MinifluxError('invalid_response', 'Miniflux response exceeded the allowed size', response.status)
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new MinifluxError('invalid_response', 'Miniflux response exceeded the allowed size', response.status)
    }
    return JSON.parse(text)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let totalBytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new MinifluxError('invalid_response', 'Miniflux response exceeded the allowed size', response.status)
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return JSON.parse(text)
  } finally {
    reader.releaseLock()
  }
}

function errorForStatus(response: Response): MinifluxError {
  if (response.status === 401 || response.status === 403) {
    return new MinifluxError('authentication', 'Miniflux authentication failed', response.status)
  }
  if (response.status === 404) return new MinifluxError('not_found', 'Miniflux resource was not found', 404)
  if (response.status === 429) {
    const raw = Number(response.headers.get('Retry-After'))
    return new MinifluxError('rate_limited', 'Miniflux rate limit reached', 429, Number.isFinite(raw) ? raw : null)
  }
  return new MinifluxError('upstream', 'Miniflux request failed', response.status)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function scalarString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function positiveId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}
