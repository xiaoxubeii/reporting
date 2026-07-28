import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFeedRoute = vi.hoisted(() => vi.fn())
const limitFeedAction = vi.hoisted(() => vi.fn(async (): Promise<Response | null> => null))
const assertSameOriginMutation = vi.hoisted(() => vi.fn())
const readJsonObject = vi.hoisted(() => vi.fn(async () => ({})))
const list = vi.hoisted(() => vi.fn())
const resolveDiscoveryAIProvider = vi.hoisted(() => vi.fn())
const enqueueBackgroundJob = vi.hoisted(() => vi.fn())

vi.mock('@/lib/feeds/route-context', () => ({
  assertSameOriginMutation,
  limitFeedAction,
  readJsonObject,
  requireFeedRoute,
}))
vi.mock('@/lib/feeds/discovery/read-service', () => ({
  DiscoveryReadService: class { list = list },
}))
vi.mock('@/lib/feeds/discovery/provider', () => ({ resolveDiscoveryAIProvider }))
vi.mock('@/lib/background-jobs/store', () => ({ enqueueBackgroundJob }))

beforeEach(() => {
  vi.clearAllMocks()
  requireFeedRoute.mockResolvedValue({
    admin: { marker: 'admin' },
    gate: { userId: 'user-1', fundId: 'fund-1', role: 'member' },
  })
  list.mockResolvedValue({
    items: [], generationId: null, generatedAt: null, isStale: true,
    refresh: { state: 'degraded', reason: 'provider_not_configured', retryable: true, lastAttemptAt: null },
    total: 0, limit: 20, offset: 0,
  })
  resolveDiscoveryAIProvider.mockResolvedValue({ fundId: 'fund-1' })
  enqueueBackgroundJob.mockResolvedValue({ id: 'job-1', status: 'pending' })
})

describe('Explore discovery refresh route', () => {
  const sameOriginHeaders = {
    'Content-Type': 'application/json',
    Origin: 'https://app.test',
    'Sec-Fetch-Site': 'same-origin',
  }

  it('queues one system job for only the authenticated Fund and accepts no caller-owned input', async () => {
    const { POST } = await import('@/app/api/feeds/explore/discovery/refresh/route')
    const response = await POST(new Request('https://app.test/api/feeds/explore/discovery/refresh', {
      method: 'POST',
      headers: sameOriginHeaders,
      body: '{}',
    }))

    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({
      success: true,
      data: { jobId: 'job-1', status: 'pending' },
    })
    expect(assertSameOriginMutation).toHaveBeenCalledOnce()
    expect(requireFeedRoute).toHaveBeenCalledWith('api/feeds/explore/discovery/refresh', 'POST')
    expect(limitFeedAction).toHaveBeenCalledWith(expect.any(Object), 'explore-discovery-refresh', 3, 300)
    expect(resolveDiscoveryAIProvider).toHaveBeenCalledWith({ marker: 'admin' }, 'fund-1')
    expect(enqueueBackgroundJob).toHaveBeenCalledWith({
      kind: 'feed_discovery',
      payload: {},
      fundId: 'fund-1',
      actor: { type: 'system' },
      dedupeKey: 'feed_discovery:fund-1',
    }, { marker: 'admin' })
  })

  it('fails closed when provider configuration is unavailable and remains retryable', async () => {
    resolveDiscoveryAIProvider.mockRejectedValueOnce(new Error('secret decryption detail'))
    const { POST } = await import('@/app/api/feeds/explore/discovery/refresh/route')
    const response = await POST(new Request('https://app.test/api/feeds/explore/discovery/refresh', {
      method: 'POST',
      headers: sameOriginHeaders,
      body: '{}',
    }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: {
        code: 'not_configured',
        message: 'Discovery AI is not configured for this Fund.',
      },
    })
    expect(enqueueBackgroundJob).not.toHaveBeenCalled()
  })

  it('rejects cross-origin, unauthorized, rate-limited, or caller-supplied refresh input before enqueueing', async () => {
    const { POST } = await import('@/app/api/feeds/explore/discovery/refresh/route')
    const { FeedApiError } = await import('@/lib/feeds/errors')
    assertSameOriginMutation.mockImplementationOnce(() => {
      throw new FeedApiError('forbidden', 403, 'Cross-origin feed changes are not allowed.')
    })
    const crossOrigin = await POST(new Request('https://app.test/api/feeds/explore/discovery/refresh', {
      method: 'POST', headers: sameOriginHeaders, body: '{}',
    }))
    expect(crossOrigin.status).toBe(403)

    requireFeedRoute.mockResolvedValueOnce(new Response(null, { status: 403 }))
    const denied = await POST(new Request('https://app.test/api/feeds/explore/discovery/refresh', {
      method: 'POST', headers: sameOriginHeaders, body: '{}',
    }))
    expect(denied.status).toBe(403)

    const limited = new Response(null, { status: 429 })
    limitFeedAction.mockResolvedValueOnce(limited)
    const throttled = await POST(new Request('https://app.test/api/feeds/explore/discovery/refresh', {
      method: 'POST', headers: sameOriginHeaders, body: '{}',
    }))
    expect(throttled).toBe(limited)

    readJsonObject.mockResolvedValueOnce({ fundId: 'attacker-fund' })
    const injected = await POST(new Request('https://app.test/api/feeds/explore/discovery/refresh', {
      method: 'POST', headers: sameOriginHeaders, body: JSON.stringify({ fundId: 'attacker-fund' }),
    }))
    expect(injected.status).toBe(400)
    expect(enqueueBackgroundJob).not.toHaveBeenCalled()
  })
})

describe('Explore discovery route', () => {
  it('uses the Feeds gate, rate limit, kind allowlist, and bounded pagination', async () => {
    const { GET } = await import('@/app/api/feeds/explore/discovery/route')
    const response = await GET(new Request('https://app.test/api/feeds/explore/discovery?kind=trending&limit=25&offset=50'))

    expect(response.status).toBe(200)
    expect(requireFeedRoute).toHaveBeenCalledWith('api/feeds/explore/discovery', 'GET')
    expect(limitFeedAction).toHaveBeenCalledWith(expect.any(Object), 'explore-discovery', 120, 60)
    expect(list).toHaveBeenCalledWith({ fundId: 'fund-1', kind: 'trending', limit: 25, offset: 50 })
  })

  it.each([
    '',
    '?kind=unknown',
    '?kind=trending&limit=0',
    '?kind=trending&offset=-1',
    '?kind=trending&model=private',
    '?kind=trending&kind=deal_signal',
  ])('rejects invalid or client-controlled discovery input: %s', async (query) => {
    const { GET } = await import('@/app/api/feeds/explore/discovery/route')
    const response = await GET(new Request(`https://app.test/api/feeds/explore/discovery${query}`))

    expect(response.status).toBe(400)
    expect(list).not.toHaveBeenCalled()
  })

  it('returns the existing Feeds envelope and preserves rate-limit responses', async () => {
    const limited = new Response(JSON.stringify({ limited: true }), { status: 429, headers: { 'Retry-After': '30' } })
    limitFeedAction.mockResolvedValueOnce(limited)
    const { GET } = await import('@/app/api/feeds/explore/discovery/route')
    const response = await GET(new Request('https://app.test/api/feeds/explore/discovery?kind=deal_signal'))

    expect(response).toBe(limited)
    expect(response.headers.get('Retry-After')).toBe('30')
    expect(list).not.toHaveBeenCalled()
  })
})
