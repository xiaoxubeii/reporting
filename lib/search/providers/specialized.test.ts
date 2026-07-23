import { describe, expect, it, vi } from 'vitest'
import {
  SearchProviderError,
  SPECIALIZED_SOURCE_DESCRIPTORS,
  type SearchCandidate,
  type SearchContext,
  type SpecializedSourceAdapter,
  type SpecializedSourceDescriptor,
  type SpecializedSourceSearchRequest,
} from '../provider-contracts'
import {
  DISABLED_SEARCH_SOURCE_POLICY,
  type SearchSourcePolicy,
} from '../source-policy'
import { DirectSpecializedSearchProvider } from './specialized'

const ALL_ENABLED_POLICY: SearchSourcePolicy = Object.freeze({
  web: false,
  specialized: Object.freeze({
    pubmed: true,
    clinical_trials: true,
    fda: true,
    tctmd: true,
    massdevice: true,
  }),
})

function context(fundId = 'fund-123'): SearchContext {
  return Object.freeze({
    fundId,
    userId: 'user-123',
    signal: new AbortController().signal,
  })
}

function candidate(descriptor: SpecializedSourceDescriptor, sequence: number): SearchCandidate {
  return Object.freeze({
    id: `${descriptor.id}:${sequence}`,
    origin: 'specialized' as const,
    title: `${descriptor.label} result ${sequence}`,
    url: `https://example.com/${descriptor.id}/${sequence}`,
    source: Object.freeze({ id: descriptor.id, label: descriptor.label }),
  })
}

function adapter(
  descriptor: SpecializedSourceDescriptor,
  search: SpecializedSourceAdapter['search'] = async request => Object.freeze({
    candidates: Object.freeze(Array.from(
      { length: request.limit },
      (_, index) => candidate(descriptor, index + 1),
    )),
  }),
): SpecializedSourceAdapter {
  return Object.freeze({ descriptor, search })
}

function fixedRegistry(overrides: Partial<Record<string, SpecializedSourceAdapter>> = {}) {
  return SPECIALIZED_SOURCE_DESCRIPTORS.map(descriptor => overrides[descriptor.id] ?? adapter(descriptor))
}

