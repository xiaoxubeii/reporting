import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const getUser = vi.hoisted(() => vi.fn())
const createAdminClient = vi.hoisted(() => vi.fn(() => ({ admin: true })))
const assertRouteAccess = vi.hoisted(() => vi.fn())
const hasAccess = vi.hoisted(() => vi.fn(() => true))
const rateLimit = vi.hoisted(() => vi.fn<() => Promise<NextResponse | null>>(async () => null))
const loadSearchSourcePolicy = vi.hoisted(() => vi.fn())
const configuredSearxngUrl = vi.hoisted(() => vi.fn(() => null))
const search = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/access/gate', () => ({ assertRouteAccess }))
vi.mock('@/lib/access/effective', () => ({ hasAccess }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit }))
vi.mock('@/lib/search/source-policy', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/search/source-policy')>(),
  loadSearchSourcePolicy,
}))
vi.mock('@/lib/search/searxng/config', () => ({ configuredSearxngUrl }))
vi.mock('@/lib/search/service', () => ({ SearchService: class { search = search } }))

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  assertRouteAccess.mockResolvedValue({
    fundId: 'fund-1', userId: 'user-1', role: 'member', access: { role: 'member' },
  })
  loadSearchSourcePolicy.mockResolvedValue({
    web: true,
    specialized: { pubmed: true, clinical_trials: true, fda: true, tctmd: false, massdevice: false },
  })
  search.mockResolvedValue({ results: [], sources: [{ id: 'web', status: 'empty', resultCount: 0 }], partial: false })
})

describe('POST /api/search', () => {
  it('requires authentication and fund feature access', async () => {
    const { POST } = await import('@/app/api/search/route')
    getUser.mockResolvedValueOnce({ data: { user: null } })
    const unauthenticated = await POST(jsonRequest({ query: 'device', sources: { feeds: false, web: true, specialized: [] } }))
    expect(unauthenticated.status).toBe(401)

    assertRouteAccess.mockResolvedValueOnce(NextResponse.json({ error: 'hidden detail' }, { status: 403 }))
    const forbidden = await POST(jsonRequest({ query: 'device', sources: { feeds: false, web: true, specialized: [] } }))
    expect(forbidden.status).toBe(403)
    expect(await forbidden.json()).toMatchObject({ success: false, error: { code: 'forbidden' } })
  })

  it('rejects cross-origin, oversized, and client-controlled fields', async () => {
    const { POST } = await import('@/app/api/search/route')
    const crossOrigin = await POST(jsonRequest({ query: 'device', sources: { feeds: false, web: true, specialized: [] } }, 'https://evil.test'))
    expect(crossOrigin.status).toBe(403)

    const oversized = await POST(jsonRequest({ query: 'x'.repeat(17_000), sources: { feeds: false, web: true, specialized: [] } }))
    expect(oversized.status).toBe(413)

    const controlled = await POST(jsonRequest({ query: 'device', endpoint: 'http://127.0.0.1', sources: { feeds: false, web: true, specialized: [] } }))
    expect(controlled.status).toBe(400)
    expect(search).not.toHaveBeenCalled()
  })

  it('requires at least one fixed source and applies the fund/user rate limit', async () => {
    const { POST } = await import('@/app/api/search/route')
    const empty = await POST(jsonRequest({ query: 'device', sources: { feeds: false, web: false, specialized: [] } }))
    expect(empty.status).toBe(400)

    rateLimit.mockResolvedValueOnce(NextResponse.json({}, { status: 429, headers: { 'Retry-After': '60' } }))
    const limited = await POST(jsonRequest({ query: 'device', sources: { feeds: false, web: true, specialized: [] } }))
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('60')
    expect(rateLimit).toHaveBeenLastCalledWith({
      key: 'search:fund-1:user-1',
      limit: 10,
      windowSeconds: 60,
      databaseFailure: 'deny',
    })
  })

  it('returns the service envelope without logging the raw query or result body', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const { POST } = await import('@/app/api/search/route')
    search.mockResolvedValueOnce({
      results: [{ id: 'web-1', primaryOrigin: 'web', origins: ['web'], title: 'Private merger target', url: 'https://example.com', sources: [{ id: 'web', label: 'Web' }] }],
      sources: [{ id: 'web', status: 'ok', resultCount: 1 }],
      partial: false,
    })
    const response = await POST(jsonRequest({ query: 'secret acquisition phrase', sources: { feeds: false, web: true, specialized: [] } }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: true, error: null, data: { partial: false } })
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ query: 'secret acquisition phrase' }), expect.objectContaining({ fundId: 'fund-1', userId: 'user-1' }))
    expect(JSON.stringify(info.mock.calls)).not.toContain('secret acquisition phrase')
    expect(JSON.stringify(info.mock.calls)).not.toContain('Private merger target')
    info.mockRestore()
  })
})

function jsonRequest(body: unknown, origin = 'https://app.test') {
  return new Request('https://app.test/api/search', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Origin: origin, 'Sec-Fetch-Site': origin === 'https://app.test' ? 'same-origin' : 'cross-site' },
  })
}
