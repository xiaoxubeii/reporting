import { describe, expect, it } from 'vitest'
import type { FundHostContext } from './host'
import { classifyFundHost, isValidFundSlug } from './host'
import { admitFundHostRoute } from './route-authority'

const legacy: FundHostContext = { mode: 'legacy' }
const platform: FundHostContext = {
  mode: 'platform',
  hostname: 'fundworkspace.com',
  rootDomain: 'fundworkspace.com',
}
const tenant: FundHostContext = {
  mode: 'tenant',
  hostname: 'alpha.fundworkspace.com',
  rootDomain: 'fundworkspace.com',
  slug: 'alpha',
}
const internal: FundHostContext = {
  mode: 'reserved',
  hostname: 'internal.fundworkspace.com',
  rootDomain: 'fundworkspace.com',
  label: 'internal',
}
const hooks: FundHostContext = {
  mode: 'reserved',
  hostname: 'hooks.fundworkspace.com',
  rootDomain: 'fundworkspace.com',
  label: 'hooks',
}
const invalid: FundHostContext = { mode: 'invalid', reason: 'outside root' }

describe('Fund Host x route authority registry', () => {
  it('keeps newly-reserved legacy tenant Hosts routable but unavailable for new Funds', () => {
    expect(isValidFundSlug('mail')).toBe(false)
    expect(classifyFundHost('mail.fundworkspace.com', 'fundworkspace.com')).toMatchObject({
      mode: 'tenant',
      slug: 'mail',
    })
    expect(classifyFundHost('internal.fundworkspace.com', 'fundworkspace.com')).toMatchObject({
      mode: 'reserved',
      label: 'internal',
    })
  })
  it('preserves every existing route in legacy self-host mode', () => {
    expect(admitFundHostRoute(legacy, '/dashboard', 'GET')).toEqual({ allowed: true, authority: 'legacy' })
    expect(admitFundHostRoute(legacy, '/api/cron/background-jobs', 'POST')).toEqual({ allowed: true, authority: 'legacy' })
  })

  it('denies every route on invalid or unknown Host classes', () => {
    expect(admitFundHostRoute(invalid, '/', 'GET')).toEqual({ allowed: false, reason: 'invalid-host' })
    expect(admitFundHostRoute(invalid, '/api/internal/background-jobs/deal-research/run', 'POST', true))
      .toEqual({ allowed: false, reason: 'invalid-host' })
  })

  it('admits tenant public, auth, onboarding, GP, LP, and session API paths', () => {
    expect(admitFundHostRoute(tenant, '/', 'GET')).toMatchObject({ allowed: true, authority: 'tenant' })
    expect(admitFundHostRoute(tenant, '/auth/callback', 'GET')).toMatchObject({ allowed: true, authority: 'tenant' })
    expect(admitFundHostRoute(tenant, '/onboarding', 'GET')).toMatchObject({ allowed: true, authority: 'tenant' })
    expect(admitFundHostRoute(tenant, '/dashboard', 'GET')).toMatchObject({ allowed: true, authority: 'tenant' })
    expect(admitFundHostRoute(tenant, '/portal/overview', 'GET')).toMatchObject({ allowed: true, authority: 'tenant' })
    expect(admitFundHostRoute(tenant, '/api/companies', 'GET')).toMatchObject({ allowed: true, authority: 'tenant' })
    expect(admitFundHostRoute(tenant, '/submit/fund-token', 'GET')).toMatchObject({ allowed: true, authority: 'tenant' })
  })

  it('denies setup, new-Fund creation, workers, cron, and webhooks on tenant Hosts', () => {
    expect(admitFundHostRoute(tenant, '/setup', 'GET')).toEqual({ allowed: false, reason: 'platform-route-on-tenant' })
    expect(admitFundHostRoute(tenant, '/api/setup', 'POST')).toEqual({ allowed: false, reason: 'platform-route-on-tenant' })
    expect(admitFundHostRoute(tenant, '/api/onboarding/fund', 'POST')).toEqual({ allowed: false, reason: 'fund-creation-on-tenant' })
    expect(admitFundHostRoute(tenant, '/api/cron/background-jobs', 'GET')).toEqual({ allowed: false, reason: 'system-route-on-tenant' })
    expect(admitFundHostRoute(tenant, '/api/cron/background-jobs', 'POST')).toEqual({ allowed: false, reason: 'system-route-on-tenant' })
    expect(admitFundHostRoute(tenant, '/api/internal/background-jobs/deal-research/run', 'POST', true)).toEqual({ allowed: false, reason: 'system-route-on-tenant' })
    expect(admitFundHostRoute(tenant, '/api/inbound-email', 'POST')).toEqual({ allowed: false, reason: 'system-route-on-tenant' })
    expect(admitFundHostRoute(tenant, '/api/search', 'POST', true)).toEqual({ allowed: false, reason: 'system-route-on-tenant' })
  })

  it('admits only global/platform and registered system surfaces on the platform root', () => {
    for (const [path, method] of [
      ['/', 'GET'],
      ['/auth', 'GET'],
      ['/setup', 'GET'],
      ['/api/setup', 'POST'],
      ['/onboarding', 'GET'],
      ['/api/onboarding/fund', 'POST'],
      ['/settings/personal', 'GET'],
      ['/api/settings/personal', 'GET'],
      ['/api/settings/personal', 'PATCH'],
      ['/.well-known/oauth-authorization-server', 'GET'],
      ['/api/oauth/register', 'POST'],
      ['/api/oauth/metadata/authorization-server', 'GET'],
      ['/api/cron/background-jobs', 'GET'],
      ['/api/internal/background-jobs/deal-research/run', 'POST'],
      ['/api/inbound-email', 'POST'],
    ] as const) {
      expect(admitFundHostRoute(platform, path, method, path.includes('/internal/'))).toMatchObject({ allowed: true })
    }

    for (const path of ['/dashboard', '/portal/overview', '/submit/token', '/expert-response', '/api/companies', '/oauth/authorize', '/api/oauth/token', '/api/auth/google', '/api/auth/dropbox/callback']) {
      expect(admitFundHostRoute(platform, path, 'GET')).toEqual({ allowed: false, reason: 'tenant-route-on-platform' })
    }
  })

  it('admits only exact registered routes on reserved internal and hook Hosts', () => {
    expect(admitFundHostRoute(internal, '/api/internal/background-jobs/deal-research/run', 'POST', true))
      .toEqual({ allowed: true, authority: 'worker' })
    expect(admitFundHostRoute(internal, '/api/search', 'POST', true))
      .toEqual({ allowed: true, authority: 'worker' })
    expect(admitFundHostRoute(internal, '/api/search', 'POST', false))
      .toEqual({ allowed: false, reason: 'unregistered-system-route' })
    expect(admitFundHostRoute(internal, '/dashboard', 'GET'))
      .toEqual({ allowed: false, reason: 'unregistered-system-route' })

    expect(admitFundHostRoute(hooks, '/api/inbound-email', 'POST'))
      .toEqual({ allowed: true, authority: 'webhook' })
    expect(admitFundHostRoute(hooks, '/api/inbound-email/mailgun', 'POST'))
      .toEqual({ allowed: true, authority: 'webhook' })
    expect(admitFundHostRoute(hooks, '/api/webhooks/heartbeat/token', 'POST'))
      .toEqual({ allowed: true, authority: 'webhook' })
    expect(admitFundHostRoute(hooks, '/auth', 'GET'))
      .toEqual({ allowed: false, reason: 'unregistered-system-route' })
  })

  it('denies every route on reserved labels without a route registration', () => {
    const admin: FundHostContext = {
      mode: 'reserved',
      hostname: 'admin.fundworkspace.com',
      rootDomain: 'fundworkspace.com',
      label: 'admin',
    }
    expect(admitFundHostRoute(admin, '/', 'GET')).toEqual({ allowed: false, reason: 'unregistered-system-route' })
  })
})
