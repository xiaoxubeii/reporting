import { describe, expect, it } from 'vitest'
import { matchAuthenticatedIdentityToTenant } from './identity'

describe('authenticated tenant identity match', () => {
  it('accepts same-Fund GP, LP, and dual-role identities', () => {
    expect(matchAuthenticatedIdentityToTenant('alpha', 'alpha', null)).toEqual({ matches: true, identityFundId: 'alpha' })
    expect(matchAuthenticatedIdentityToTenant('alpha', null, 'alpha')).toEqual({ matches: true, identityFundId: 'alpha' })
    expect(matchAuthenticatedIdentityToTenant('alpha', 'alpha', 'alpha')).toEqual({ matches: true, identityFundId: 'alpha' })
  })

  it('rejects wrong-Fund and internally ambiguous identities', () => {
    expect(matchAuthenticatedIdentityToTenant('beta', 'alpha', null)).toEqual({ matches: false, identityFundId: 'alpha' })
    expect(matchAuthenticatedIdentityToTenant('alpha', 'alpha', 'beta')).toEqual({ matches: false, identityFundId: null })
  })

  it('allows pre-Fund onboarding and legacy/platform login', () => {
    expect(matchAuthenticatedIdentityToTenant('alpha', null, null)).toEqual({ matches: true, identityFundId: null })
    expect(matchAuthenticatedIdentityToTenant(null, 'alpha', null)).toEqual({ matches: true, identityFundId: 'alpha' })
  })
})
