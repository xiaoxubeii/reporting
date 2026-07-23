import { describe, expect, it } from 'vitest'
import {
  exploreCategoryRef,
  exploreEntryRef,
  exploreSourceRef,
  parseExploreCategoryRef,
  parseExploreEntryRef,
  parseExploreSourceRef,
} from './explore-references'

describe('Explore collector references', () => {
  it('creates and parses type-specific positive integer references', () => {
    expect(exploreCategoryRef(7)).toBe('explore-category:7')
    expect(exploreSourceRef(42)).toBe('explore-source:42')
    expect(exploreEntryRef(101)).toBe('explore-entry:101')
    expect(parseExploreCategoryRef('explore-category:7')).toBe(7)
    expect(parseExploreSourceRef('explore-source:42')).toBe(42)
    expect(parseExploreEntryRef('explore-entry:101')).toBe(101)
  })

  it('keeps namespaces distinct even when numeric ids collide', () => {
    assertInvalid(() => parseExploreSourceRef('explore-entry:42'))
    assertInvalid(() => parseExploreEntryRef('explore-source:42'))
    assertInvalid(() => parseExploreCategoryRef('explore-source:42'))
  })

  it.each([
    '',
    '42',
    'explore-source:',
    'explore-source:0',
    'explore-source:-1',
    'explore-source:1.5',
    'explore-source:+1',
    'explore-source:01',
    `explore-source:${Number.MAX_SAFE_INTEGER + 1}`,
    `explore-source:${'1'.repeat(200)}`,
  ])('rejects malformed source reference %j', value => {
    assertInvalid(() => parseExploreSourceRef(value))
  })

  it('rejects invalid ids when creating references', () => {
    for (const value of [0, -1, 1.2, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      assertInvalid(() => exploreSourceRef(value))
    }
  })

  it('never embeds a feed URL in a source reference', () => {
    const ref = exploreSourceRef(42)
    expect(ref).not.toContain('https://')
    expect(ref).toBe('explore-source:42')
  })
})

function assertInvalid(action: () => unknown) {
  let error: unknown
  try { action() } catch (value) { error = value }
  expect(error).toMatchObject({ code: 'invalid_request', status: 400 })
}
