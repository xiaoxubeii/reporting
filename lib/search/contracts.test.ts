import { describe, expect, it } from 'vitest'
import {
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SEARCH_CATEGORIES,
  SearchContractError,
  parseSearchRequest,
} from './contracts'

describe('parseSearchRequest', () => {
  it('accepts bounded category IDs and returns immutable normalized input', () => {
    const request = parseSearchRequest({
      query: '  AI radiology  ',
      categoryIds: ['personal-subscriptions', 'medical_literature'],
    })

    expect(request).toEqual({
      query: 'AI radiology',
      categoryIds: ['personal-subscriptions', 'medical_literature'],
    })
    expect(Object.isFrozen(request)).toBe(true)
    expect(Object.isFrozen(request.categoryIds)).toBe(true)
  })

  it.each([
    [{ query: '', categoryIds: ['web'] }, 'query'],
    [{ query: 'x'.repeat(MAX_SEARCH_QUERY_LENGTH + 1), categoryIds: ['web'] }, 'query'],
    [{ query: 'alpha\nbeta', categoryIds: ['web'] }, 'query'],
    [{ query: 'alpha', categoryIds: [] }, 'category'],
    [{ query: 'alpha', categoryIds: ['UPPER'] }, 'category'],
    [{ query: 'alpha', categoryIds: ['web', 'web'] }, 'category'],
    [{ query: 'alpha', categoryIds: Array.from({ length: MAX_SEARCH_CATEGORIES + 1 }, (_, index) => `category-${index}`) }, 'categories'],
  ])('rejects invalid query/category input %#', (value, message) => {
    expect(() => parseSearchRequest(value)).toThrow(SearchContractError)
    expect(() => parseSearchRequest(value)).toThrow(message)
  })

  it.each([
    { query: 'alpha', categoryIds: ['internet'], endpoint: 'https://evil.test' },
    { query: 'alpha', categoryIds: ['internet'], adapters: ['web'] },
    { query: 'alpha', categoryIds: ['internet'], engines: ['bing'] },
    { query: 'alpha', categoryIds: ['internet'], selector: '.result' },
    { query: 'alpha', sources: { feeds: true, web: false, specialized: [] } },
  ])('rejects client-controlled or mistyped fields %#', value => {
    expect(() => parseSearchRequest(value)).toThrow(SearchContractError)
  })
})
