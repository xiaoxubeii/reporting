import { beforeEach, describe, expect, it, vi } from 'vitest'

const assertRouteAccess = vi.hoisted(() => vi.fn())
const connectionStatus = vi.hoisted(() => vi.fn())
const connect = vi.hoisted(() => vi.fn())
const disconnect = vi.hoisted(() => vi.fn())
const listEntries = vi.hoisted(() => vi.fn())
const listSources = vi.hoisted(() => vi.fn())
const discover = vi.hoisted(() => vi.fn())
const follow = vi.hoisted(() => vi.fn())
const unfollow = vi.hoisted(() => vi.fn())
const getEntry = vi.hoisted(() => vi.fn())
const updateEntryState = vi.hoisted(() => vi.fn())
const createAdminClient = vi.hoisted(() => vi.fn(() => ({ name: 'admin' })))
const getUser = vi.hoisted(() => vi.fn(async () => ({ data: { user: { id: 'user-1' } } })))
const rateLimit = vi.hoisted(() => vi.fn(async () => null))
const automaticMinifluxProvisioningEnabled = vi.hoisted(() => vi.fn(() => false))
const ensureMinifluxConnection = vi.hoisted(() => vi.fn())

vi.mock('@/lib/access/gate', () => ({ assertRouteAccess }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit }))
vi.mock('@/lib/feeds/config', () => ({ automaticMinifluxProvisioningEnabled }))
vi.mock('@/lib/feeds/provisioning', () => ({ ensureMinifluxConnection }))
vi.mock('@/lib/feeds/service', () => ({
  FeedService: class {
    connectionStatus = connectionStatus
    connect = connect
    disconnect = disconnect
    listEntries = listEntries
    listSources = listSources
    discover = discover
    follow = follow
    unfollow = unfollow
    getEntry = getEntry
    updateEntryState = updateEntryState
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  automaticMinifluxProvisioningEnabled.mockReturnValue(false)
  ensureMinifluxConnection.mockResolvedValue({ externalUserId: 44, username: 'managed-reader' })
  assertRouteAccess.mockResolvedValue({ fundId: 'fund-1', userId: 'user-1', role: 'member' })
  connectionStatus.mockResolvedValue({
    connected: true,
    baseUrlConfigured: true,
    username: 'personal-reader',
    lastVerifiedAt: '2026-07-22T00:00:00.000Z',
    lastError: null,
  })
  connect.mockResolvedValue({ connected: true, baseUrlConfigured: true, username: 'personal-reader' })
  disconnect.mockResolvedValue(undefined)
  listSources.mockResolvedValue({ sources: [], topics: [] })
  discover.mockResolvedValue([])
  follow.mockResolvedValue({ id: 42, title: 'Example' })
  unfollow.mockResolvedValue(undefined)
  listEntries.mockResolvedValue({ items: [], total: 0, nextOffset: null, connected: true, hasSubscriptions: false })
  getEntry.mockResolvedValue({ upstreamId: 888, feedId: 42, isRead: false, isSaved: false })
  updateEntryState.mockResolvedValue({ isRead: true, isSaved: false })
})

describe('Feeds API routes use the caller Miniflux account', () => {
  it('reads connection status by reporting user id and never returns the token', async () => {
    const { GET } = await import('@/app/api/feeds/connection/route')
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(connectionStatus).toHaveBeenCalledWith('user-1')
    expect(JSON.stringify(body)).not.toContain('secret-token')
  })

  it('lets a member connect their own manually supplied non-admin token', async () => {
    const { POST } = await import('@/app/api/feeds/connection/route')
    const response = await POST(jsonRequest('/api/feeds/connection', { apiToken: ' personal-token ' }))

    expect(response.status).toBe(200)
    expect(connect).toHaveBeenCalledWith('user-1', 'personal-token')
  })

  it('keeps managed GET read-only, provisions through rate-limited POST, and blocks manual tokens', async () => {
    automaticMinifluxProvisioningEnabled.mockReturnValue(true)
    const { GET, POST } = await import('@/app/api/feeds/connection/route')

    const getResponse = await GET()
    expect(ensureMinifluxConnection).not.toHaveBeenCalled()
    const provisionResponse = await POST(jsonRequest('/api/feeds/connection', {}))
    const postResponse = await POST(jsonRequest('/api/feeds/connection', { apiToken: 'personal-token' }))
    const body = await getResponse.json()

    expect(getResponse.status).toBe(200)
    expect(body.data.managed).toBe(true)
    expect(provisionResponse.status).toBe(200)
    expect(ensureMinifluxConnection).toHaveBeenCalledWith({ name: 'admin' }, 'user-1')
    expect(postResponse.status).toBe(409)
    expect(connect).not.toHaveBeenCalled()
  })

  it('returns a safe managed provisioning failure without leaking upstream details', async () => {
    automaticMinifluxProvisioningEnabled.mockReturnValue(true)
    ensureMinifluxConnection.mockRejectedValue(new Error('provisioner-token secret detail'))
    connectionStatus.mockResolvedValue({
      connected: false, baseUrlConfigured: true, username: null, lastVerifiedAt: null, lastError: null,
    })
    const { POST } = await import('@/app/api/feeds/connection/route')

    const response = await POST(jsonRequest('/api/feeds/connection', {}))
    const body = await response.json()

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(body)).not.toContain('provisioner-token')
  })

  it('disconnects only the caller mapping', async () => {
    const { DELETE } = await import('@/app/api/feeds/connection/route')
    const response = await DELETE()

    expect(response.status).toBe(200)
    expect(disconnect).toHaveBeenCalledWith('user-1')
  })

  it('lists and discovers sources through the caller Miniflux account', async () => {
    const { GET } = await import('@/app/api/feeds/sources/route')
    const { POST } = await import('@/app/api/feeds/discover/route')
    const sourceResponse = await GET(new Request('https://app.test/api/feeds/sources'))
    const discoverResponse = await POST(jsonRequest('/api/feeds/discover', { url: 'https://example.com' }))

    expect(sourceResponse.status).toBe(200)
    expect(discoverResponse.status).toBe(200)
    expect(listSources).toHaveBeenCalledWith('user-1', null)
    expect(discover).toHaveBeenCalledWith('user-1', 'https://example.com')
  })

  it('creates and deletes numeric Miniflux feed subscriptions for the caller', async () => {
    const { POST } = await import('@/app/api/feeds/subscriptions/route')
    const { DELETE } = await import('@/app/api/feeds/subscriptions/[id]/route')
    const followResponse = await POST(jsonRequest('/api/feeds/subscriptions', {
      feedUrl: 'https://example.com/feed.xml', title: 'Example', format: 'rss',
    }))
    const unfollowResponse = await DELETE(new Request('https://app.test') as never, { params: { id: '42' } })

    expect(followResponse.status).toBe(201)
    expect(unfollowResponse.status).toBe(200)
    expect(follow).toHaveBeenCalledWith('user-1', expect.objectContaining({ feedUrl: 'https://example.com/feed.xml' }))
    expect(unfollow).toHaveBeenCalledWith('user-1', 42)
  })

  it('lists entries without a fund-scoped repository filter', async () => {
    const { GET } = await import('@/app/api/feeds/entries/route')
    const response = await GET(new Request('https://app.test/api/feeds/entries?limit=20&offset=10') as never)

    expect(response.status).toBe(200)
    expect(listEntries).toHaveBeenCalledWith({ userId: 'user-1', limit: 20, offset: 10, search: null })
  })

  it('reads a numeric entry id through the caller token', async () => {
    const { GET } = await import('@/app/api/feeds/entries/[id]/route')
    const response = await GET(new Request('https://app.test') as never, { params: { id: '888' } })

    expect(response.status).toBe(200)
    expect(getEntry).toHaveBeenCalledWith('user-1', 888)
  })

  it('writes desired read/starred state to Miniflux for a numeric entry id', async () => {
    const { PATCH } = await import('@/app/api/feeds/entries/[id]/state/route')
    const response = await PATCH(jsonRequest('/api/feeds/entries/888/state', { isRead: true, isSaved: false }), {
      params: { id: '888' },
    })

    expect(response.status).toBe(200)
    expect(updateEntryState).toHaveBeenCalledWith({
      userId: 'user-1',
      entryId: 888,
      isRead: true,
      isSaved: false,
    })
  })

})

function jsonRequest(path: string, body: unknown) {
  return new Request(`https://app.test${path}`, { method: 'POST', body: JSON.stringify(body) })
}
