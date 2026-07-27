import { describe, expect, it } from 'vitest'
import type { FundHostContext } from '@/lib/tenancy/host'
import { publicRootSurface } from './public-root'

describe('publicRootSurface', () => {
  const platform: FundHostContext = {
    mode: 'platform',
    hostname: 'fundworkspace.example',
    rootDomain: 'fundworkspace.example',
  }
  const tenant: FundHostContext = {
    mode: 'tenant',
    hostname: 'northstar.fundworkspace.example',
    rootDomain: 'fundworkspace.example',
    slug: 'northstar',
  }

  it('gives only the hosted platform root a full-width landing surface', () => {
    expect(publicRootSurface(platform, '/')).toBe('platform-landing')
    expect(publicRootSurface(platform, '/pricing')).toBe('public-shell')
  })

  it('keeps a tenant root on its dedicated public homepage', () => {
    expect(publicRootSurface(tenant, '/')).toBe('tenant-home')
    expect(publicRootSurface(tenant, '/auth')).toBe('public-shell')
  })

  it('keeps legacy, reserved, and invalid requests on the existing public shell', () => {
    expect(publicRootSurface({ mode: 'legacy' }, '/')).toBe('public-shell')
    expect(publicRootSurface({
      mode: 'reserved',
      hostname: 'www.fundworkspace.example',
      rootDomain: 'fundworkspace.example',
      label: 'www',
    }, '/')).toBe('public-shell')
    expect(publicRootSurface({ mode: 'invalid', reason: 'foreign host' }, '/')).toBe('public-shell')
  })
})
