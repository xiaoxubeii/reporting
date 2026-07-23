import {
  FEED_SEARCH_LIMIT,
  MAX_SEARCH_RESULTS,
  SPECIALIZED_SEARCH_LIMIT,
  WEB_SEARCH_LIMIT,
  type SearchIdentifiers,
  type SearchOrigin,
  type SearchSourceId,
  type SearchSourceStatus,
  type SpecializedSourceId,
} from './contracts'

export const PROVIDER_LIMITS = Object.freeze({
  feed: FEED_SEARCH_LIMIT,
  web: WEB_SEARCH_LIMIT,
  specialized: SPECIALIZED_SEARCH_LIMIT,
  final: MAX_SEARCH_RESULTS,
})

export const ORIGIN_PRIORITY: Readonly<Record<SearchOrigin, number>> = Object.freeze({
  feed: 0,
  specialized: 1,
  web: 2,
})

export const MERGE_BUCKET_ORDER: readonly SearchSourceId[] = Object.freeze([
  'feeds',
  'pubmed',
  'clinical_trials',
  'fda',
  'tctmd',
  'massdevice',
  'web',
])

export interface SearchContext {
  readonly fundId: string
  readonly userId: string
  readonly signal: AbortSignal
}

export interface SearchProviderRequest {
  readonly query: string
}

export interface SpecializedSearchRequest extends SearchProviderRequest {
  readonly sources: readonly SpecializedSourceId[]
}

export interface SearchCandidate {
  readonly id: string
  readonly origin: SearchOrigin
  readonly title: string
  readonly url?: string
  readonly snippet?: string
  readonly publishedAt?: string
  readonly source: {
    readonly id: SearchSourceId
    readonly label: string
  }
  readonly identifiers?: SearchIdentifiers
  readonly feedEntryId?: number
  readonly isRead?: boolean
  readonly isSaved?: boolean
}

export interface SearchProviderResults {
  readonly candidates: readonly SearchCandidate[]
  readonly statuses: readonly SearchSourceStatus[]
}

export interface FeedSearchProvider {
  search(request: SearchProviderRequest, context: SearchContext): Promise<SearchProviderResults>
}

export interface WebSearchProvider {
  search(request: SearchProviderRequest, context: SearchContext): Promise<SearchProviderResults>
}

export interface SpecializedSearchProvider {
  search(request: SpecializedSearchRequest, context: SearchContext): Promise<SearchProviderResults>
}

export interface SpecializedSourceDescriptor {
  readonly id: SpecializedSourceId
  readonly label: string
  readonly adapterType: 'website' | 'api'
  /** Whether this build has an operator-approved live transport for the source. */
  readonly liveTransportAvailable: boolean
}

export interface SpecializedSourceSearchRequest {
  readonly query: string
  readonly limit: number
}

export interface SpecializedSourceResults {
  readonly candidates: readonly SearchCandidate[]
}

export interface SpecializedSourceAdapter {
  readonly descriptor: SpecializedSourceDescriptor
  search(
    request: SpecializedSourceSearchRequest,
    context: SearchContext,
  ): Promise<SpecializedSourceResults>
}

export const SPECIALIZED_SOURCE_DESCRIPTORS: readonly SpecializedSourceDescriptor[] = Object.freeze([
  Object.freeze({ id: 'pubmed', label: 'PubMed', adapterType: 'api', liveTransportAvailable: true }),
  Object.freeze({ id: 'clinical_trials', label: 'ClinicalTrials.gov', adapterType: 'api', liveTransportAvailable: true }),
  Object.freeze({ id: 'fda', label: 'FDA/openFDA · 510(k)', adapterType: 'api', liveTransportAvailable: true }),
  Object.freeze({ id: 'tctmd', label: 'TCTMD', adapterType: 'website', liveTransportAvailable: false }),
  Object.freeze({ id: 'massdevice', label: 'MassDevice', adapterType: 'website', liveTransportAvailable: false }),
])

export type SearchProviderErrorCode =
  | 'unavailable'
  | 'timeout'
  | 'rate_limited'
  | 'invalid_response'
  | 'failed'

export class SearchProviderError extends Error {
  readonly retryable: boolean
  readonly upstreamStatus?: number

  constructor(
    readonly code: SearchProviderErrorCode,
    message: string,
    options: { readonly retryable?: boolean; readonly upstreamStatus?: number } = {},
  ) {
    super(message)
    this.name = 'SearchProviderError'
    this.retryable = options.retryable ?? code !== 'invalid_response'
    this.upstreamStatus = options.upstreamStatus
  }
}

export interface NormalizedProviderError {
  readonly code: SearchProviderErrorCode
  readonly message: string
  readonly retryable: boolean
}

export function normalizeProviderError(error: unknown): NormalizedProviderError {
  if (isAbortError(error)) {
    return Object.freeze({
      code: 'timeout' as const,
      message: 'The source timed out. Try again shortly.',
      retryable: true,
    })
  }
  if (error instanceof SearchProviderError) {
    return Object.freeze({
      code: error.code,
      message: publicProviderMessage(error.code),
      retryable: error.retryable,
    })
  }
  return Object.freeze({
    code: 'failed' as const,
    message: 'The source could not be searched. Try again shortly.',
    retryable: true,
  })
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError' || error.name === 'TimeoutError'
    : typeof error === 'object' && error !== null && 'name' in error
      && ((error as { name?: unknown }).name === 'AbortError'
        || (error as { name?: unknown }).name === 'TimeoutError')
}

function publicProviderMessage(code: SearchProviderErrorCode): string {
  switch (code) {
    case 'unavailable': return 'The source is not available for this search.'
    case 'timeout': return 'The source timed out. Try again shortly.'
    case 'rate_limited': return 'The source is temporarily rate-limited. Try again shortly.'
    case 'invalid_response': return 'The source returned an unsupported response.'
    case 'failed': return 'The source could not be searched. Try again shortly.'
  }
}
