import { describe, expect, it } from 'vitest'

import {
  FUND_TENANT_SLUG_HEADER,
  canonicalFundOrigin,
  canonicalFundRequestOrigin,
  canonicalPlatformOrigin,
  classifyFundHost,
  classifyFundRequestHost,
  normalizeFundSlugCandidate,
  sanitizeTenantRequestHeaders,
} from './host'

describe('request Fund host classification', () => {
  it('uses Host when Next.js nextUrl reflects an internal listener', () => {
    const request = {
      headers: new Headers({ host: 'alpha.localhost:5040', 'x-forwarded-host': 'attacker.example' }),
      nextUrl: { host: '127.0.0.1:5040' },
    }
    expect(classifyFundRequestHost(request, 'localhost')).toEqual({
      mode: 'tenant',
      hostname: 'alpha.localhost',
      rootDomain: 'localhost',
      slug: 'alpha',
    })
  })
})

describe('fund tenant host classification', () => {
  it('preserves legacy self-host behavior when no root domain is configured', () => {
    expect(classifyFundHost('preview.example.test', undefined)).toEqual({ mode: 'legacy' })
    expect(classifyFundHost('anything.localhost:5010', '  ')).toEqual({ mode: 'legacy' })
  })

  it('classifies the exact platform root and one tenant label', () => {
    expect(classifyFundHost('fundworkspace.com', 'fundworkspace.com')).toEqual({
      mode: 'platform',
      hostname: 'fundworkspace.com',
      rootDomain: 'fundworkspace.com',
    })
    expect(classifyFundHost('Alpha.fundworkspace.com.:443', 'FUNDWORKSPACE.COM.')).toEqual({
      mode: 'tenant',
      hostname: 'alpha.fundworkspace.com',
      rootDomain: 'fundworkspace.com',
      slug: 'alpha',
    })
    expect(classifyFundHost('alpha.localhost:5010', 'localhost')).toEqual({
      mode: 'tenant',
      hostname: 'alpha.localhost',
      rootDomain: 'localhost',
      slug: 'alpha',
    })
  })

  it.each([
    'alpha.fundworkspace.com.evil.example',
    'deep.alpha.fundworkspace.com',
    'fundworkspace.com.evil',
    'alpha..fundworkspace.com',
    'alpha.fundworkspace.com:abc',
    'alpha.fundworkspace.com,evil.example',
    'alpha.fundworkspace.com evil.example',
    'https://alpha.fundworkspace.com',
    'alpha\\.fundworkspace.com',
    'xn--fund-9za.fundworkspace.com',
    '',
  ])('rejects malformed, ambiguous, or attacker-controlled host %j', rawHost => {
    expect(classifyFundHost(rawHost, 'fundworkspace.com').mode).toBe('invalid')
  })

  it.each(['www', 'api', 'auth', 'admin', 'hooks', 'internal', 'support', 'fundworkspace']) (
    'classifies reserved label %s without treating it as a Fund',
    label => {
      expect(classifyFundHost(`${label}.fundworkspace.com`, 'fundworkspace.com')).toEqual({
        mode: 'reserved',
        hostname: `${label}.fundworkspace.com`,
        rootDomain: 'fundworkspace.com',
        label,
      })
    },
  )

  it.each(['-alpha', 'alpha-', 'a_b', 'A B', '中文', 'xn--alpha', 'a'.repeat(64)])(
    'rejects invalid tenant label %j',
    label => {
      expect(classifyFundHost(`${label}.fundworkspace.com`, 'fundworkspace.com').mode).toBe('invalid')
    },
  )

  it('rejects an invalid configured root instead of silently weakening host checks', () => {
    expect(() => classifyFundHost('alpha.example.com', '.example.com')).toThrow('Invalid Fund workspace root domain')
    expect(() => classifyFundHost('alpha.example.com', 'https://example.com')).toThrow('Invalid Fund workspace root domain')
  })

  it('builds canonical HTTPS origins only from a valid persisted slug and root', () => {
    expect(canonicalFundOrigin('alpha', { FUND_WORKSPACE_ROOT_DOMAIN: 'fundworkspace.com' })).toBe(
      'https://alpha.fundworkspace.com',
    )
    expect(canonicalFundOrigin('alpha', { FUND_WORKSPACE_ROOT_DOMAIN: 'localhost', FUND_WORKSPACE_DEV_PORT: '5010' })).toBe(
      'http://alpha.localhost:5010',
    )
    expect(() => canonicalFundOrigin('api', { FUND_WORKSPACE_ROOT_DOMAIN: 'fundworkspace.com' })).toThrow('Invalid Fund slug')
    expect(() => canonicalFundOrigin('alpha', {})).toThrow('Fund workspace root domain is not configured')
  })

  it('builds the canonical platform origin without a tenant label', () => {
    expect(canonicalPlatformOrigin({ FUND_WORKSPACE_ROOT_DOMAIN: 'fundworkspace.com' }))
      .toBe('https://fundworkspace.com')
    expect(canonicalPlatformOrigin({
      FUND_WORKSPACE_ROOT_DOMAIN: 'localhost',
      FUND_WORKSPACE_DEV_PORT: '5010',
    })).toBe('http://localhost:5010')
  })

  it('builds redirect origins from trusted Host when Next.js exposes an internal listener URL', () => {
    const request = {
      headers: new Headers({ host: 'alpha.localhost:5010' }),
      nextUrl: { host: '127.0.0.1:5010' },
      url: 'http://127.0.0.1:5010/dashboard',
    }
    expect(canonicalFundRequestOrigin(request, {
      FUND_WORKSPACE_ROOT_DOMAIN: 'localhost',
      FUND_WORKSPACE_DEV_PORT: '5010',
    })).toBe('http://alpha.localhost:5010')
  })

  it('preserves a validated localhost request port when no development port is configured', () => {
    const request = {
      headers: new Headers({ host: 'alpha.localhost:5040' }),
      nextUrl: { host: '127.0.0.1:5040' },
      url: 'http://127.0.0.1:5040/dashboard',
    }
    expect(canonicalFundRequestOrigin(request, {
      FUND_WORKSPACE_ROOT_DOMAIN: 'localhost',
    })).toBe('http://alpha.localhost:5040')
  })

  it('normalizes readable ASCII names and returns null when no DNS-safe text remains', () => {
    expect(normalizeFundSlugCandidate(' SceneAct AI Ventures ')).toBe('sceneact-ai-ventures')
    expect(normalizeFundSlugCandidate('A___B / C')).toBe('a-b-c')
    expect(normalizeFundSlugCandidate('中国基金')).toBeNull()
    expect(normalizeFundSlugCandidate('api')).toBeNull()
  })

  it('removes forged tenant headers and injects only the trusted hostname slug', () => {
    const incoming = new Headers({
      [FUND_TENANT_SLUG_HEADER]: 'fund-b',
      'x-reporting-tenant-fund-id': 'forged',
      'x-safe': 'keep',
    })
    const sanitized = sanitizeTenantRequestHeaders(incoming, 'fund-a')

    expect(sanitized.get(FUND_TENANT_SLUG_HEADER)).toBe('fund-a')
    expect(sanitized.get('x-reporting-tenant-fund-id')).toBeNull()
    expect(sanitized.get('x-safe')).toBe('keep')
    expect(incoming.get(FUND_TENANT_SLUG_HEADER)).toBe('fund-b')
  })
})
