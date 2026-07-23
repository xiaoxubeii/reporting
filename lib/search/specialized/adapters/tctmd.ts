import {
  SearchProviderError,
  type SpecializedSourceAdapter,
  type SpecializedSourceDescriptor,
} from '../../provider-contracts'
import {
  parseWebsiteSearchHtml,
  validateWebsiteDefinition,
  type WebsiteSearchDefinition,
} from './website-parser'

const TCTMD_DESCRIPTOR: SpecializedSourceDescriptor = Object.freeze({
  id: 'tctmd',
  label: 'TCTMD',
  adapterType: 'website',
  liveTransportAvailable: false,
})

export const TCTMD_WEBSITE_DEFINITION: WebsiteSearchDefinition = Object.freeze({
  descriptor: TCTMD_DESCRIPTOR,
  searchEndpoint: 'https://www.tctmd.com/search',
  queryParameter: 'search_api_fulltext',
  allowedSearchHosts: Object.freeze(['www.tctmd.com']),
  allowedSearchPath: '/search',
  allowedRedirectHosts: Object.freeze([]),
  allowedResultHosts: Object.freeze(['www.tctmd.com', 'tctmd.com']),
  isAllowedResultPath: (pathname: string) => /^\/(?:news|slideshow|podcast|video)\/[a-z0-9][a-z0-9/_-]*\/?$/i.test(pathname),
  resultCardClass: /\b(?:search-result|views-row)\b/i,
  resultsContainer: /(?:id|class)\s*=\s*(?:"[^"]*search-results[^"]*"|'[^']*search-results[^']*')/i,
  noResults: /\b(?:no results|no matching results|your search yielded no results)\b/i,
})

validateWebsiteDefinition(TCTMD_WEBSITE_DEFINITION)

export function parseTctmdSearchHtml(html: string, limit = 5) {
  return parseWebsiteSearchHtml(html, TCTMD_WEBSITE_DEFINITION, limit)
}

export class TctmdWebsiteAdapter implements SpecializedSourceAdapter {
  readonly descriptor = TCTMD_DESCRIPTOR

  async search(): Promise<never> {
    throw new SearchProviderError(
      'unavailable',
      'TCTMD live website transport is disabled pending operator approval.',
      { retryable: false },
    )
  }
}

export function createTctmdAdapter(): SpecializedSourceAdapter {
  return new TctmdWebsiteAdapter()
}
