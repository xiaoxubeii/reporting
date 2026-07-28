import { describe, expect, it } from 'vitest'

import { isPublicSearchHostname } from './public-identity'

describe('public Search hostname validation', () => {
  it('accepts ICANN public company hostnames', () => {
    expect(isPublicSearchHostname('company.com')).toBe(true)
    expect(isPublicSearchHostname('research.company.co.uk')).toBe(true)
  })

  it('rejects IPs, local names, special-use suffixes, and reserved examples', () => {
    for (const hostname of [
      '10.0.0.1',
      'localhost',
      'secret.onion',
      'host.home.arpa',
      'service.internal',
      'example.com',
      'sub.example.org',
    ]) {
      expect(isPublicSearchHostname(hostname), hostname).toBe(false)
    }
  })
})
