import { describe, expect, it } from 'vitest'
import { domainForFeature } from '@/lib/access/domains'
import { ROUTE_DOMAINS } from '@/lib/access/route-domains'
import { DEFAULT_FEATURE_VISIBILITY } from '@/lib/types/features'
import {
  DEFAULT_SEARCH_SOURCE_POLICY,
  parseSearchSourcePolicy,
} from '@/lib/search/source-policy'

describe('Search access and source policy', () => {
  it('registers Search disabled by default in the Dealflow domain', () => {
    expect(domainForFeature('search' as never)).toBe('dealflow')
    expect((DEFAULT_FEATURE_VISIBILITY as Record<string, string>).search).toBe('off')
    expect(ROUTE_DOMAINS['api/search']).toMatchObject({
      domain: 'dealflow',
      feature: 'search',
      level: { POST: 'read' },
    })
  })

  it('defaults live API/Web sources on and blocked website sources off', () => {
    expect(DEFAULT_SEARCH_SOURCE_POLICY).toEqual({
      web: true,
      specialized: {
        pubmed: true,
        clinical_trials: true,
        fda: true,
        tctmd: false,
        massdevice: false,
      },
    })
  })

  it('accepts a complete fixed boolean source policy', () => {
    expect(parseSearchSourcePolicy({
      web: false,
      specialized: {
        pubmed: false,
        clinical_trials: true,
        fda: true,
        tctmd: true,
        massdevice: false,
      },
    })).toEqual({
      web: false,
      specialized: {
        pubmed: false,
        clinical_trials: true,
        fda: true,
        tctmd: true,
        massdevice: false,
      },
    })
  })

  it.each([
    null,
    {},
    { web: true, specialized: {} },
    {
      web: true,
      specialized: {
        pubmed: 'false',
        clinical_trials: true,
        fda: true,
        tctmd: false,
        massdevice: false,
      },
    },
    {
      web: true,
      specialized: {
        pubmed: true,
        clinical_trials: true,
        fda: true,
        tctmd: false,
        massdevice: false,
        unknown: true,
      },
    },
  ])('fails closed for malformed or incomplete source policy %#', value => {
    expect(parseSearchSourcePolicy(value)).toEqual({
      web: false,
      specialized: {
        pubmed: false,
        clinical_trials: false,
        fda: false,
        tctmd: false,
        massdevice: false,
      },
    })
  })

  it('returns immutable policy values', () => {
    const policy = parseSearchSourcePolicy(null)
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy.specialized)).toBe(true)
  })
})
