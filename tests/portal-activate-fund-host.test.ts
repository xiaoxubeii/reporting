import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.hoisted(() => vi.fn())
const getTrustedRequestTenant = vi.hoisted(() => vi.fn())
const updateAccount = vi.hoisted(() => vi.fn())
const from = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from }),
}))
vi.mock('@/lib/tenancy/request', () => ({ getTrustedRequestTenant }))

import { POST } from '@/app/api/portal/activate/route'

const FUND_ALPHA = '82000000-0000-4000-8000-000000000001'
const FUND_BETA = '82000000-0000-4000-8000-000000000002'
let directFundId = FUND_BETA

function accountRead() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: { id: 'account-1', status: 'invited', auth_user_id: 'user-1' },
      error: null,
    })),
    update: updateAccount,
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  updateAccount.mockReturnValue({ eq: vi.fn(async () => ({ error: null })) })
  return query
}

beforeEach(() => {
  vi.clearAllMocks()
  directFundId = FUND_BETA
  getUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'lp@example.com', email_confirmed_at: '2026-07-26T00:00:00Z' } },
  })
  getTrustedRequestTenant.mockResolvedValue({
    id: FUND_ALPHA,
    slug: 'alpha-fund',
    name: 'Alpha Fund',
    logoUrl: null,
    theme: null,
  })
  from.mockImplementation((table: string) => {
    if (table === 'lp_accounts') return accountRead()
    if (table === 'lp_account_links') {
      return { select: () => ({ eq: async () => ({ data: [{ fund_id: directFundId }], error: null }) }) }
    }
    if (table === 'lp_authorized_users') {
      return { select: () => ({ eq: async () => ({ data: [], error: null }) }) }
    }
    throw new Error(`unexpected table ${table}`)
  })
})

describe('POST /api/portal/activate tenant boundary', () => {
  it('rejects an invited LP from another Host Fund before mutating the account', async () => {
    const response = await POST(new NextRequest('https://alpha-fund.example/api/portal/activate', {
      method: 'POST',
    }))

    expect(response.status).toBe(404)
    expect(getTrustedRequestTenant).toHaveBeenCalledOnce()
    expect(updateAccount).not.toHaveBeenCalled()
  })

  it('activates an invited LP when the persisted Fund matches the Host Fund', async () => {
    directFundId = FUND_ALPHA

    const response = await POST(new NextRequest('https://alpha-fund.example/api/portal/activate', {
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(updateAccount).toHaveBeenCalledWith(expect.objectContaining({
      auth_user_id: 'user-1',
      status: 'active',
    }))
  })

  it('validates a newly issued LP session without activating the account', async () => {
    directFundId = FUND_ALPHA

    const response = await POST(new NextRequest(
      'https://alpha-fund.example/api/portal/activate?validate_only=true',
      { method: 'POST' },
    ))

    expect(response.status).toBe(200)
    expect(updateAccount).not.toHaveBeenCalled()
  })

  it('keeps legacy self-host activation unchanged when no tenant is configured', async () => {
    getTrustedRequestTenant.mockResolvedValue(null)

    const response = await POST(new NextRequest('https://legacy.example/api/portal/activate', {
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(updateAccount).toHaveBeenCalledOnce()
  })
})
