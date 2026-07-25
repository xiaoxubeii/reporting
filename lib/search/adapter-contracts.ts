import {
  FEED_SEARCH_LIMIT,
  SPECIALIZED_SEARCH_LIMIT,
  WEB_SEARCH_LIMIT,
  type SearchAdapterId,
  type SearchIdentifiers,
  type SearchOrigin,
} from './contracts'

export const ORIGIN_PRIORITY: Readonly<Record<SearchOrigin, number>> = Object.freeze({
  feed: 0,
  specialized: 1,
  web: 2,
})

export const SEARCH_ADAPTER_IDS = Object.freeze([
  'feeds',
  'pubmed',
  'clinical_trials',
  'fda',
  'tctmd',
  'massdevice',
  'web',
] as const satisfies readonly SearchAdapterId[])

export const MERGE_BUCKET_ORDER: readonly SearchAdapterId[] = SEARCH_ADAPTER_IDS

export interface SearchContext {
  readonly fundId: string
  readonly userId: string
  readonly signal: AbortSignal
}

export interface SearchAdapterRequest {
  readonly query: string
  readonly limit: number
}

export interface SearchCandidate {
  readonly id: string
  readonly origin: SearchOrigin
  readonly title: string
  readonly url?: string
  readonly snippet?: string
  readonly publishedAt?: string
  readonly source: {
    readonly id: SearchAdapterId
    readonly label: string
  }
  readonly identifiers?: SearchIdentifiers
  readonly feedEntryId?: number
  readonly isRead?: boolean
  readonly isSaved?: boolean
}

export interface SearchAdapterResults {
  readonly candidates: readonly SearchCandidate[]
}

export interface SearchAdapterDescriptor {
  readonly id: SearchAdapterId
  readonly label: string
  readonly origin: SearchOrigin
  readonly adapterType: 'feed' | 'metasearch' | 'website' | 'api'
  readonly liveTransportAvailable: boolean
  readonly resultLimit: number
}

export interface SearchAdapter {
  readonly descriptor: SearchAdapterDescriptor
  search(request: SearchAdapterRequest, context: SearchContext): Promise<SearchAdapterResults>
}

export const SEARCH_ADAPTER_DESCRIPTORS: readonly SearchAdapterDescriptor[] = Object.freeze([
  descriptor('feeds', 'Personal subscriptions', 'feed', 'feed', true, FEED_SEARCH_LIMIT),
  descriptor('pubmed', 'PubMed', 'specialized', 'api', true, SPECIALIZED_SEARCH_LIMIT),
  descriptor('clinical_trials', 'ClinicalTrials.gov', 'specialized', 'api', true, SPECIALIZED_SEARCH_LIMIT),
  descriptor('fda', 'FDA/openFDA · 510(k)', 'specialized', 'api', true, SPECIALIZED_SEARCH_LIMIT),
  descriptor('tctmd', 'TCTMD', 'specialized', 'website', false, SPECIALIZED_SEARCH_LIMIT),
  descriptor('massdevice', 'MassDevice', 'specialized', 'website', false, SPECIALIZED_SEARCH_LIMIT),
  descriptor('web', 'Internet', 'web', 'metasearch', true, WEB_SEARCH_LIMIT),
])

const SEARCH_ADAPTER_DESCRIPTOR_MAP: ReadonlyMap<SearchAdapterId, SearchAdapterDescriptor> = new Map(
  SEARCH_ADAPTER_DESCRIPTORS.map(value => Object.freeze([value.id, value] as const)),
)

export function getSearchAdapterDescriptor(id: SearchAdapterId): SearchAdapterDescriptor {
  const value = SEARCH_ADAPTER_DESCRIPTOR_MAP.get(id)
  if (!value) throw new Error(`Unknown search adapter descriptor: ${id}`)
  return value
}

export const SEARCH_ADAPTER_ID_SET: ReadonlySet<string> = new Set(SEARCH_ADAPTER_IDS)

export type SearchAdapterErrorCode =
  | 'unavailable'
  | 'timeout'
  | 'rate_limited'
  | 'invalid_response'
  | 'failed'

export class SearchAdapterError extends Error {
  readonly retryable: boolean
  readonly upstreamStatus?: number

  constructor(
    readonly code: SearchAdapterErrorCode,
    message: string,
    options: { readonly retryable?: boolean; readonly upstreamStatus?: number } = {},
  ) {
    super(message)
    this.name = 'SearchAdapterError'
    this.retryable = options.retryable ?? code !== 'invalid_response'
    this.upstreamStatus = options.upstreamStatus
  }
}

export interface NormalizedAdapterError {
  readonly code: SearchAdapterErrorCode
  readonly message: string
  readonly retryable: boolean
}

export function normalizeAdapterError(error: unknown): NormalizedAdapterError {
  if (isAbortError(error)) {
    return Object.freeze({
      code: 'timeout' as const,
      message: 'The source timed out. Try again shortly.',
      retryable: true,
    })
  }
  if (error instanceof SearchAdapterError) {
    return Object.freeze({
      code: error.code,
      message: publicAdapterMessage(error.code),
      retryable: error.retryable,
    })
  }
  return Object.freeze({
    code: 'failed' as const,
    message: 'The source could not be searched. Try again shortly.',
    retryable: true,
  })
}

function descriptor(
  id: SearchAdapterId,
  label: string,
  origin: SearchOrigin,
  adapterType: SearchAdapterDescriptor['adapterType'],
  liveTransportAvailable: boolean,
  resultLimit: number,
): SearchAdapterDescriptor {
  return Object.freeze({ id, label, origin, adapterType, liveTransportAvailable, resultLimit })
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError' || error.name === 'TimeoutError'
    : typeof error === 'object' && error !== null && 'name' in error
      && ((error as { name?: unknown }).name === 'AbortError'
        || (error as { name?: unknown }).name === 'TimeoutError')
}

function publicAdapterMessage(code: SearchAdapterErrorCode): string {
  switch (code) {
    case 'unavailable': return 'The source is not available for this search.'
    case 'timeout': return 'The source timed out. Try again shortly.'
    case 'rate_limited': return 'The source is temporarily rate-limited. Try again shortly.'
    case 'invalid_response': return 'The source returned an unsupported response.'
    case 'failed': return 'The source could not be searched. Try again shortly.'
  }
}
