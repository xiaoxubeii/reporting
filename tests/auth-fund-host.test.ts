import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.hoisted(() => vi.fn())
const rpc = vi.hoisted(() => vi.fn())
const signOut = vi.hoisted(() => vi.fn())
const exchangeCodeForSession = vi.hoisted(() => vi.fn())
const from = vi.hoisted(() => vi.fn())
const getTrustedRequestTenant = vi.hoisted(() => vi.fn())
const logActivity = vi.hoisted(() => vi.fn())
const resolveLpActivationFundId = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser, signOut, exchangeCodeForSession },
    rpc,
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('@/lib/tenancy/request', () => ({ getTrustedRequestTenant }))
vi.mock('@/lib/tenancy/lp-activation', () => ({ resolveLpActivationFundId }))
vi.mock('@/lib/activity', () => ({ logActivity }))
vi.mock('next/headers', () => ({ headers: () => new Headers({ 'x-fund-tenant-slug': 'beta-fund' }) }))

import { GET as postLogin } from '@/app/auth/post-login/route'
import { GET as authCallback } from '@/app/auth/callback/route'
import { POST as logout } from '@/app/api/auth/logout/route'

const FUND_ALPHA = '82000000-0000-4000-8000-000000000001'
const FUND_BETA = '82000000-0000-4000-8000-000000000002'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'gp@example.com' } } })
  rpc.mockResolvedValue({ data: null, error: null })
  signOut.mockResolvedValue({ error: null })
  exchangeCodeForSession.mockResolvedValue({ error: null })
  resolveLpActivationFundId.mockResolvedValue(FUND_ALPHA)
  getTrustedRequestTenant.mockResolvedValue({
    id: FUND_BETA,
    slug: 'beta-fund',
    name: 'Beta Fund',
    logoUrl: null,
    theme: null,
  })
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.maybeSingle.mockResolvedValue({ data: { fund_id: FUND_ALPHA }, error: null })
  from.mockReturnValue(query)
})

afterEach(() => {
  delete process.env.FUND_WORKSPACE_ROOT_DOMAIN
  delete process.env.FUND_WORKSPACE_DEV_PORT
})

