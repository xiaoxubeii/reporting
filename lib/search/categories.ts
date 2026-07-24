import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MAX_SEARCH_CATEGORIES,
  SearchContractError,
  type SearchAdapterId,
} from './contracts'

export const SEARCH_CATEGORY_CONFIG_VERSION = 1
export const MAX_CATEGORY_ADAPTERS = 20
export const MAX_CATEGORY_LABEL_LENGTH = 80
export const MAX_CATEGORY_DESCRIPTION_LENGTH = 240

export interface SearchCategoryText {
  readonly en: string
  readonly 'zh-CN': string
}

export interface SearchCategory {
  readonly id: string
  readonly label: SearchCategoryText
  readonly description: SearchCategoryText
  readonly enabled: boolean
  readonly defaultSelected: boolean
  readonly adapterIds: readonly string[]
}

export interface SearchCategoryConfig {
  readonly version: 1
  readonly categories: readonly SearchCategory[]
}

export interface SearchCategoryOption {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly defaultSelected: boolean
  readonly available: boolean
  readonly reason?: string
}

export function parseSearchCategoryConfig(
  value: unknown,
  options: { readonly knownAdapterIds?: ReadonlySet<string> } = {},
): SearchCategoryConfig {
  const root = record(value)
  if (!root || !hasExactKeys(root, ['version', 'categories']) || root.version !== SEARCH_CATEGORY_CONFIG_VERSION) {
    throw new SearchContractError('Search category configuration is invalid.')
  }
  if (!Array.isArray(root.categories) || root.categories.length < 1 || root.categories.length > MAX_SEARCH_CATEGORIES) {
    throw new SearchContractError(`Search category configuration must contain 1 to ${MAX_SEARCH_CATEGORIES} categories.`)
  }

  const seenIds = new Set<string>()
  const categories = root.categories.map((value, index) => {
    const category = record(value)
    if (!category || !hasExactKeys(category, [
      'id', 'label', 'description', 'enabled', 'defaultSelected', 'adapterIds',
    ])) throw new SearchContractError(`Search category ${index + 1} is invalid.`)
    const id = categoryId(category.id)
    if (seenIds.has(id)) throw new SearchContractError('Search category IDs must be unique.')
    seenIds.add(id)
    const adapterIds = adapterIdList(category.adapterIds, options.knownAdapterIds)
    if (typeof category.enabled !== 'boolean' || typeof category.defaultSelected !== 'boolean') {
      throw new SearchContractError(`Search category ${id} has invalid state.`)
    }
    return Object.freeze({
      id,
      label: localizedText(category.label, MAX_CATEGORY_LABEL_LENGTH, false),
      description: localizedText(category.description, MAX_CATEGORY_DESCRIPTION_LENGTH, true),
      enabled: category.enabled,
      defaultSelected: category.defaultSelected,
      adapterIds,
    })
  })
  return Object.freeze({ version: SEARCH_CATEGORY_CONFIG_VERSION, categories: Object.freeze(categories) })
}

export async function loadSearchCategoryConfig(
  admin: SupabaseClient,
  fundId: string,
): Promise<SearchCategoryConfig | null> {
  try {
    const { data, error } = await admin
      .from('fund_settings')
      .select('search_category_config')
      .eq('fund_id', fundId)
      .maybeSingle()
    if (error || !data) return null
    return parseSearchCategoryConfig((data as { search_category_config?: unknown }).search_category_config)
  } catch {
    return null
  }
}

export function resolveSearchCategories(
  config: SearchCategoryConfig,
  categoryIds: readonly string[],
  runnableAdapterIds: ReadonlySet<string>,
): readonly SearchAdapterId[] {
  const configured = new Map(config.categories.map(category => [category.id, category]))
  const selected = new Set(categoryIds)
  for (const categoryId of Array.from(selected)) {
    const category = configured.get(categoryId)
    if (!category || !category.enabled) throw new SearchContractError('An unavailable search category was selected.')
  }

  const adapterIds = config.categories
    .filter(category => selected.has(category.id))
    .flatMap(category => category.adapterIds)
    .filter((adapterId, index, values) => runnableAdapterIds.has(adapterId) && values.indexOf(adapterId) === index)
  if (adapterIds.length === 0) throw new SearchContractError('The selected categories have no available search sources.')
  return Object.freeze(adapterIds as SearchAdapterId[])
}

export function searchCategoryOptions(
  config: SearchCategoryConfig,
  locale: string,
  runnableAdapterIds: ReadonlySet<string>,
  unavailableReason: string,
): readonly SearchCategoryOption[] {
  const key: keyof SearchCategoryText = locale === 'zh-CN' ? 'zh-CN' : 'en'
  return Object.freeze(config.categories.filter(category => category.enabled).map(category => {
    const available = category.adapterIds.some(adapterId => runnableAdapterIds.has(adapterId))
    return Object.freeze({
      id: category.id,
      label: category.label[key],
      description: category.description[key],
      defaultSelected: category.defaultSelected && available,
      available,
      ...(!available ? { reason: unavailableReason } : {}),
    })
  }))
}

function categoryId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/.test(value)) {
    throw new SearchContractError('Search category ID is invalid.')
  }
  return value
}

function adapterIdList(value: unknown, knownAdapterIds?: ReadonlySet<string>): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CATEGORY_ADAPTERS) {
    throw new SearchContractError(`Each search category must map to 1 to ${MAX_CATEGORY_ADAPTERS} adapters.`)
  }
  const seen = new Set<string>()
  for (const adapterId of value) {
    if (typeof adapterId !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(adapterId)) {
      throw new SearchContractError('Search category contains an invalid adapter ID.')
    }
    if (seen.has(adapterId)) throw new SearchContractError('Adapter IDs must be unique within a category.')
    if (knownAdapterIds && !knownAdapterIds.has(adapterId)) {
      throw new SearchContractError('Search category contains an unregistered adapter ID.')
    }
    seen.add(adapterId)
  }
  return Object.freeze(Array.from(seen))
}

function localizedText(value: unknown, maxLength: number, allowEmpty: boolean): SearchCategoryText {
  const text = record(value)
  if (!text || !hasExactKeys(text, ['en', 'zh-CN'])) throw new SearchContractError('Search category text is invalid.')
  const en = boundedText(text.en, maxLength, allowEmpty)
  const zhCN = boundedText(text['zh-CN'], maxLength, allowEmpty)
  return Object.freeze({ en, 'zh-CN': zhCN })
}

function boundedText(value: unknown, maxLength: number, allowEmpty: boolean): string {
  if (typeof value !== 'string') throw new SearchContractError('Search category text is invalid.')
  const text = value.trim()
  if ((!allowEmpty && !text) || text.length > maxLength || /[\u0000-\u001F\u007F]/.test(text)) {
    throw new SearchContractError('Search category text is invalid.')
  }
  return text
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys)
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => expected.has(key))
}
