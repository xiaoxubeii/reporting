import { afterEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { authorizationResponseUrl, issuerFor, resourceFor } from './metadata'

afterEach(() => {
  delete process.env.FUND_WORKSPACE_ROOT_DOMAIN
  delete process.env.FUND_WORKSPACE_DEV_PORT
  delete process.env.NEXT_PUBLIC_SITE_URL
})

describe('OAuth canonical tenant origin', () => {
  it('ignores forwarded Host injection and uses the canonical tenant origin', () => {
    process.env.FUND_WORKSPACE_ROOT_DOMAIN = 'localhost'
    process.env.FUND_WORKSPACE_DEV_PORT = '5010'
    const req = new NextRequest('http://alpha-fund.localhost:5010/.well-known/oauth-authorization-server', {
      headers: { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' },
    })
    expect(issuerFor(req)).toBe('http://alpha-fund.localhost:5010')
    expect(resourceFor(req)).toBe('http://alpha-fund.localhost:5010/api/mcp')
  })

  it('uses Host instead of an internal Next.js listener URL', () => {
    process.env.FUND_WORKSPACE_ROOT_DOMAIN = 'localhost'
    process.env.FUND_WORKSPACE_DEV_PORT = '5040'
    const req = new NextRequest('http://127.0.0.1:5040/.well-known/oauth-authorization-server', {
      headers: { host: 'alpha.localhost:5040', 'x-forwarded-host': 'evil.example' },
    })
    expect(issuerFor(req)).toBe('http://alpha.localhost:5040')
    expect(resourceFor(req)).toBe('http://alpha.localhost:5040/api/mcp')
  })

  it('uses the configured production root for platform metadata', () => {
    process.env.FUND_WORKSPACE_ROOT_DOMAIN = 'fundworkspace.com'
    const req = new NextRequest('https://fundworkspace.com/.well-known/oauth-authorization-server')
    expect(issuerFor(req)).toBe('https://fundworkspace.com')
  })

  it('preserves legacy self-host behavior when tenant hosting is disabled', () => {
    const req = new NextRequest('https://self-host.example/.well-known/oauth-authorization-server', {
      headers: { 'x-forwarded-host': 'proxy.example', 'x-forwarded-proto': 'https' },
    })
    expect(issuerFor(req)).toBe('https://proxy.example')
  })
})

describe('OAuth authorization response', () => {
  it('includes the canonical issuer for both success and denial redirects', () => {
    const issuer = 'https://alpha.fundworkspace.com'
    const success = new URL(authorizationResponseUrl(
      'https://client.example/callback',
      { code: 'code-1', state: 'state-1' },
      issuer,
    ))
    const denial = new URL(authorizationResponseUrl(
      'https://client.example/callback',
      { error: 'access_denied', state: 'state-1' },
      issuer,
    ))

    expect(success.searchParams.get('iss')).toBe(issuer)
    expect(success.searchParams.get('code')).toBe('code-1')
    expect(denial.searchParams.get('iss')).toBe(issuer)
    expect(denial.searchParams.get('error')).toBe('access_denied')
  })
})