describe('authentication Host Fund binding', () => {
  it('clears a password session issued on the wrong Fund Host before denial', async () => {
    const response = await postLogin(new NextRequest('https://beta-fund.example/auth/post-login?method=password&next=/dashboard'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://beta-fund.example/auth?error=workspace_mismatch')
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(logActivity).not.toHaveBeenCalled()
  })

  it('clears a magic-link session issued on the wrong Fund Host before denial', async () => {
    const response = await authCallback(new NextRequest('https://beta-fund.example/auth/callback?code=valid&next=/dashboard'))

    expect(exchangeCodeForSession).toHaveBeenCalledWith('valid')
    expect(response.headers.get('location')).toBe('https://beta-fund.example/auth?error=workspace_mismatch')
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('clears an invited LP recovery session issued on the wrong Fund Host', async () => {
    from.mockImplementation((table: string) => {
      const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
      query.select.mockReturnValue(query)
      query.eq.mockReturnValue(query)
      query.maybeSingle.mockResolvedValue({
        data: table === 'lp_accounts' ? { id: 'lp-account-1', status: 'invited' } : null,
        error: null,
      })
      return query
    })

    const response = await postLogin(new NextRequest(
      'https://beta-fund.example/auth/post-login?method=recovery&next=/auth/reset-password',
    ))

    expect(resolveLpActivationFundId).toHaveBeenCalledWith(expect.anything(), 'lp-account-1')
    expect(response.headers.get('location')).toBe('https://beta-fund.example/auth?error=workspace_mismatch')
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('forces a matching invited LP to welcome instead of a caller-supplied GP destination', async () => {
    getTrustedRequestTenant.mockResolvedValue({
      id: FUND_ALPHA,
      slug: 'alpha-fund',
      name: 'Alpha Fund',
      logoUrl: null,
      theme: null,
    })
    from.mockImplementation((table: string) => {
      const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
      query.select.mockReturnValue(query)
      query.eq.mockReturnValue(query)
      query.maybeSingle.mockResolvedValue({
        data: table === 'lp_accounts' ? { id: 'lp-account-1', status: 'invited' } : null,
        error: null,
      })
      return query
    })

    const response = await postLogin(new NextRequest(
      'https://alpha-fund.example/auth/post-login?method=password&next=/dashboard',
    ))

    expect(response.headers.get('location')).toBe('https://alpha-fund.example/portal/welcome')
  })

  it('clears a disabled LP session before it can use recovery on any tenant Host', async () => {
    getTrustedRequestTenant.mockResolvedValue({
      id: FUND_ALPHA,
      slug: 'alpha-fund',
      name: 'Alpha Fund',
      logoUrl: null,
      theme: null,
    })
    from.mockImplementation((table: string) => {
      const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
      query.select.mockReturnValue(query)
      query.eq.mockReturnValue(query)
      query.maybeSingle.mockResolvedValue({
        data: table === 'lp_accounts' ? { id: 'lp-account-1', status: 'disabled' } : null,
        error: null,
      })
      return query
    })

    const response = await postLogin(new NextRequest(
      'https://alpha-fund.example/auth/post-login?method=recovery&next=/auth/reset-password',
    ))

    expect(response.headers.get('location')).toBe('https://alpha-fund.example/auth?error=workspace_mismatch')
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('preserves a matching Fund session and its existing destination', async () => {
    getTrustedRequestTenant.mockResolvedValue({
      id: FUND_ALPHA,
      slug: 'alpha-fund',
      name: 'Alpha Fund',
      logoUrl: null,
      theme: null,
    })

    const response = await postLogin(new NextRequest('https://alpha-fund.example/auth/post-login?method=password&next=/dashboard'))

    expect(response.headers.get('location')).toBe('https://alpha-fund.example/dashboard')
    expect(signOut).not.toHaveBeenCalled()
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), FUND_ALPHA, 'user-1', 'login', { method: 'password' })
  })

  it('sends a matching GP magic-link session to the dashboard by default', async () => {
    getTrustedRequestTenant.mockResolvedValue({
      id: FUND_ALPHA,
      slug: 'alpha-fund',
      name: 'Alpha Fund',
      logoUrl: null,
      theme: null,
    })

    const response = await authCallback(new NextRequest(
      'https://alpha-fund.example/auth/callback?code=valid',
    ))

    expect(response.headers.get('location')).toBe('https://alpha-fund.example/dashboard')
    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      FUND_ALPHA,
      'user-1',
      'login',
      { method: 'magic_link' },
    )
  })

  it('does not accept a backslash authority escape as a post-login destination', async () => {
    getTrustedRequestTenant.mockResolvedValue({
      id: FUND_ALPHA,
      slug: 'alpha-fund',
      name: 'Alpha Fund',
      logoUrl: null,
      theme: null,
    })

    const response = await postLogin(new NextRequest(
      'https://alpha-fund.example/auth/post-login?next=%2F%5Cevil.example',
    ))

    expect(response.headers.get('location')).toBe('https://alpha-fund.example/dashboard')
  })

  it('keeps post-login redirects on the trusted tenant Host behind a proxy', async () => {
    process.env.FUND_WORKSPACE_ROOT_DOMAIN = 'localhost'
    process.env.FUND_WORKSPACE_DEV_PORT = '5010'
    getTrustedRequestTenant.mockResolvedValue({
      id: FUND_ALPHA,
      slug: 'alpha-fund',
      name: 'Alpha Fund',
      logoUrl: null,
      theme: null,
    })

    const response = await postLogin(new NextRequest(
      'http://127.0.0.1:5010/auth/post-login?method=password&next=/dashboard',
      { headers: { host: 'alpha-fund.localhost:5010' } },
    ))

    expect(response.headers.get('location')).toBe('http://alpha-fund.localhost:5010/dashboard')
  })

  it('locally clears a wrong-Host session without recording another Fund activity', async () => {
    const response = await logout(new NextRequest('https://beta-fund.example/api/auth/logout', {
      method: 'POST',
    }))

    expect(response.headers.get('location')).toBe('https://beta-fund.example/auth')
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(logActivity).not.toHaveBeenCalled()
  })
})
