import { afterEach, describe, expect, it, vi } from 'vitest'
import { MinifluxClient, MinifluxError } from './client'

function mockFetch(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('MinifluxClient', () => {
  it('sends the API key only in X-Auth-Token and verifies the current user', async () => {
    const fetchMock = mockFetch({ id: 7, username: 'fund-one', is_admin: false })
    const result = await new MinifluxClient({ baseUrl: 'https://feeds.example.com/', apiKey: 'top-secret' }).verifyConnection()

    expect(result).toEqual({ id: 7, username: 'fund-one', isAdmin: false })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://feeds.example.com/v1/me')
    expect(url).not.toContain('top-secret')
    expect(init.redirect).toBe('manual')
    expect((init.headers as Record<string, string>)['X-Auth-Token']).toBe('top-secret')
  })

  it('fails closed on redirects so the custom auth token is never forwarded cross-origin', async () => {
    const fetchMock = mockFetch({}, 302, { Location: 'https://attacker.example/steal' })
    const client = new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'secret' })

    await expect(client.verifyConnection()).rejects.toMatchObject({ code: 'upstream', status: 302 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('manual')
  })

  it('discovers, creates, and removes a feed using documented endpoints', async () => {
    const fetchMock = mockFetch([{ url: 'https://example.com/feed.xml', title: 'Example', type: 'rss' }])
    const client = new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'k' })
    await expect(client.discover('https://example.com')).resolves.toEqual([
      { url: 'https://example.com/feed.xml', title: 'Example', type: 'rss' },
    ])
    expect(fetchMock.mock.calls[0][0]).toBe('https://feeds.example.com/v1/discover')
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ url: 'https://example.com' })

    mockFetch({ feed_id: 262 }, 201)
    await expect(client.createFeed('https://example.com/feed.xml')).resolves.toBe(262)

    mockFetch({}, 204)
    await expect(client.deleteFeed(262 as any)).resolves.toBeUndefined()
  })

  it('limits discovery response bytes and result count before normalizing entries', async () => {
    const cancel = vi.fn(async () => { throw new Error('socket already closed') })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Length': '300000' }),
      body: { cancel },
    })))
    const client = new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'k' })
    await expect(client.discover('https://example.com')).rejects.toMatchObject({ code: 'invalid_response' })
    expect(cancel).toHaveBeenCalledOnce()

    const streamCancel = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(300000)) },
      cancel: streamCancel,
    }), { status: 200 })))
    await expect(client.discover('https://example.com')).rejects.toMatchObject({ code: 'invalid_response' })
    expect(streamCancel).toHaveBeenCalledOnce()

    mockFetch(Array.from({ length: 25 }, (_, index) => ({
      url: `https://example.com/feed-${index}.xml`,
      title: `Feed ${index}`,
      type: 'rss',
    })))
    await expect(client.discover('https://example.com')).resolves.toHaveLength(20)
  })

  it('lists the current user sources directly from Miniflux with numeric ids', async () => {
    const fetchMock = mockFetch([{
      id: 42,
      title: 'Example News',
      site_url: 'https://example.com',
      feed_url: 'https://example.com/feed.xml',
      parsing_error_count: 0,
      disabled: false,
    }])
    const client = new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'k' })

    await expect((client as any).listFeeds()).resolves.toEqual([expect.objectContaining({
      id: 42,
      title: 'Example News',
      feedUrl: 'https://example.com/feed.xml',
    })])
    expect(fetchMock.mock.calls[0][0]).toBe('https://feeds.example.com/v1/feeds')
  })

  it('lists and creates Miniflux categories', async () => {
    const fetchMock = mockFetch([{ id: 8, title: '中文科技', feed_count: 2, total_unread: 4 }])
    const client = new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'k' })
    await expect(client.listCategories()).resolves.toEqual([
      { id: 8, title: '中文科技', feedCount: 2, totalUnread: 4 },
    ])
    expect(fetchMock.mock.calls[0][0]).toBe('https://feeds.example.com/v1/categories?counts=true')

    mockFetch({ id: 9, title: 'Biotech' }, 201)
    await expect(client.createCategory(' Biotech ')).resolves.toMatchObject({ id: 9, title: 'Biotech' })
  })

  it('writes desired read and starred state to Miniflux instead of local storage', async () => {
    const fetchMock = mockFetch({}, 204)
    const client = new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'k' })

    await expect((client as any).updateEntryState(888, { isRead: true, isSaved: false })).resolves.toEqual({
      isRead: true,
      isSaved: false,
    })
    expect(fetchMock.mock.calls[0][0]).toBe('https://feeds.example.com/v1/entries')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      entry_ids: [888],
      status: 'read',
      starred: false,
    })
  })

  it('encodes list filters and normalizes the entry page', async () => {
    const fetchMock = mockFetch({ total: 0, entries: [] })
    const client = new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'k' })
    const page = await client.listEntries({ limit: 25, offset: 50, search: 'climate tech' })
    expect(page).toEqual({ items: [], total: 0, nextOffset: null })
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://feeds.example.com/v1/entries?limit=25&offset=50&order=published_at&direction=desc&search=climate+tech',
    )
  })

  it('encodes a collector category filter without changing the latest-first order', async () => {
    const fetchMock = mockFetch({ total: 0, entries: [] })
    const client = new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'k' })
    await client.listEntries({ limit: 20, offset: 0, categoryId: 8 })

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://feeds.example.com/v1/entries?limit=20&offset=0&order=published_at&direction=desc&category_id=8',
    )
  })

  it('bounds entry list responses before parsing untrusted upstream content', async () => {
    const cancel = vi.fn(async () => undefined)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Length': String(9 * 1024 * 1024) }),
      body: { cancel },
    })))
    const client = new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'k' })

    await expect(client.listEntries({ limit: 100, offset: 0 })).rejects.toMatchObject({
      code: 'invalid_response',
    })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('bounds all other Miniflux JSON responses before parsing', async () => {
    const cancel = vi.fn(async () => undefined)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Length': String(3 * 1024 * 1024) }),
      body: { cancel },
    })))
    const client = new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'k' })

    await expect(client.listCategories()).rejects.toMatchObject({ code: 'invalid_response' })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each([
    [401, 'authentication'],
    [403, 'authentication'],
    [429, 'rate_limited'],
    [500, 'upstream'],
  ])('maps HTTP %s to a safe typed error', async (status, code) => {
    mockFetch({ error_message: `secret upstream body ${status}` }, status, { 'Retry-After': '3' })
    const client = new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'k' })

    const error = await client.listEntries({ limit: 20, offset: 0 }).catch(value => value)
    expect(error).toBeInstanceOf(MinifluxError)
    expect(error.code).toBe(code)
    expect(error.message).not.toContain('secret upstream body')
  })

  it('turns aborts into an unavailable error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      await new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
      throw new Error('unreachable')
    }))
    const client = new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'k', timeoutMs: 5 })
    const error = await client.verifyConnection().catch(value => value)
    expect(error).toBeInstanceOf(MinifluxError)
    expect(error.code).toBe('unavailable')
  })

  it('rejects invalid JSON and network failures without leaking details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => { throw new Error('secret invalid body') },
    })))
    await expect(new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'k' }).verifyConnection())
      .rejects.toMatchObject({ code: 'invalid_response' })

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('secret network failure') }))
    const failure = await new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'k' })
      .verifyConnection().catch(value => value)
    expect(failure).toMatchObject({ code: 'unavailable', message: 'Miniflux is unavailable' })
  })

  it('rejects malformed category and empty state requests', async () => {
    mockFetch({ title: 'missing id' })
    const client = new MinifluxClient({ baseUrl: 'https://feeds.example.com', apiKey: 'k' })
    await expect(client.createCategory('topic')).rejects.toMatchObject({ code: 'invalid_response' })
    await expect(client.updateEntryState(1, {})).rejects.toThrow(/at least one/i)
  })
})
