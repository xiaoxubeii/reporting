import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFeedRoute = vi.hoisted(() => vi.fn())
const limitFeedAction = vi.hoisted(() => vi.fn(async (): Promise<Response | null> => null))
const list = vi.hoisted(() => vi.fn())

vi.mock('@/lib/feeds/route-context', () => ({ requireFeedRoute, limitFeedAction }))
vi.mock('@/lib/feeds/discovery/read-service', () => ({
  DiscoveryReadService: class { list = list },
}))

beforeEach(() => {
  vi.clearAllMocks()
  requireFeedRoute.mockResolvedValue({
    admin: { marker: 'admin' },
    gate: { userId: 'user-1', fundId: 'fund-1', role: 'member' },
  })
  list.mockResolvedValue({
    items: [], generationId: null, generatedAt: null, isStale: true, total: 0, limit: 20, offset: 0,
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
