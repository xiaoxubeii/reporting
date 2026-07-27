import { describe, expect, it } from 'vitest'

import {
  createProviderOAuthState,
  providerOAuthStateCookieName,
  verifyProviderOAuthState,
} from './provider-oauth-state'

const SECRET = 'a'.repeat(64)

describe('provider OAuth state', () => {
  it('round-trips a session-bound, expiring Google state', () => {
    const token = createProviderOAuthState({
      provider: 'google',
      fundId: 'fund-alpha',
      userId: 'user-alpha',
      returnTo: '/settings?tab=integrations',
      secret: SECRET,
      now: 1_000,
    })

    expect(verifyProviderOAuthState(token, {
      provider: 'google',
      userId: 'user-alpha',
      secret: SECRET,
      now: 1_300,
    })).toMatchObject({
      provider: 'google',
      fundId: 'fund-alpha',
      userId: 'user-alpha',
      returnTo: '/settings?tab=integrations',
    })
  })

  it('rejects tampering, another session, another provider, and expiry', () => {
    const token = createProviderOAuthState({
      provider: 'dropbox',
      fundId: 'fund-alpha',
      userId: 'user-alpha',
      returnTo: '/settings',
      secret: SECRET,
      now: 1_000,
    })

    expect(verifyProviderOAuthState(`${token}x`, {
      provider: 'dropbox', userId: 'user-alpha', secret: SECRET, now: 1_100,
    })).toBeNull()
    expect(verifyProviderOAuthState(token, {
      provider: 'dropbox', userId: 'user-beta', secret: SECRET, now: 1_100,
    })).toBeNull()
    expect(verifyProviderOAuthState(token, {
      provider: 'google', userId: 'user-alpha', secret: SECRET, now: 1_100,
    })).toBeNull()
    expect(verifyProviderOAuthState(token, {
      provider: 'dropbox', userId: 'user-alpha', secret: SECRET, now: 1_601,
    })).toBeNull()
  })

  it('uses separate host-only cookie names per provider', () => {
    expect(providerOAuthStateCookieName('google')).toBe('__Host-reporting-google-oauth-state')
    expect(providerOAuthStateCookieName('dropbox')).toBe('__Host-reporting-dropbox-oauth-state')
  })
})
