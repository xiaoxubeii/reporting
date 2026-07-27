import { describe, expect, it } from 'vitest'
import { selectPortalBranding } from './portal-branding'

const tenant = {
  id: '82000000-0000-4000-8000-000000000001',
  slug: 'alpha-fund',
  name: 'Alpha Fund',
  logoUrl: 'https://assets.example.test/alpha.png',
  theme: { accent: '217 91% 60%' },
}

const linkedFund = {
  fundId: tenant.id,
  name: 'Alpha Fund from LP graph',
  logoUrl: null,
  theme: null,
}

describe('selectPortalBranding', () => {
  it('uses the exact Host descriptor before LP activation has resolved a Fund', () => {
    expect(selectPortalBranding(tenant, null)).toEqual({
      allowed: true,
      branding: {
        fundId: tenant.id,
        name: tenant.name,
        logoUrl: tenant.logoUrl,
        theme: tenant.theme,
      },
    })
  })

  it('rejects a Host Fund that differs from the LP access graph', () => {
    expect(selectPortalBranding(tenant, {
      ...linkedFund,
      fundId: '82000000-0000-4000-8000-000000000002',
    })).toEqual({ allowed: false })
  })

  it('prefers Host branding for a matching tenant and preserves legacy branding', () => {
    expect(selectPortalBranding(tenant, linkedFund)).toMatchObject({
      allowed: true,
      branding: { name: 'Alpha Fund', logoUrl: tenant.logoUrl },
    })
    expect(selectPortalBranding(null, linkedFund)).toEqual({ allowed: true, branding: linkedFund })
  })
})
