export const MAX_SEARCH_QUERY_LENGTH = 200
export const MAX_SEARCH_RESULTS = 30
export const FEED_SEARCH_LIMIT = 10
export const WEB_SEARCH_LIMIT = 10
export const SPECIALIZED_SEARCH_LIMIT = 5

export const SPECIALIZED_SOURCE_IDS = Object.freeze([
  'pubmed',
  'clinical_trials',
  'fda',
  'tctmd',
  'massdevice',
] as const)

export type SpecializedSourceId = typeof SPECIALIZED_SOURCE_IDS[number]
export type SearchSourceId = 'feeds' | 'web' | SpecializedSourceId
export type SearchOrigin = 'feed' | 'specialized' | 'web'

export interface SearchRequest {
  readonly query: string
  readonly sources: {
    readonly feeds: boolean
    readonly web: boolean
    readonly specialized: readonly SpecializedSourceId[]
  }
}

export type SearchSourceState =
  | 'ok'
  | 'empty'
  | 'partial'
  | 'unavailable'
  | 'timeout'
  | 'rate_limited'
  | 'invalid_response'
  | 'failed'

export interface SearchSourceStatus {
  readonly id: SearchSourceId
  readonly status: SearchSourceState
  readonly resultCount: number
  readonly retryable?: boolean
  readonly message?: string
}

export interface SearchHitSource {
  readonly id: SearchSourceId
  readonly label: string
}

export interface SearchIdentifiers {
  readonly doi?: string
  readonly pmid?: string
  readonly nct?: string
  readonly fdaId?: string
}

export interface SearchHit {
  readonly id: string
  readonly primaryOrigin: SearchOrigin
  readonly origins: readonly SearchOrigin[]
  readonly title: string
  readonly url?: string
  readonly snippet?: string
  readonly publishedAt?: string
  readonly sources: readonly SearchHitSource[]
  readonly identifiers?: SearchIdentifiers
  readonly feedEntryId?: number
  readonly isRead?: boolean
  readonly isSaved?: boolean
}

export interface SearchResponse {
  readonly results: readonly SearchHit[]
  readonly sources: readonly SearchSourceStatus[]
  readonly partial: boolean
}

export interface SearchApiErrorBody {
  readonly code: string
  readonly message: string
  readonly retryable: boolean
}

export interface SearchSuccessEnvelope {
  readonly success: true
  readonly data: SearchResponse
  readonly error: null
}

export interface SearchFailureEnvelope {
  readonly success: false
  readonly data: null
  readonly error: SearchApiErrorBody
}

export class SearchContractError extends Error {
  readonly code = 'invalid_request'
  readonly status = 400

  constructor(message: string) {
    super(message)
    this.name = 'SearchContractError'
  }
}

const SPECIALIZED_SOURCE_SET = new Set<string>(SPECIALIZED_SOURCE_IDS)

export function parseSearchRequest(value: unknown): SearchRequest {
  const body = strictRecord(value, ['query', 'sources'], 'Search request')
  const query = parseQuery(body.query)
  const sources = strictRecord(body.sources, ['feeds', 'web', 'specialized'], 'Search sources')

  if (typeof sources.feeds !== 'boolean' || typeof sources.web !== 'boolean') {
    throw new SearchContractError('Feed and Web source selections must be boolean values.')
  }
  if (!Array.isArray(sources.specialized)) {
    throw new SearchContractError('Professional source selection must be an array.')
  }

  const seen = new Set<string>()
  for (const source of sources.specialized) {
    if (typeof source !== 'string' || !SPECIALIZED_SOURCE_SET.has(source)) {
      throw new SearchContractError('An unsupported professional source was selected.')
    }
    if (seen.has(source)) {
      throw new SearchContractError('Each professional source may be selected only once.')
    }
    seen.add(source)
  }
  const specialized = SPECIALIZED_SOURCE_IDS.filter(source => seen.has(source))

  if (!sources.feeds && !sources.web && specialized.length === 0) {
    throw new SearchContractError('Select at least one available source.')
  }

  const frozenSpecialized = Object.freeze(specialized.slice())
  const frozenSources = Object.freeze({
    feeds: sources.feeds,
    web: sources.web,
    specialized: frozenSpecialized,
  })
  return Object.freeze({ query, sources: frozenSources })
}

function parseQuery(value: unknown): string {
  if (typeof value !== 'string') {
    throw new SearchContractError('A search query is required.')
  }
  const query = value.trim()
  if (!query) throw new SearchContractError('A search query is required.')
  if (query.length > MAX_SEARCH_QUERY_LENGTH) {
    throw new SearchContractError(`The search query must be ${MAX_SEARCH_QUERY_LENGTH} characters or fewer.`)
  }
  if (/[\u0000-\u001F\u007F]/.test(query)) {
    throw new SearchContractError('The search query contains unsupported control characters.')
  }
  return query
}

function strictRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SearchContractError(`${label} must be an object.`)
  }
  const record = value as Record<string, unknown>
  const allowed = new Set(keys)
  if (Object.keys(record).some(key => !allowed.has(key))) {
    throw new SearchContractError(`${label} contains an unsupported field.`)
  }
  if (keys.some(key => !(key in record))) {
    throw new SearchContractError(`${label} is missing a required field.`)
  }
  return record
}
