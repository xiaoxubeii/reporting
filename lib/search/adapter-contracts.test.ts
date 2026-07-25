import { describe, expect, it } from 'vitest'
import {
  ORIGIN_PRIORITY,
  SEARCH_ADAPTER_DESCRIPTORS,
  SEARCH_ADAPTER_IDS,
  SearchAdapterError,
  normalizeAdapterError,
} from './adapter-contracts'

describe('Search adapter contracts', () => {
  it('registers Feed, Web, API, and Website adapters in deterministic merge order', () => {
    expect(SEARCH_ADAPTER_IDS).toEqual(['feeds', 'pubmed', 'clinical_trials', 'fda', 'tctmd', 'massdevice', 'web'])
    expect(SEARCH_ADAPTER_DESCRIPTORS.map(value => value.id)).toEqual(SEARCH_ADAPTER_IDS)
    expect(ORIGIN_PRIORITY).toEqual({ feed: 0, specialized: 1, web: 2 })
    expect(SEARCH_ADAPTER_DESCRIPTORS.every(Object.isFrozen)).toBe(true)
  })

  it.each([
    [new DOMException('aborted', 'AbortError'), 'timeout', true],
    [new SearchAdapterError('rate_limited', 'limited'), 'rate_limited', true],
    [new SearchAdapterError('invalid_response', 'bad upstream'), 'invalid_response', false],
    [new Error('secret upstream detail'), 'failed', true],
  ] as const)('normalizes adapter errors without leaking raw messages %#', (error, code, retryable) => {
    const normalized = normalizeAdapterError(error)
    expect(normalized.code).toBe(code)
    expect(normalized.retryable).toBe(retryable)
    expect(normalized.message).not.toContain('secret')
  })
})