describe('DirectSpecializedSearchProvider', () => {
  it('requires exactly the fixed five-source registry with canonical descriptors', () => {
    const resolvePolicy = async () => ALL_ENABLED_POLICY

    expect(() => new DirectSpecializedSearchProvider(
      fixedRegistry().slice(0, -1),
      resolvePolicy,
    )).toThrow(/exactly the fixed professional source catalog/i)

    const duplicate = [
      ...fixedRegistry().slice(0, -1),
      adapter(SPECIALIZED_SOURCE_DESCRIPTORS[0]),
    ]
    expect(() => new DirectSpecializedSearchProvider(duplicate, resolvePolicy))
      .toThrow(/exactly the fixed professional source catalog/i)

    const pubmed = SPECIALIZED_SOURCE_DESCRIPTORS[0]
    const changedDescriptor = Object.freeze({ ...pubmed, label: 'Client supplied source' })
    expect(() => new DirectSpecializedSearchProvider(
      fixedRegistry({ pubmed: adapter(changedDescriptor) }),
      resolvePolicy,
    )).toThrow(/canonical descriptor/i)

    const changedTransport = Object.freeze({ ...pubmed, liveTransportAvailable: false })
    expect(() => new DirectSpecializedSearchProvider(
      fixedRegistry({ pubmed: adapter(changedTransport) }),
      resolvePolicy,
    )).toThrow(/canonical descriptor/i)
  })

  it('canonicalizes selected sources and rejects unsupported or duplicate selections before policy lookup', async () => {
    const calls: string[] = []
    const registry = fixedRegistry(Object.fromEntries(SPECIALIZED_SOURCE_DESCRIPTORS.map(descriptor => [
      descriptor.id,
      adapter(descriptor, async request => {
        calls.push(`${descriptor.id}:${request.query}:${request.limit}`)
        return Object.freeze({ candidates: Object.freeze([candidate(descriptor, 1)]) })
      }),
    ])))
    const resolvePolicy = vi.fn(async () => ALL_ENABLED_POLICY)
    const provider = new DirectSpecializedSearchProvider(registry, resolvePolicy)

    const response = await provider.search({
      query: 'heart valve',
      sources: ['fda', 'clinical_trials', 'pubmed'],
    }, context())

    expect(calls).toEqual([
      'pubmed:heart valve:5',
      'clinical_trials:heart valve:5',
      'fda:heart valve:5',
    ])
    expect(response.statuses.map(status => status.id)).toEqual(['pubmed', 'clinical_trials', 'fda'])
    expect(resolvePolicy).toHaveBeenCalledWith('fund-123')

    await expect(provider.search({
      query: 'heart valve',
      sources: ['pubmed', 'unknown'] as never,
    }, context())).rejects.toThrow(/unsupported professional source/i)
    await expect(provider.search({
      query: 'heart valve',
      sources: ['pubmed', 'pubmed'],
    }, context())).rejects.toThrow(/only once/i)
    expect(resolvePolicy).toHaveBeenCalledTimes(1)
  })

  it('never invokes a source whose canonical live transport is unavailable', async () => {
    const tctmdSearch = vi.fn(async () => Object.freeze({ candidates: Object.freeze([]) }))
    const massDeviceSearch = vi.fn(async () => Object.freeze({ candidates: Object.freeze([]) }))
    const provider = new DirectSpecializedSearchProvider(fixedRegistry({
      tctmd: adapter(SPECIALIZED_SOURCE_DESCRIPTORS[3], tctmdSearch),
      massdevice: adapter(SPECIALIZED_SOURCE_DESCRIPTORS[4], massDeviceSearch),
    }), async () => ALL_ENABLED_POLICY)

    const response = await provider.search({
      query: 'heart valve',
      sources: ['tctmd', 'massdevice'],
    }, context())

    expect(tctmdSearch).not.toHaveBeenCalled()
    expect(massDeviceSearch).not.toHaveBeenCalled()
    expect(response.statuses).toEqual([
      expect.objectContaining({ id: 'tctmd', status: 'unavailable', retryable: false }),
      expect.objectContaining({ id: 'massdevice', status: 'unavailable', retryable: false }),
    ])
  })

  it('checks fund policy before adapters and reports disabled sources as unavailable', async () => {
    const pubmedSearch = vi.fn(async () => Object.freeze({ candidates: Object.freeze([]) }))
    const tctmdSearch = vi.fn(async () => Object.freeze({ candidates: Object.freeze([]) }))
    const registry = fixedRegistry({
      pubmed: adapter(SPECIALIZED_SOURCE_DESCRIPTORS[0], pubmedSearch),
      tctmd: adapter(SPECIALIZED_SOURCE_DESCRIPTORS[3], tctmdSearch),
    })
    const provider = new DirectSpecializedSearchProvider(registry, async fundId => {
      expect(fundId).toBe('fund-disabled-websites')
      return Object.freeze({
        ...DISABLED_SEARCH_SOURCE_POLICY,
        specialized: Object.freeze({
          ...DISABLED_SEARCH_SOURCE_POLICY.specialized,
          pubmed: true,
        }),
      })
    })

    const response = await provider.search({
      query: 'stent',
      sources: ['tctmd', 'pubmed'],
    }, context('fund-disabled-websites'))

    expect(pubmedSearch).toHaveBeenCalledOnce()
    expect(tctmdSearch).not.toHaveBeenCalled()
    expect(response.statuses).toEqual([
      { id: 'pubmed', status: 'empty', resultCount: 0 },
      {
        id: 'tctmd',
        status: 'unavailable',
        resultCount: 0,
        retryable: false,
        message: 'This professional source is not enabled for this fund.',
      },
    ])
  })

  it('bounds adapter concurrency, caps every source at five, and preserves partial successes', async () => {
    let active = 0
    let peak = 0
    const controlled = Object.fromEntries(SPECIALIZED_SOURCE_DESCRIPTORS.map(descriptor => [
      descriptor.id,
      adapter(descriptor, async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise(resolve => setTimeout(resolve, 5))
        active -= 1
        if (descriptor.id === 'clinical_trials') {
          throw new SearchProviderError('rate_limited', 'raw upstream detail', { retryable: true })
        }
        return Object.freeze({
          candidates: Object.freeze(Array.from(
            { length: 7 },
            (_, index) => candidate(descriptor, index + 1),
          )),
        })
      }),
    ]))
    const provider = new DirectSpecializedSearchProvider(
      fixedRegistry(controlled),
      async () => ALL_ENABLED_POLICY,
      { maxConcurrency: 2 },
    )

    const response = await provider.search({
      query: 'device',
      sources: ['fda', 'clinical_trials', 'pubmed'],
    }, context())

    expect(peak).toBe(2)
    expect(response.candidates).toHaveLength(10)
    expect(response.statuses).toEqual([
      { id: 'pubmed', status: 'ok', resultCount: 5 },
      {
        id: 'clinical_trials',
        status: 'rate_limited',
        resultCount: 0,
        retryable: true,
        message: 'The source is temporarily rate-limited. Try again shortly.',
      },
      { id: 'fda', status: 'ok', resultCount: 5 },
    ])
  })

  it('starts the next source as soon as one concurrency slot becomes available', async () => {
    let releaseSlow: (() => void) | undefined
    const slowGate = new Promise<void>(resolve => { releaseSlow = resolve })
    const started: string[] = []
    const overrides = Object.fromEntries(
      SPECIALIZED_SOURCE_DESCRIPTORS.map(descriptor => [
        descriptor.id,
        adapter(descriptor, async () => {
          started.push(descriptor.id)
          if (descriptor.id === 'pubmed') await slowGate
          return Object.freeze({ candidates: Object.freeze([]) })
        }),
      ]),
    )
    const provider = new DirectSpecializedSearchProvider(
      fixedRegistry(overrides),
      async () => ALL_ENABLED_POLICY,
      { maxConcurrency: 2 },
    )

    const pending = provider.search({
      query: 'device',
      sources: ['pubmed', 'clinical_trials', 'fda'],
    }, context())

    await vi.waitFor(() => expect(started).toContain('fda'))
    expect(started.slice(0, 3)).toEqual(['pubmed', 'clinical_trials', 'fda'])
    releaseSlow?.()
    await pending
  })

  it('passes only the standard direct-adapter contract and has no SearXNG or client control fallback', async () => {
    const search = vi.fn(async (
      request: SpecializedSourceSearchRequest,
      receivedContext: SearchContext,
    ) => {
      expect(Object.keys(request).sort()).toEqual(['limit', 'query'])
      expect(request).toEqual({ query: 'vascular', limit: 5 })
      expect(receivedContext).toBe(searchContext)
      return Object.freeze({ candidates: Object.freeze([]) })
    })
    const provider = new DirectSpecializedSearchProvider(
      fixedRegistry({ pubmed: adapter(SPECIALIZED_SOURCE_DESCRIPTORS[0], search) }),
      async () => ALL_ENABLED_POLICY,
    )
    const searchContext = context()

    const response = await provider.search({
      query: 'vascular',
      sources: ['pubmed'],
      endpoint: 'https://search.invalid/search',
      selector: 'a.result',
      engines: ['searxng'],
    } as never, searchContext)

    expect(search).toHaveBeenCalledOnce()
    expect(response.statuses).toEqual([{ id: 'pubmed', status: 'empty', resultCount: 0 }])
    expect(JSON.stringify(response)).not.toContain('site:')
    expect(JSON.stringify(response)).not.toContain('searxng')
  })
})
