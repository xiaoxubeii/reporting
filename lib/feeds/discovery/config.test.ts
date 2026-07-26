import { describe, expect, it } from 'vitest'

import { createDiscoveryVersions, validateDiscoveryFundId } from './config'

const FUND_ID = '7b2d62d7-58cf-4684-8c31-7e4c43b9949e'

describe('Feed discovery fund context', () => {
  it('accepts a verified fund UUID passed by the caller', () => {
    expect(validateDiscoveryFundId(FUND_ID)).toBe(FUND_ID)
  })

  it.each([undefined, '', 'first', '00000000-0000-0000-0000-000000000000', `${FUND_ID}\n`])(
    'rejects an unsafe fund context %j',
    value => {
      expect(() => validateDiscoveryFundId(value)).toThrow('Feed discovery AI configuration is unavailable')
    },
  )

  it('derives bounded independent versions from a secret-free fingerprint', () => {
    const versions = createDiscoveryVersions('a'.repeat(64))

    expect(versions).toEqual({
      semantic: `semantic-v1-${'a'.repeat(24)}`,
      classifier: `deal-signal-v1-${'a'.repeat(24)}`,
    })
    expect(versions.semantic.length).toBeLessThanOrEqual(100)
    expect(versions.classifier.length).toBeLessThanOrEqual(100)
  })
})
