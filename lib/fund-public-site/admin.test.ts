import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const getUser = vi.hoisted(() => vi.fn())
const assertAdminAccess = vi.hoisted(() => vi.fn())
const getTrustedRequestTenant = vi.hoisted(() => vi.fn())
const trustedTenantSlugFromHeaders = vi.hoisted(() => vi.fn())
const from = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('@/lib/api-helpers', () => ({ assertAdminAccess }))
vi.mock('@/lib/tenancy/request', () => ({ getTrustedRequestTenant, trustedTenantSlugFromHeaders }))

import { requireFundPublicSiteAdmin } from './admin'

function request() {
  return new NextRequest('http://alpha.localhost/api/settings/public-site')
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.FUND_WORKSPACE_ROOT_DOMAIN = 'localhost'
  getUser.mockResolvedValue({ data: { user: { id: 'user-alpha' } }, error: null })
  assertAdminAccess.mockResolvedValue({ fundId: 'fund-alpha', role: 'admin' })
  trustedTenantSlugFromHeaders.mockReturnValue('alpha')
  getTrustedRequestTenant.mockResolvedValue({ id: 'fund-alpha', slug: 'alpha', name: 'Alpha', logoUrl: null, theme: null })
  from.mockReturnValue({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { name: 'Alpha' }, error: null }) }),
    }),
  })
})

afterEach(() => { delete process.env.FUND_WORKSPACE_ROOT_DOMAIN })

describe('Fund public site administrator Host guard', () => {
  it('requires a session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const result = await requireFundPublicSiteAdmin(request())
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
  })

  it('passes non-admin denial through', async () => {
    assertAdminAccess.mockResolvedValue(NextResponse.json({ error: 'Admin access required' }, { status: 403 }))
    const result = await requireFundPublicSiteAdmin(request())
    expect((result as NextResponse).status).toBe(403)
  })

  it('requires an exact trusted tenant in hosted mode', async () => {
    trustedTenantSlugFromHeaders.mockReturnValue(null)
    const missing = await requireFundPublicSiteAdmin(request())
    expect((missing as NextResponse).status).toBe(404)

    trustedTenantSlugFromHeaders.mockReturnValue('beta')
    getTrustedRequestTenant.mockResolvedValue({ id: 'fund-beta', slug: 'beta', name: 'Beta', logoUrl: null, theme: null })
    const mismatch = await requireFundPublicSiteAdmin(request())
    expect((mismatch as NextResponse).status).toBe(404)
  })

  it('returns scope derived from matching membership and Host', async () => {
    await expect(requireFundPublicSiteAdmin(request())).resolves.toMatchObject({
      fundId: 'fund-alpha', userId: 'user-alpha', tenantSlug: 'alpha', fundName: 'Alpha',
    })
  })
})
