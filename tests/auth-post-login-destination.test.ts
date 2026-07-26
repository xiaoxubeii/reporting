import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.hoisted(() => vi.fn())
const signOut = vi.hoisted(() => vi.fn())
const getTrustedRequestTenant = vi.hoisted(() => vi.fn())
const resolveBrowserFundIdentity = vi.hoisted(() => vi.fn())
const logActivity = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser, signOut },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/tenancy/request', () => ({ getTrustedRequestTenant }))
vi.mock('@/lib/tenancy/browser-identity', () => ({ resolveBrowserFundIdentity }))
vi.mock('@/lib/activity', () => ({ logActivity }))
vi.mock('next/headers', () => ({ headers: () => new Headers() }))

import { GET as postLogin } from '@/app/auth/post-login/route'

const FUND_ALPHA = '82000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'member@example.com' } },
  })
  signOut.mockResolvedValue({ error: null })
  getTrustedRequestTenant.mockResolvedValue({
    id: FUND_ALPHA,
    slug: 'alpha-fund',
    name: 'Alpha Fund',
    logoUrl: null,
    theme: null,
  })
})

describe('post-login default destinations', () => {
  it('sends a GP fund member to the dashboard when next is root', async () => {
    resolveBrowserFundIdentity.mockResolvedValue({
      matches: true,
      identityFundId: FUND_ALPHA,
      membershipFundId: FUND_ALPHA,
      lpStatus: null,
    })

    const response = await postLogin(new NextRequest(
      'https://alpha-fund.example/auth/post-login?method=password&next=%2F',
    ))

    expect(response.headers.get('location')).toBe('https://alpha-fund.example/dashboard')
    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      FUND_ALPHA,
      'user-1',
      'login',
      { method: 'password' },
    )
  })

  it('keeps an active LP on the portal overview when next is root', async () => {
    resolveBrowserFundIdentity.mockResolvedValue({
      matches: true,
      identityFundId: FUND_ALPHA,
      membershipFundId: null,
      lpStatus: 'active',
    })

    const response = await postLogin(new NextRequest(
      'https://alpha-fund.example/auth/post-login?method=password&next=%2F',
    ))

    expect(response.headers.get('location')).toBe('https://alpha-fund.example/portal/overview')
    expect(logActivity).not.toHaveBeenCalled()
  })

  it('prefers the GP dashboard for a user who is also an active LP', async () => {
    resolveBrowserFundIdentity.mockResolvedValue({
      matches: true,
      identityFundId: FUND_ALPHA,
      membershipFundId: FUND_ALPHA,
      lpStatus: 'active',
    })

    const response = await postLogin(new NextRequest(
      'https://alpha-fund.example/auth/post-login?method=password&next=%2F',
    ))

    expect(response.headers.get('location')).toBe('https://alpha-fund.example/dashboard')
    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      FUND_ALPHA,
      'user-1',
      'login',
      { method: 'password' },
    )
  })

  it('sends a user without a fund to onboarding when next is root', async () => {
    getTrustedRequestTenant.mockResolvedValue(null)
    resolveBrowserFundIdentity.mockResolvedValue({
      matches: true,
      identityFundId: null,
      membershipFundId: null,
      lpStatus: null,
    })

    const response = await postLogin(new NextRequest(
      'https://platform.example/auth/post-login?method=password&next=%2F',
    ))

    expect(response.headers.get('location')).toBe('https://platform.example/onboarding?confirmed=true')
    expect(logActivity).not.toHaveBeenCalled()
  })
})
