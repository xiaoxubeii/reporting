import { describe, expect, it } from 'vitest'
import {
  MAX_SEARCH_QUERY_LENGTH,
  SearchContractError,
  parseSearchRequest,
} from './contracts'

describe('parseSearchRequest', () => {
  it('accepts the fixed source catalog and returns immutable normalized input', () => {
    const request = parseSearchRequest({
      query: '  AI radiology  ',
      sources: {
        feeds: true,
        web: false,
        specialized: ['pubmed', 'clinical_trials', 'fda', 'tctmd', 'massdevice'],
      },
    })

    expect(request).toEqual({
      query: 'AI radiology',
      sources: {
        feeds: true,
        web: false,
        specialized: ['pubmed', 'clinical_trials', 'fda', 'tctmd', 'massdevice'],
      },
    })
    expect(Object.isFrozen(request)).toBe(true)
    expect(Object.isFrozen(request.sources)).toBe(true)
    expect(Object.isFrozen(request.sources.specialized)).toBe(true)
  })

  it('canonicalizes professional selections to the fixed catalog order', () => {
    const request = parseSearchRequest({
      query: 'devices',
      sources: {
        feeds: false,
        web: false,
        specialized: ['massdevice', 'fda', 'pubmed'],
      },
    })

    expect(request.sources.specialized).toEqual(['pubmed', 'fda', 'massdevice'])
  })

  it.each([
    [{ query: '', sources: { feeds: true, web: false, specialized: [] } }, 'query'],
    [{ query: 'x'.repeat(MAX_SEARCH_QUERY_LENGTH + 1), sources: { feeds: true, web: false, specialized: [] } }, 'query'],
    [{ query: 'alpha\nbeta', sources: { feeds: true, web: false, specialized: [] } }, 'query'],
    [{ query: 'alpha', sources: { feeds: false, web: false, specialized: [] } }, 'source'],
    [{ query: 'alpha', sources: { feeds: false, web: false, specialized: ['unknown'] } }, 'source'],
    [{ query: 'alpha', sources: { feeds: false, web: false, specialized: ['pubmed', 'pubmed'] } }, 'source'],
  ])('rejects invalid query/source input %#', (value, message) => {
    expect(() => parseSearchRequest(value)).toThrow(SearchContractError)
    expect(() => parseSearchRequest(value)).toThrow(message)
  })

  it.each([
    { query: 'alpha', sources: { feeds: true, web: false, specialized: [] }, endpoint: 'https://evil.test' },
    { query: 'alpha', sources: { feeds: true, web: false, specialized: [], engines: ['bing'] } },
    { query: 'alpha', sources: { feeds: true, web: false, specialized: [], selector: '.result' } },
    { query: 'alpha', sources: { feeds: 1, web: false, specialized: [] } },
  ])('rejects client-controlled or mistyped fields %#', value => {
    expect(() => parseSearchRequest(value)).toThrow(SearchContractError)
  })
})
