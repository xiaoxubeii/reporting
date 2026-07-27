import { afterEach, describe, expect, it } from 'vitest'
import {
  deriveFundEmailDomain,
  formatFundSender,
  fundEmailBaseDomain,
  normalizeFundEmailSlug,
  normalizeUserMailboxLocalPart,
} from './domain'

describe('Fund email domain and identity validation', () => {
  afterEach(() => delete process.env.FUND_EMAIL_BASE_DOMAIN)

  it('derives one exact normalized Fund subdomain', () => {
    expect(deriveFundEmailDomain(' CCI ', 'FundWorkspace.COM')).toBe('cci.fundworkspace.com')
    expect(normalizeFundEmailSlug('Fund-42')).toBe('fund-42')
  })

  it('renders an immutable legacy domain without reopening it for new Funds', () => {
    expect(deriveFundEmailDomain('mail', 'fundworkspace.com')).toBe('mail.fundworkspace.com')
    expect(() => normalizeFundEmailSlug('mail')).toThrow(/reserved/i)
  })

  it.each(['www', 'api', 'mail', 'auth', 'admin', 'support', 'postmaster', 'abuse']) (
    'rejects reserved Fund slug %s',
    (value) => expect(() => normalizeFundEmailSlug(value)).toThrow(/reserved/i),
  )

  it.each(['-cci', 'cci-', 'c_ci', '中基', 'a'.repeat(64), '*.cci', 'cci.example.com']) (
    'rejects malformed Fund slug %s',
    (value) => expect(() => normalizeFundEmailSlug(value)).toThrow(/slug/i),
  )

  it('requires an explicit valid base domain and never accepts a wildcard', () => {
    expect(() => fundEmailBaseDomain()).toThrow(/FUND_EMAIL_BASE_DOMAIN/i)
    process.env.FUND_EMAIL_BASE_DOMAIN = '*.fundworkspace.com'
    expect(() => fundEmailBaseDomain()).toThrow(/domain/i)
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    expect(fundEmailBaseDomain()).toBe('fundworkspace.com')
  })

  it('normalizes user local parts but reserves shared and infrastructure mailboxes', () => {
    expect(normalizeUserMailboxLocalPart(' Alice.Smith ')).toBe('alice.smith')
    for (const localPart of ['pitch', 'expert', 'postmaster', 'abuse', 'admin', 'support']) {
      expect(() => normalizeUserMailboxLocalPart(localPart)).toThrow(/reserved/i)
    }
    for (const localPart of ['.alice', 'alice.', 'alice..smith', 'ali ce', '中']) {
      expect(() => normalizeUserMailboxLocalPart(localPart)).toThrow(/mailbox/i)
    }
  })

  it('derives a safe From identity and rejects header injection', () => {
    expect(formatFundSender('Alice', 'alice', 'cci.fundworkspace.com')).toBe(
      'Alice <alice@cci.fundworkspace.com>',
    )
    expect(() => formatFundSender('Alice\r\nBcc: victim@example.com', 'alice', 'cci.fundworkspace.com'))
      .toThrow(/header/i)
  })
})
