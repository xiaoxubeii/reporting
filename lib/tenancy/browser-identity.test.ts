import { describe, expect, it, vi } from 'vitest'

import { resolveBrowserFundIdentity } from './browser-identity'

const FUND_ALPHA = '82000000-0000-4000-8000-000000000001'
const FUND_BETA = '82000000-0000-4000-8000-000000000002'

function adminClient(options: {
  membershipFundId?: string | null
  lpAccount?: { readonly id: string; readonly status: 'active' | 'invited' | 'disabled' } | null
}) {
  const membership = queryResult(options.membershipFundId
    ? { fund_id: options.membershipFundId }
    : null)
  const lpAccount = queryResult(options.lpAccount ?? null)
  return {
    from: vi.fn((table: string) => table === 'fund_members' ? membership : lpAccount),
  }
}

function queryResult<T>(data: T | null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

describe('browser Fund identity resolution', () => {
  it('rejects an invited Alpha LP session on the Beta Host', async () => {
    const resolveInvitedFund = vi.fn().mockResolvedValue(FUND_ALPHA)
    const identity = await resolveBrowserFundIdentity({
      admin: adminClient({ lpAccount: { id: 'lp-account-1', status: 'invited' } }) as never,
      session: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } as never,
      userId: 'user-1',
      tenantFundId: FUND_BETA,
      resolveLinkedLpFund: resolveInvitedFund,
    })

    expect(identity).toEqual({
      matches: false,
      identityFundId: FUND_ALPHA,
      membershipFundId: null,
      lpStatus: 'invited',
    })
    expect(resolveInvitedFund).toHaveBeenCalledWith(expect.anything(), 'lp-account-1')
  })

  it('accepts an invited LP only on its own Host and keeps its invited status', async () => {
    const identity = await resolveBrowserFundIdentity({
      admin: adminClient({ lpAccount: { id: 'lp-account-1', status: 'invited' } }) as never,
      session: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } as never,
      userId: 'user-1',
      tenantFundId: FUND_ALPHA,
      resolveLinkedLpFund: vi.fn().mockResolvedValue(FUND_ALPHA),
    })

    expect(identity).toMatchObject({
      matches: true,
      identityFundId: FUND_ALPHA,
      lpStatus: 'invited',
    })
  })

  it('fails closed when an unaffiliated tenant session cannot resolve LP identity', async () => {
    const identity = await resolveBrowserFundIdentity({
      admin: adminClient({}) as never,
      session: { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'rpc failed' } }) } as never,
      userId: 'user-1',
      tenantFundId: FUND_ALPHA,
      resolveLinkedLpFund: vi.fn(),
    })

    expect(identity.matches).toBe(false)
  })

  it('rejects a disabled LP session even on the persisted Fund Host', async () => {
    const identity = await resolveBrowserFundIdentity({
      admin: adminClient({ lpAccount: { id: 'lp-account-1', status: 'disabled' } }) as never,
      session: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } as never,
      userId: 'user-1',
      tenantFundId: FUND_ALPHA,
      resolveLinkedLpFund: vi.fn().mockResolvedValue(FUND_ALPHA),
    })

    expect(identity).toMatchObject({
      matches: false,
      identityFundId: FUND_ALPHA,
      lpStatus: 'disabled',
    })
  })
})
