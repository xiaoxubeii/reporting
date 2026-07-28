import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.hoisted(() => vi.fn())
const signOut = vi.hoisted(() => vi.fn())
const from = vi.hoisted(() => vi.fn())
const rpc = vi.hoisted(() => vi.fn())
const getAuthenticatorAssuranceLevel = vi.hoisted(() => vi.fn(async () => ({ data: null })))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser, signOut, mfa: { getAuthenticatorAssuranceLevel } },
    from,
    rpc,
  }),
}))

import { middleware } from '@/middleware'
import { DEFAULT_FEATURE_VISIBILITY } from '@/lib/types/features'

const FUND_ALPHA = '82000000-0000-4000-8000-000000000001'
const FUND_BETA = '82000000-0000-4000-8000-000000000002'

function request(host: string, pathname: string, method = 'GET', authorization?: string): NextRequest {
  return new NextRequest(`http://${host}:5010${pathname}`, {
    method,
    headers: authorization ? { authorization } : undefined,
  })
}

function proxiedRequest(host: string, pathname: string): NextRequest {
  return new NextRequest(`http://127.0.0.1:5010${pathname}`, {
    headers: { host: `${host}:5010` },
  })
}

function query(data: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.FUND_WORKSPACE_ROOT_DOMAIN = 'localhost'
  process.env.FUND_WORKSPACE_DEV_PORT = '5010'
  getUser.mockResolvedValue({ data: { user: { id: 'user-alpha' } } })
  signOut.mockResolvedValue({ error: null })
  getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null })
  from.mockImplementation((table: string) => query(
    table === 'fund_members' ? { fund_id: FUND_ALPHA } : { status: 'active' },
  ))
  rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'resolve_public_fund_host') {
      if (args.p_slug === 'unknown-fund') return { data: [], error: null }
      const id = args.p_slug === 'beta-fund' ? FUND_BETA : FUND_ALPHA
      return {
        data: [{ id, slug: args.p_slug, name: String(args.p_slug), logo_url: null, theme: null }],
        error: null,
      }
    }
    if (name === 'resolve_my_lp_fund') return { data: FUND_ALPHA, error: null }
    if (name === 'access_context') {
      return {
        data: {
          fund_id: FUND_ALPHA,
          role: 'admin',
          features: { ...DEFAULT_FEATURE_VISIBILITY, accounting: 'everyone' },
          grants: { accounting: 'write' },
          defaults: {},
        },
        error: null,
      }
    }
    throw new Error(`unexpected RPC ${name}`)
  })
})

afterEach(() => {
  delete process.env.FUND_WORKSPACE_ROOT_DOMAIN
  delete process.env.FUND_WORKSPACE_DEV_PORT
})

