import { describe, expect, it, vi } from 'vitest'
import { FUND_TENANT_SLUG_HEADER } from './host'
import { fundMatchesTrustedRequestTenant, getTrustedRequestTenant, trustedTenantSlugFromHeaders } from './request'

describe('trusted request tenant', () => {
  it('accepts only the validated middleware tenant header', () => {
    expect(trustedTenantSlugFromHeaders(new Headers({ [FUND_TENANT_SLUG_HEADER]: 'alpha-fund' })))
      .toBe('alpha-fund')
    expect(trustedTenantSlugFromHeaders(new Headers({ [FUND_TENANT_SLUG_HEADER]: 'admin' })))
      .toBeNull()
    expect(trustedTenantSlugFromHeaders(new Headers({ [FUND_TENANT_SLUG_HEADER]: 'bad.example' })))
      .toBeNull()
    expect(trustedTenantSlugFromHeaders(new Headers())).toBeNull()
  })

  it('resolves the exact trusted slug through the public descriptor boundary', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: '82000000-0000-4000-8000-000000000001',
        slug: 'alpha-fund',
        name: 'Alpha Fund',
        logo_url: null,
        theme: null,
      }],
      error: null,
    })
    const headers = new Headers({ [FUND_TENANT_SLUG_HEADER]: 'alpha-fund' })
    await expect(getTrustedRequestTenant({ rpc } as never, headers)).resolves.toMatchObject({
      id: '82000000-0000-4000-8000-000000000001',
      slug: 'alpha-fund',
    })
    expect(rpc).toHaveBeenCalledWith('resolve_public_fund_host', { p_slug: 'alpha-fund' })
  })

  it('returns null on platform/legacy requests without a tenant header', async () => {
    const rpc = vi.fn()
    await expect(getTrustedRequestTenant({ rpc } as never, new Headers())).resolves.toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('compares client-supplied Fund IDs to the trusted tenant and preserves platform mode', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: '82000000-0000-4000-8000-000000000001',
        slug: 'alpha-fund',
        name: 'Alpha Fund',
        logo_url: null,
        theme: null,
      }],
      error: null,
    })
    const tenantHeaders = new Headers({ [FUND_TENANT_SLUG_HEADER]: 'alpha-fund' })
    await expect(fundMatchesTrustedRequestTenant(
      { rpc } as never,
      tenantHeaders,
      '82000000-0000-4000-8000-000000000001',
    )).resolves.toBe(true)
    await expect(fundMatchesTrustedRequestTenant(
      { rpc } as never,
      tenantHeaders,
      '82000000-0000-4000-8000-000000000002',
    )).resolves.toBe(false)
    await expect(fundMatchesTrustedRequestTenant({ rpc } as never, new Headers(), 'any-fund'))
      .resolves.toBe(true)
  })
})
