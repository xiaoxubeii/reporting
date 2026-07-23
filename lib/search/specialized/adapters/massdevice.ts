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

const MASSDEVICE_DESCRIPTOR: SpecializedSourceDescriptor = Object.freeze({
  id: 'massdevice',
  label: 'MassDevice',
  adapterType: 'website',
  liveTransportAvailable: false,
})

const RESERVED_MASSDEVICE_PATHS = new Set([
  'about',
  'advertise',
  'author',
  'category',
  'contact',
  'feed',
  'page',
  'search',
  'tag',
  'wp-admin',
  'wp-content',
  'wp-json',
])

export const MASSDEVICE_WEBSITE_DEFINITION: WebsiteSearchDefinition = Object.freeze({
  descriptor: MASSDEVICE_DESCRIPTOR,
  searchEndpoint: 'https://www.massdevice.com/',
  queryParameter: 's',
  allowedSearchHosts: Object.freeze(['www.massdevice.com']),
  allowedSearchPath: '/',
  allowedRedirectHosts: Object.freeze([]),
  allowedResultHosts: Object.freeze(['www.massdevice.com', 'massdevice.com']),
  isAllowedResultPath: (pathname: string) => {
    const segments = pathname.split('/').filter(Boolean)
    return segments.length === 1
      && /^[a-z0-9][a-z0-9-]+$/i.test(segments[0])
      && !RESERVED_MASSDEVICE_PATHS.has(segments[0].toLowerCase())
  },
  resultCardClass: /\b(?:search-result|type-post)\b/i,
  resultsContainer: /(?:id|class)\s*=\s*(?:"[^"]*search-results[^"]*"|'[^']*search-results[^']*')/i,
  noResults: /\b(?:no results|nothing found|no matching results)\b/i,
})

validateWebsiteDefinition(MASSDEVICE_WEBSITE_DEFINITION)

export function parseMassDeviceSearchHtml(html: string, limit = 5) {
  return parseWebsiteSearchHtml(html, MASSDEVICE_WEBSITE_DEFINITION, limit)
}

export class MassDeviceWebsiteAdapter implements SpecializedSourceAdapter {
  readonly descriptor = MASSDEVICE_DESCRIPTOR

  async search(): Promise<never> {
    throw new SearchProviderError(
      'unavailable',
      'MassDevice live website transport is disabled pending operator approval.',
      { retryable: false },
    )
  }
}

export function createMassDeviceAdapter(): SpecializedSourceAdapter {
  return new MassDeviceWebsiteAdapter()
}