describe('middleware Fund Host boundary', () => {
  it('rejects invalid and platform-only Hosts before session initialization', async () => {
    expect((await middleware(request('attacker.example', '/dashboard'))).status).toBe(404)
    expect((await middleware(request('localhost', '/dashboard'))).status).toBe(404)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('resolves a tenant before allowing the isolated expert bypass', async () => {
    expect((await middleware(request('expert-fund.localhost', '/expert-response'))).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('resolve_public_fund_host', { p_slug: 'expert-fund' })
    expect(getUser).not.toHaveBeenCalled()
  })

  it('fails unknown tenants closed before reading a session', async () => {
    expect((await middleware(request('unknown-fund.localhost', '/auth'))).status).toBe(404)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('keeps tenant home public independently of the platform marketing flag and session', async () => {
    delete process.env.NEXT_PUBLIC_ENABLE_MARKETING_SITE
    delete process.env.MARKETING_DEPLOYMENT_KEY
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await middleware(request('alpha-fund.localhost', '/'))).status).toBe(200)

    getUser.mockResolvedValue({ data: { user: { id: 'user-alpha' } } })
    expect((await middleware(request('alpha-fund.localhost', '/'))).status).toBe(200)
  })

  it('keeps the hosted platform landing public without enabling the legacy marketing site', async () => {
    delete process.env.NEXT_PUBLIC_ENABLE_MARKETING_SITE
    delete process.env.MARKETING_DEPLOYMENT_KEY

    for (const user of [null, { id: 'user-alpha' }]) {
      getUser.mockResolvedValue({ data: { user } })
      const response = await middleware(request('localhost', '/'))

      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()
    }
  })

  it('allows only read access to the public OG image route on the platform Host', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const response = await middleware(request('localhost', '/api/og?title=FundWorkspace'))

    expect(response.status).toBe(200)
    expect((await middleware(request('localhost', '/api/og', 'POST'))).status).toBe(404)
  })

  it('keeps anonymous authentication redirects on the trusted tenant Host behind a proxy', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const response = await middleware(proxiedRequest('alpha-fund.localhost', '/dashboard?tab=activity'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'http://alpha-fund.localhost:5010/auth?next=%2Fdashboard%3Ftab%3Dactivity',
    )
  })

  it('allows a same-Fund GP API and denies a cross-Fund GP before the handler', async () => {
    expect((await middleware(request('alpha-fund.localhost', '/api/accounting/journal'))).status).toBe(200)
    expect((await middleware(request('beta-fund.localhost', '/api/accounting/journal'))).status).toBe(404)
  })

  it('denies a cross-Fund GP before any-level and internally-gated handlers', async () => {
    expect((await middleware(request('beta-fund.localhost', '/api/settings'))).status).toBe(404)
    expect((await middleware(request('beta-fund.localhost', '/api/pending-actions'))).status).toBe(404)
    expect((await middleware(request('beta-fund.localhost', '/api/auth/activity', 'POST'))).status).toBe(404)
  })

  it('allows a same-Fund LP API and denies a cross-Fund LP before its ungated handler', async () => {
    expect((await middleware(request('lp-alpha.localhost', '/api/portal/overview'))).status).toBe(200)
    expect((await middleware(request('beta-fund.localhost', '/api/portal/overview'))).status).toBe(404)
    expect(rpc).toHaveBeenCalledWith('resolve_my_lp_fund', {})
  })

  it('lets a same-Fund GP probe dual LP identity without pretending the GP is already an LP', async () => {
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'resolve_public_fund_host') {
        return {
          data: [{ id: FUND_ALPHA, slug: args.p_slug, name: 'Alpha', logo_url: null, theme: null }],
          error: null,
        }
      }
      if (name === 'resolve_my_lp_fund') return { data: null, error: null }
      if (name === 'access_context') {
        return {
          data: {
            fund_id: FUND_ALPHA,
            role: 'admin',
            features: DEFAULT_FEATURE_VISIBILITY,
            grants: {},
            defaults: {},
          },
          error: null,
        }
      }
      throw new Error(`unexpected RPC ${name}`)
    })

    expect((await middleware(request('alpha-fund.localhost', '/api/portal/me'))).status).toBe(200)
    expect(rpc).not.toHaveBeenCalledWith('resolve_my_lp_fund', {})
  })

  it('lets invited LP activation reach its route-level Host Fund check before the account is active', async () => {
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'resolve_public_fund_host') {
        return {
          data: [{ id: FUND_ALPHA, slug: args.p_slug, name: 'Alpha', logo_url: null, theme: null }],
          error: null,
        }
      }
      if (name === 'resolve_my_lp_fund') return { data: null, error: null }
      throw new Error(`unexpected RPC ${name}`)
    })

    expect((await middleware(request('alpha-fund.localhost', '/api/portal/activate', 'POST'))).status)
      .toBe(200)
    expect(rpc).not.toHaveBeenCalledWith('resolve_my_lp_fund', {})
  })

  it('enforces the same GP and LP Fund equality on browser pages', async () => {
    expect((await middleware(request('alpha-page.localhost', '/dashboard'))).status).toBe(200)
    expect((await middleware(request('beta-fund.localhost', '/dashboard'))).status).toBe(404)
    expect((await middleware(request('alpha-portal.localhost', '/portal/overview'))).status).toBe(200)
    expect((await middleware(request('beta-fund.localhost', '/portal/overview'))).status).toBe(404)
  })

  it('keeps an invited LP on the tenant welcome flow even after direct GP navigation', async () => {
    from.mockImplementation((table: string) => query(
      table === 'lp_accounts' ? { status: 'invited' } : null,
    ))
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'resolve_public_fund_host') {
        return {
          data: [{ id: FUND_ALPHA, slug: args.p_slug, name: 'Alpha', logo_url: null, theme: null }],
          error: null,
        }
      }
      if (name === 'resolve_my_lp_fund') return { data: null, error: null }
      throw new Error(`unexpected RPC ${name}`)
    })

    const response = await middleware(request('alpha-fund.localhost', '/dashboard'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://alpha-fund.localhost:5010/portal/welcome')
  })

  it('denies tenant worker routes even when they carry Authorization', async () => {
    const response = await middleware(request(
      'alpha-fund.localhost',
      '/api/internal/background-jobs/deal-research/run',
      'POST',
      'Bearer job.token.value',
    ))
    expect(response.status).toBe(404)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('admits GET cron only on the platform Host and never initializes a tenant session', async () => {
    expect((await middleware(request('alpha-fund.localhost', '/api/cron/background-jobs'))).status)
      .toBe(404)
    expect((await middleware(request('localhost', '/api/cron/background-jobs'))).status)
      .toBe(200)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('allows a registered internal Host worker without initializing Session', async () => {
    const response = await middleware(request(
      'internal.localhost',
      '/api/internal/background-jobs/deal-research/run',
      'POST',
      'Bearer job.token.value',
    ))
    expect(response.status).toBe(200)
    expect(getUser).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('preserves arbitrary self-host routes when tenant hosting is disabled', async () => {
    delete process.env.FUND_WORKSPACE_ROOT_DOMAIN
    expect((await middleware(request('self-host.example', '/dashboard'))).status).toBe(200)
  })
})
