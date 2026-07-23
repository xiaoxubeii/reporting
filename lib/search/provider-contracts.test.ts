import { describe, expect, it } from 'vitest'
import {
  ORIGIN_PRIORITY,
  MERGE_BUCKET_ORDER,
  PROVIDER_LIMITS,
  SearchProviderError,
  SPECIALIZED_SOURCE_DESCRIPTORS,
  normalizeProviderError,
} from './provider-contracts'

describe('Search provider contracts', () => {
  it('fixes the three provider result windows and exact origin priority', () => {
    expect(PROVIDER_LIMITS).toEqual({ feed: 10, web: 10, specialized: 5, final: 30 })
    expect(ORIGIN_PRIORITY).toEqual({ feed: 0, specialized: 1, web: 2 })
    expect(MERGE_BUCKET_ORDER).toEqual([
      'feeds', 'pubmed', 'clinical_trials', 'fda', 'tctmd', 'massdevice', 'web',
    ])
    expect(Object.isFrozen(PROVIDER_LIMITS)).toBe(true)
    expect(Object.isFrozen(ORIGIN_PRIORITY)).toBe(true)
  })

  it('registers exactly the five direct specialized adapters', () => {
    expect(SPECIALIZED_SOURCE_DESCRIPTORS).toEqual([
      { id: 'pubmed', label: 'PubMed', adapterType: 'api', liveTransportAvailable: true },
      { id: 'clinical_trials', label: 'ClinicalTrials.gov', adapterType: 'api', liveTransportAvailable: true },
      { id: 'fda', label: 'FDA/openFDA · 510(k)', adapterType: 'api', liveTransportAvailable: true },
      { id: 'tctmd', label: 'TCTMD', adapterType: 'website', liveTransportAvailable: false },
      { id: 'massdevice', label: 'MassDevice', adapterType: 'website', liveTransportAvailable: false },
    ])
    expect(Object.isFrozen(SPECIALIZED_SOURCE_DESCRIPTORS)).toBe(true)
    expect(SPECIALIZED_SOURCE_DESCRIPTORS.every(Object.isFrozen)).toBe(true)
  })

  it.each([
    [new DOMException('aborted', 'AbortError'), 'timeout', true],
    [new SearchProviderError('rate_limited', 'limited', { retryable: true }), 'rate_limited', true],
    [new SearchProviderError('invalid_response', 'bad upstream'), 'invalid_response', false],
    [new Error('secret upstream detail'), 'failed', true],
  ] as const)('normalizes provider errors without leaking raw messages %#', (error, code, retryable) => {
    const normalized = normalizeProviderError(error)
    expect(normalized.code).toBe(code)
    expect(normalized.retryable).toBe(retryable)
    if (!(error instanceof SearchProviderError)) {
      expect(normalized.message).not.toContain(error.message)
    }
  })
})
