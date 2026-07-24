import { describe, expect, it, vi } from 'vitest'
import { SEARCH_ADAPTER_DESCRIPTORS, SearchAdapterError, type SearchAdapter, type SearchCandidate } from './adapter-contracts'
import { AdapterRegistry } from './adapter-registry'
import { parseSearchCategoryConfig } from './categories'
import { SearchService } from './service'

const CATEGORIES = parseSearchCategoryConfig({
  version: 1,
  categories: [
    {
      id: 'research',
      label: { en: 'Research', 'zh-CN': '研究' },
      description: { en: '', 'zh-CN': '' },
      enabled: true,
      defaultSelected: false,
      adapterIds: ['pubmed', 'clinical_trials'],
    },
    {
      id: 'literature',
      label: { en: 'Literature', 'zh-CN': '文献' },
      description: { en: '', 'zh-CN': '' },
      enabled: true,
      defaultSelected: false,
      adapterIds: ['pubmed'],
    },
  ],
})

function adapter(id: 'pubmed' | 'clinical_trials', search?: SearchAdapter['search']): SearchAdapter {
  return {
    descriptor: SEARCH_ADAPTER_DESCRIPTORS.find(value => value.id === id)!,
    search: search ?? (async () => ({ candidates: [candidate(id)] })),
  }
}

function candidate(id: 'pubmed' | 'clinical_trials'): SearchCandidate {
  return { id: `${id}:1`, origin: 'specialized', title: id, url: `https://example.com/${id}`, source: { id, label: id } }
}

describe('SearchService', () => {
  it('resolves categories to adapters and executes shared adapters once', async () => {
    const pubmedSearch = vi.fn(async () => ({ candidates: [candidate('pubmed')] }))
    const pubmed = adapter('pubmed', pubmedSearch)
    const trials = adapter('clinical_trials')
    const service = new SearchService({ categories: CATEGORIES, registry: new AdapterRegistry([pubmed, trials]) })
    const response = await service.search(
      { query: 'heart', categoryIds: ['research', 'literature'] },
      { fundId: 'fund', userId: 'user' },
    )
    expect(response.sources.map(source => source.id)).toEqual(['pubmed', 'clinical_trials'])
    expect(pubmedSearch).toHaveBeenCalledTimes(1)
  })

  it('returns adapter-level partial results with private failures removed', async () => {
    const failed = adapter('pubmed', vi.fn(async () => {
      throw new SearchAdapterError('rate_limited', 'private quota detail')
    }))
    const trials = adapter('clinical_trials')
    const service = new SearchService({ categories: CATEGORIES, registry: new AdapterRegistry([failed, trials]) })
    const response = await service.search(
      { query: 'heart', categoryIds: ['research'] },
      { fundId: 'fund', userId: 'user' },
    )
    expect(response.partial).toBe(true)
    expect(response.results).toHaveLength(1)
    expect(JSON.stringify(response)).not.toContain('private')
  })

  it('rejects a category when none of its adapters are runnable', async () => {
    const service = new SearchService({ categories: CATEGORIES, registry: new AdapterRegistry([]) })
    await expect(service.search(
      { query: 'heart', categoryIds: ['research'] },
      { fundId: 'fund', userId: 'user' },
    )).rejects.toThrow('no available')
  })
})
