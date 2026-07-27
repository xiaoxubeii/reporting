import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.hoisted(() => vi.fn())
const resolveAcceptanceContext = vi.hoisted(() => vi.fn())
const acceptInvitation = vi.hoisted(() => vi.fn())
const rateLimit = vi.hoisted(() => vi.fn())

const admin = {
  from: (table: string) => {
    if (table !== 'funds') throw new Error(`unexpected table ${table}`)
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { slug: 'alpha' }, error: null }),
        }),
      }),
    }
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
vi.mock('@/lib/identity/invitations', () => ({
  resolveFundInvitationAcceptanceContext: resolveAcceptanceContext,
  acceptFundInvitation: acceptInvitation,
}))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit,
  getClientIp: () => '127.0.0.1',
}))

import { POST } from '@/app/api/fund-invitations/accept/route'

const FUND_ID = 'a1000000-0000-4000-8000-000000000001'
const originalRootDomain = process.env.FUND_WORKSPACE_ROOT_DOMAIN
const originalDevPort = process.env.FUND_WORKSPACE_DEV_PORT

beforeEach(() => {
  vi.clearAllMocks()
  process.env.FUND_WORKSPACE_ROOT_DOMAIN = 'localhost'
  delete process.env.FUND_WORKSPACE_DEV_PORT
  rateLimit.mockResolvedValue(null)
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  resolveAcceptanceContext.mockResolvedValue({ fundId: FUND_ID, fundSlug: 'alpha' })
  acceptInvitation.mockResolvedValue({ fundId: FUND_ID, role: 'member' })
})

afterAll(() => {
  restoreEnvironment('FUND_WORKSPACE_ROOT_DOMAIN', originalRootDomain)
  restoreEnvironment('FUND_WORKSPACE_DEV_PORT', originalDevPort)
})

describe('POST /api/fund-invitations/accept Host binding', () => {
  it('returns the persisted Fund origin with the trusted localhost request port', async () => {
    const response = await POST(request('alpha.localhost:5040'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      canonicalOrigin: 'http://alpha.localhost:5040',
    })
    expect(acceptInvitation).toHaveBeenCalledOnce()
  })

  it('rejects a sibling Fund Host before consuming the invitation', async () => {
    const response = await POST(request('beta.localhost:5040'))

    expect(response.status).toBe(404)
    expect(acceptInvitation).not.toHaveBeenCalled()
  })

  it('keeps an explicitly configured development port authoritative', async () => {
    process.env.FUND_WORKSPACE_DEV_PORT = '5010'

    const response = await POST(request('alpha.localhost:5040'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      canonicalOrigin: 'http://alpha.localhost:5010',
    })
  })
})

function request(host: string): NextRequest {
  return new NextRequest(`http://${host}/api/fund-invitations/accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host },
    body: JSON.stringify({ token: 'b'.repeat(43) }),
  })
}

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
