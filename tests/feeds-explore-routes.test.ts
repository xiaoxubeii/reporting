import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFeedRoute = vi.hoisted(() => vi.fn())
const limitFeedAction = vi.hoisted(() => vi.fn(async (): Promise<Response | null> => null))
const assertSameOriginMutation = vi.hoisted(() => vi.fn())
const readJsonObject = vi.hoisted(() => vi.fn(async () => ({})))
const listCategories = vi.hoisted(() => vi.fn())
const listSources = vi.hoisted(() => vi.fn())
const listEntries = vi.hoisted(() => vi.fn())
const getEntry = vi.hoisted(() => vi.fn())
const listFollowedSourceRefs = vi.hoisted(() => vi.fn())
const followSource = vi.hoisted(() => vi.fn())

vi.mock('@/lib/feeds/route-context', () => ({
  requireFeedRoute,
  limitFeedAction,
  assertSameOriginMutation,
  readJsonObject,
}))
vi.mock('@/lib/feeds/explore-service', () => ({
  ExploreFeedService: class {
    listCategories = listCategories
    listSources = listSources
    listEntries = listEntries
    getEntry = getEntry
    listFollowedSourceRefs = listFollowedSourceRefs
    followSource = followSource
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  requireFeedRoute.mockResolvedValue({
    admin: { marker: 'admin' },
    gate: { userId: 'reporting-user-1', fundId: 'fund-1', role: 'member' },
  })
  listCategories.mockResolvedValue([{ id: 'explore-category:8', title: 'Healthcare AI', sourceCount: 2 }])
  listSources.mockResolvedValue([{ id: 'explore-source:42', title: 'Medical AI News', siteUrl: 'https://trusted.example', category: { id: 'explore-category:8', title: 'Healthcare AI' } }])
  listEntries.mockResolvedValue({ items: [], total: 0, nextOffset: null })
  getEntry.mockResolvedValue({ id: 'explore-entry:101', title: 'Article' })
  listFollowedSourceRefs.mockResolvedValue(['explore-source:42'])
  followSource.mockResolvedValue({ id: 501, externalFeedId: 501 })
})

describe('Curated Explore BFF routes', () => {
  it('lists categories through the authenticated Feeds access gate', async () => {
    const { GET } = await import('@/app/api/feeds/explore/categories/route')
    const response = await GET()
    const body = await response.json()

    expect(requireFeedRoute).toHaveBeenCalledWith('api/feeds/explore/categories', 'GET')
    expect(response.status).toBe(200)
    expect(body.data.categories).toHaveLength(1)
  })

  it('passes bounded list filters to the Explore service', async () => {
    const { GET } = await import('@/app/api/feeds/explore/entries/route')
    const response = await GET(new Request(
      'https://app.test/api/feeds/explore/entries?category=explore-category%3A8&q=diagnostics&limit=25&offset=50',
    ))

    expect(response.status).toBe(200)
    expect(listEntries).toHaveBeenCalledWith({
      categoryRef: 'explore-category:8',
      search: 'diagnostics',
      limit: 25,
      offset: 50,
    })
  })

  it('lists sanitized curated sources through the authenticated read-only gate', async () => {
    const { GET } = await import('@/app/api/feeds/explore/sources/route')
    const response = await GET(new Request(
      'https://app.test/api/feeds/explore/sources?category=explore-category%3A8&q=diagnostics',
    ))
    const body = await response.json()

    expect(requireFeedRoute).toHaveBeenCalledWith('api/feeds/explore/sources', 'GET')
    expect(limitFeedAction).toHaveBeenCalledWith(expect.any(Object), 'explore-sources', 120, 60)
    expect(listSources).toHaveBeenCalledWith({ categoryRef: 'explore-category:8', search: 'diagnostics' })
    expect(body.data.sources).toHaveLength(1)
    expect(JSON.stringify(body)).not.toContain('feedUrl')
  })

  it.each([
    [`q=${encodeURIComponent('x'.repeat(201))}`, 'long search'],
    [`q=${encodeURIComponent('a\u0000b')}`, 'control character'],
    [`category=${encodeURIComponent('x'.repeat(65))}`, 'long category'],
  ])('rejects unsafe source-directory input: %s (%s)', async (query) => {
    const { GET } = await import('@/app/api/feeds/explore/sources/route')
    const response = await GET(new Request(`https://app.test/api/feeds/explore/sources?${query}`))

    expect(response.status).toBe(400)
    expect(listSources).not.toHaveBeenCalled()
  })

  it.each([
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['offset=-1', 'offset'],
    [`q=${encodeURIComponent('a\u0000b')}`, 'q'],
  ])('rejects unsafe list input %s', async (query) => {
    const { GET } = await import('@/app/api/feeds/explore/entries/route')
    const response = await GET(new Request(`https://app.test/api/feeds/explore/entries?${query}`))

    expect(response.status).toBe(400)
    expect(listEntries).not.toHaveBeenCalled()
  })

  it('gets detail by namespaced entry reference without a state mutation', async () => {
    const { GET } = await import('@/app/api/feeds/explore/entries/[id]/route')
    const response = await GET(new Request('https://app.test/api/feeds/explore/entries/explore-entry%3A101'), {
      params: { id: 'explore-entry:101' },
    })

    expect(requireFeedRoute).toHaveBeenCalledWith('api/feeds/explore/entries/[id]', 'GET')
    expect(getEntry).toHaveBeenCalledWith('explore-entry:101')
    expect(response.status).toBe(200)
  })

  it('restores the current user personal Follow state independently', async () => {
    const { GET } = await import('@/app/api/feeds/explore/following/route')
    const response = await GET()
    const body = await response.json()

    expect(requireFeedRoute).toHaveBeenCalledWith('api/feeds/explore/following', 'GET')
    expect(listFollowedSourceRefs).toHaveBeenCalledWith('reporting-user-1')
    expect(body.data.sourceIds).toEqual(['explore-source:42'])
  })

  it('rate-limits Follow and passes only current user, source reference, and personal topic', async () => {
    readJsonObject.mockResolvedValueOnce({ topic: 'Cardiology' })
    const { POST } = await import('@/app/api/feeds/explore/sources/[id]/follow/route')
    const request = new Request('https://app.test/api/feeds/explore/sources/explore-source%3A42/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://app.test' },
      body: JSON.stringify({ topic: 'Cardiology' }),
    })
    const response = await POST(request, { params: { id: 'explore-source:42' } })

    expect(requireFeedRoute).toHaveBeenCalledWith('api/feeds/explore/sources/[id]/follow', 'POST')
    expect(assertSameOriginMutation).toHaveBeenCalledWith(request)
    expect(limitFeedAction).toHaveBeenCalledWith(expect.any(Object), 'explore-follow', 30, 60)
    expect(followSource).toHaveBeenCalledWith('reporting-user-1', 'explore-source:42', 'Cardiology')
    expect(followSource).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ feedUrl: expect.anything() }))
    expect(response.status).toBe(201)
  })

  it('accepts an explicit uncategorized choice for trusted Follow', async () => {
    readJsonObject.mockResolvedValueOnce({ topic: null })
    const { POST } = await import('@/app/api/feeds/explore/sources/[id]/follow/route')
    const response = await POST(new Request('https://app.test/follow', {
      method: 'POST',
      headers: { Origin: 'https://app.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: null }),
    }), { params: { id: 'explore-source:42' } })

    expect(response.status).toBe(201)
    expect(followSource).toHaveBeenCalledWith('reporting-user-1', 'explore-source:42', null)
  })

  it('rejects cross-origin Follow before rate limiting or personal writes', async () => {
    const { FeedApiError } = await import('@/lib/feeds/errors')
    assertSameOriginMutation.mockImplementationOnce(() => {
      throw new FeedApiError('forbidden', 403, 'Cross-origin feed changes are not allowed.')
    })
    const { POST } = await import('@/app/api/feeds/explore/sources/[id]/follow/route')
    const response = await POST(new Request('https://app.test/follow', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
      body: '{}',
    }), { params: { id: 'explore-source:42' } })

    expect(response.status).toBe(403)
    expect(limitFeedAction).not.toHaveBeenCalled()
    expect(followSource).not.toHaveBeenCalled()
  })

  it('rejects browser-supplied source metadata after authentication and rate limiting', async () => {
    readJsonObject.mockResolvedValueOnce({ feedUrl: 'https://attacker.example/feed.xml' })
    const { POST } = await import('@/app/api/feeds/explore/sources/[id]/follow/route')
    const response = await POST(new Request('https://app.test/follow', {
      method: 'POST',
      headers: { Origin: 'https://app.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedUrl: 'https://attacker.example/feed.xml' }),
    }), { params: { id: 'explore-source:42' } })

    expect(response.status).toBe(400)
    expect(requireFeedRoute).toHaveBeenCalledWith('api/feeds/explore/sources/[id]/follow', 'POST')
    expect(limitFeedAction).toHaveBeenCalledWith(expect.any(Object), 'explore-follow', 30, 60)
    expect(followSource).not.toHaveBeenCalled()
  })

  it.each([
    [{ topic: 'x'.repeat(101) }, 'long topic'],
    [{ topic: 'Cardio\u0000logy' }, 'control character'],
    [{ topic: 7 }, 'non-string topic'],
    [{ topic: 'Cardiology', title: 'Injected title' }, 'unknown metadata'],
  ] as Array<[Record<string, unknown>, string]>)('rejects unsafe trusted Follow input: %s (%s)', async (body) => {
    readJsonObject.mockResolvedValueOnce(body)
    const { POST } = await import('@/app/api/feeds/explore/sources/[id]/follow/route')
    const response = await POST(new Request('https://app.test/follow', {
      method: 'POST',
      headers: { Origin: 'https://app.test', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }), { params: { id: 'explore-source:42' } })

    expect(response.status).toBe(400)
    expect(requireFeedRoute).toHaveBeenCalledWith('api/feeds/explore/sources/[id]/follow', 'POST')
    expect(limitFeedAction).toHaveBeenCalledWith(expect.any(Object), 'explore-follow', 30, 60)
    expect(followSource).not.toHaveBeenCalled()
  })

  it('does not call the service when Follow is rate-limited', async () => {
    limitFeedAction.mockResolvedValueOnce(new Response('limited', { status: 429 }))
    const { POST } = await import('@/app/api/feeds/explore/sources/[id]/follow/route')
    const response = await POST(new Request('https://app.test/follow', { method: 'POST' }), {
      params: { id: 'explore-source:42' },
    })

    expect(response.status).toBe(429)
    expect(followSource).not.toHaveBeenCalled()
  })
})
