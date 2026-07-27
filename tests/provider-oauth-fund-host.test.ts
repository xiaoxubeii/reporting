import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.hoisted(() => vi.fn())
const from = vi.hoisted(() => vi.fn())
const getGoogleCredentials = vi.hoisted(() => vi.fn())
const getDropboxCredentials = vi.hoisted(() => vi.fn())
const canonicalProviderOriginForFundId = vi.hoisted(() => vi.fn())
const fundMatchesTrustedRequestTenant = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('@/lib/google/credentials', () => ({ getGoogleCredentials }))
vi.mock('@/lib/dropbox/credentials', () => ({ getDropboxCredentials }))
vi.mock('@/lib/tenancy/links', () => ({ canonicalProviderOriginForFundId }))
vi.mock('@/lib/tenancy/request', () => ({ fundMatchesTrustedRequestTenant }))

import { GET as startGoogle } from '@/app/api/auth/google/route'
import { GET as callbackGoogle } from '@/app/api/auth/google/callback/route'
import { GET as callbackDropbox } from '@/app/api/auth/dropbox/callback/route'
import {
  createProviderOAuthState,
  providerOAuthStateCookieName,
} from '@/lib/provider-oauth-state'

const FUND_ALPHA = '82000000-0000-4000-8000-000000000001'
const SECRET = 'b'.repeat(64)

function membershipQuery(role: string) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: { fund_id: FUND_ALPHA, role }, error: null })),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ENCRYPTION_KEY = SECRET
  getUser.mockResolvedValue({ data: { user: { id: 'user-alpha' } } })
  from.mockReturnValue(membershipQuery('admin'))
  getGoogleCredentials.mockResolvedValue({ clientId: 'google-client', clientSecret: 'google-secret' })
  getDropboxCredentials.mockResolvedValue({ appKey: 'dropbox-key', appSecret: 'dropbox-secret' })
  canonicalProviderOriginForFundId.mockResolvedValue('https://alpha.fundworkspace.test')
  fundMatchesTrustedRequestTenant.mockResolvedValue(true)
})

describe('Fund provider OAuth boundary', () => {
  it('requires a Fund admin to start Google account linking', async () => {
    from.mockReturnValue(membershipQuery('member'))

    const response = await startGoogle(new NextRequest(
      'https://alpha.fundworkspace.test/api/auth/google',
    ))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Admin access required' })
    expect(getGoogleCredentials).not.toHaveBeenCalled()
  })

  it('issues signed session state in a host-only cookie and rejects an escaping return_to', async () => {
    const response = await startGoogle(new NextRequest(
      'https://alpha.fundworkspace.test/api/auth/google?return_to=%2F%5Cevil.example',
    ))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    const state = location.searchParams.get('state')!
    expect(state.split('.')).toHaveLength(2)
    const cookie = response.headers.get('set-cookie')!
    expect(cookie).toContain(`${providerOAuthStateCookieName('google')}=${state}`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=lax')
    expect(cookie).not.toContain('Domain=')

    const payload = JSON.parse(Buffer.from(state.split('.')[0], 'base64url').toString('utf8'))
    expect(payload.returnTo).toBe('/settings')
    expect(payload.userId).toBe('user-alpha')
    expect(payload.fundId).toBe(FUND_ALPHA)
  })

  it.each([
    ['google', callbackGoogle, 'drive_error'],
    ['dropbox', callbackDropbox, 'dropbox_error'],
  ] as const)('rejects a forged %s callback state before token exchange', async (provider, callback, errorKey) => {
    const forged = Buffer.from(JSON.stringify({ fund_id: FUND_ALPHA })).toString('base64url')
    const request = new NextRequest(
      `https://alpha.fundworkspace.test/api/auth/${provider}/callback?code=attacker&state=${forged}`,
      { headers: { cookie: `${providerOAuthStateCookieName(provider)}=${forged}` } },
    )

    const response = await callback(request)

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!).searchParams.get(errorKey)).toBe('invalid_state')
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects a valid Google state when the current user is not an admin', async () => {
    from.mockReturnValue(membershipQuery('member'))
    const state = createProviderOAuthState({
      provider: 'google', fundId: FUND_ALPHA, userId: 'user-alpha', returnTo: '/settings', secret: SECRET,
    })
    const request = new NextRequest(
      `https://alpha.fundworkspace.test/api/auth/google/callback?code=valid&state=${state}`,
      { headers: { cookie: `${providerOAuthStateCookieName('google')}=${state}` } },
    )

    const response = await callbackGoogle(request)

    expect(new URL(response.headers.get('location')!).searchParams.get('drive_error')).toBe('forbidden')
    expect(getGoogleCredentials).not.toHaveBeenCalled()
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})
