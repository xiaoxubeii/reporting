import { afterEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { admitsRegisteredSystemRequest } from './system-request'

afterEach(() => {
  delete process.env.FUND_WORKSPACE_ROOT_DOMAIN
})

describe('registered system request admission', () => {
  it('rejects inbound providers on tenant hosts', () => {
    process.env.FUND_WORKSPACE_ROOT_DOMAIN = 'fundworkspace.com'
    const request = new NextRequest('https://alpha.fundworkspace.com/api/inbound-email', {
      method: 'POST',
    })
    expect(admitsRegisteredSystemRequest(request)).toBe(false)
  })

  it('admits both inbound provider routes on the hooks host', () => {
    process.env.FUND_WORKSPACE_ROOT_DOMAIN = 'fundworkspace.com'
    for (const path of ['/api/inbound-email', '/api/inbound-email/mailgun']) {
      const request = new NextRequest(`https://hooks.fundworkspace.com${path}`, { method: 'POST' })
      expect(admitsRegisteredSystemRequest(request)).toBe(true)
    }
  })

  it('preserves legacy self-host behavior', () => {
    const request = new NextRequest('http://localhost:3000/api/inbound-email', { method: 'POST' })
    expect(admitsRegisteredSystemRequest(request)).toBe(true)
  })
})
