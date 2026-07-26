import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPlatformEmailConfiguration, sendPlatformEmail } from './system'

describe('platform Resend mail', () => {
  afterEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.SYSTEM_EMAIL_FROM
    delete process.env.FUND_EMAIL_BASE_DOMAIN
  })

  it('loads only environment-owned platform configuration', () => {
    process.env.RESEND_API_KEY = 're_platform'
    process.env.SYSTEM_EMAIL_FROM = 'FundWorkspace <no-reply@fundworkspace.com>'
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    expect(getPlatformEmailConfiguration()).toEqual({
      apiKey: 're_platform',
      from: 'FundWorkspace <no-reply@fundworkspace.com>',
    })
  })

  it('fails closed when platform key/sender is missing or sender is a Fund subdomain', () => {
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    expect(() => getPlatformEmailConfiguration()).toThrow(/platform email/i)
    process.env.RESEND_API_KEY = 're_platform'
    process.env.SYSTEM_EMAIL_FROM = 'CCI <no-reply@cci.fundworkspace.com>'
    expect(() => getPlatformEmailConfiguration()).toThrow(/fundworkspace.com/i)
  })

  it('derives From on the server and cannot use a Fund provider', async () => {
    process.env.RESEND_API_KEY = 're_platform'
    process.env.SYSTEM_EMAIL_FROM = 'FundWorkspace <no-reply@fundworkspace.com>'
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    const send = vi.fn().mockResolvedValue({ id: 'platform-message-1' })
    const result = await sendPlatformEmail({
      to: 'member@example.test',
      subject: 'Verify your account',
      html: '<p>Verify</p>',
      text: 'Verify',
      idempotencyKey: 'platform:verification:1',
    }, { send })

    expect(result).toEqual({ id: 'platform-message-1' })
    expect(send).toHaveBeenCalledWith(
      { provider: 'resend', apiKey: 're_platform' },
      expect.objectContaining({
        from: 'FundWorkspace <no-reply@fundworkspace.com>',
        to: 'member@example.test',
      }),
    )
  })
})
