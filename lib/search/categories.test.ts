import { describe, expect, it } from 'vitest'
import { SearchContractError } from './contracts'
import {
  parseSearchCategoryConfig,
  resolveSearchCategories,
  searchCategoryOptions,
} from './categories'

const CONFIG = {
  version: 1,
  categories: [
    {
      id: 'research',
      label: { en: 'Research', 'zh-CN': '研究' },
      description: { en: 'Literature and trials', 'zh-CN': '文献和试验' },
      enabled: true,
      defaultSelected: true,
      adapterIds: ['pubmed', 'clinical_trials'],
    },
    {
      id: 'regulatory',
      label: { en: 'Regulatory', 'zh-CN': '监管' },
      description: { en: '', 'zh-CN': '' },
      enabled: true,
      defaultSelected: false,
      adapterIds: ['fda', 'pubmed'],
    },
  ],
}

describe('search category configuration', () => {
  it('parses an immutable ordered configuration and validates adapter mappings for writes', () => {
    const parsed = parseSearchCategoryConfig(CONFIG, {
      knownAdapterIds: new Set(['pubmed', 'clinical_trials', 'fda']),
    })
    expect(parsed.categories.map(category => category.id)).toEqual(['research', 'regulatory'])
    expect(Object.isFrozen(parsed.categories)).toBe(true)
    expect(Object.isFrozen(parsed.categories[0].adapterIds)).toBe(true)
  })

  it('resolves selected categories to a deduplicated adapter union in configured order', () => {
    const parsed = parseSearchCategoryConfig(CONFIG)
    expect(resolveSearchCategories(parsed, ['regulatory', 'research'], new Set([
      'pubmed', 'clinical_trials', 'fda',
    ]))).toEqual(['pubmed', 'clinical_trials', 'fda'])
  })

  it('fails closed for unknown categories and unknown or unavailable adapter mappings', () => {
    const parsed = parseSearchCategoryConfig(CONFIG)
    expect(() => resolveSearchCategories(parsed, ['unknown'], new Set(['pubmed']))).toThrow(SearchContractError)
    expect(() => resolveSearchCategories(parsed, ['research'], new Set())).toThrow('no available')
    expect(() => parseSearchCategoryConfig(CONFIG, { knownAdapterIds: new Set(['pubmed']) })).toThrow('unregistered')
  })

  it('rejects duplicate adapter IDs within one category', () => {
    const duplicate = {
      ...CONFIG,
      categories: [{ ...CONFIG.categories[0], adapterIds: ['pubmed', 'pubmed'] }],
    }
    expect(() => parseSearchCategoryConfig(duplicate)).toThrow('unique within a category')
  })

  it('localizes configured presentation and derives defaults from runnable adapters', () => {
    const parsed = parseSearchCategoryConfig(CONFIG)
    expect(searchCategoryOptions(parsed, 'zh-CN', new Set(['clinical_trials']), '不可用')).toEqual([
      {
        id: 'research',
        label: '研究',
        description: '文献和试验',
        defaultSelected: true,
        available: true,
      },
      {
        id: 'regulatory',
        label: '监管',
        description: '',
        defaultSelected: false,
        available: false,
        reason: '不可用',
      },
    ])
  })
})
