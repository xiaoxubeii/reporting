import { SPECIALIZED_SEARCH_LIMIT } from '../../contracts'
import {
  type SearchCandidate,
  type SearchContext,
  type SpecializedSourceAdapter,
  type SpecializedSourceDescriptor,
  type SpecializedSourceResults,
  type SpecializedSourceSearchRequest,
} from '../../provider-contracts'
import { boundedPlainText, normalizedIsoDate } from '../../sanitize'
import {
  fetchBoundedApiJson,
  type FetchLike,
  invalidApiResponse,
  record,
  withApiDeadline,
} from '../api-fetch'

const FDA_510K_ENDPOINT = 'https://api.fda.gov/device/510k.json'
const K_NUMBER_PATTERN = /^K\d{6,8}$/
const FDA_QUERY_SPECIAL_CHARACTERS = /([+\-&|!(){}\[\]^"~*?:\\/])/g

const FDA_DESCRIPTOR: SpecializedSourceDescriptor = Object.freeze({
  id: 'fda',
  label: 'FDA/openFDA · 510(k)',
  adapterType: 'api',
  liveTransportAvailable: true,
})

export class Fda510kApiAdapter implements SpecializedSourceAdapter {
  readonly descriptor = FDA_DESCRIPTOR

  constructor(private readonly fetcher: FetchLike = fetch) {}

  async search(
    request: SpecializedSourceSearchRequest,
    context: SearchContext,
  ): Promise<SpecializedSourceResults> {
    const limit = Math.max(0, Math.min(request.limit, SPECIALIZED_SEARCH_LIMIT))
    if (limit === 0) return EMPTY_RESULTS

    return withApiDeadline(context.signal, async signal => {
      const phrase = escapeOpenFdaPhrase(request.query)
      const search = [
        `device_name:"${phrase}"`,
        `applicant:"${phrase}"`,
        `openfda.device_name:"${phrase}"`,
      ].join(' OR ')
      const url = new URL(FDA_510K_ENDPOINT)
      url.search = new URLSearchParams({ search, limit: String(limit) }).toString()
      const payload = await fetchBoundedApiJson(this.fetcher, url, signal, {
        notFoundErrorCode: 'NOT_FOUND',
      })
      if (payload === null) return EMPTY_RESULTS
      return Object.freeze({
        candidates: Object.freeze(parseCandidates(payload).slice(0, limit)),
      })
    })
  }
}

const EMPTY_RESULTS: SpecializedSourceResults = Object.freeze({ candidates: Object.freeze([]) })

function escapeOpenFdaPhrase(query: string): string {
  return query.replace(FDA_QUERY_SPECIAL_CHARACTERS, '\\$1')
}

function parseCandidates(payload: unknown): SearchCandidate[] {
  const root = record(payload)
  if (!root || !Array.isArray(root.results)) {
    throw invalidApiResponse('openFDA returned an invalid 510(k) result object')
  }
  return root.results.map(parseCandidate)
}

function parseCandidate(value: unknown): SearchCandidate {
  const raw = record(value)
  const kNumber = typeof raw?.k_number === 'string' ? raw.k_number.trim().toUpperCase() : ''
  if (!raw || !K_NUMBER_PATTERN.test(kNumber)) {
    throw invalidApiResponse('openFDA returned a 510(k) record without a valid k_number')
  }
  const deviceName = boundedPlainText(raw.device_name, 500)
  const title = deviceName ?? `510(k) ${kNumber}`
  const snippet = buildSnippet(raw)
  const publishedAt = normalizedFdaDate(raw.decision_date)
  const detailUrl = new URL('https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm')
  detailUrl.searchParams.set('ID', kNumber)

  return Object.freeze({
    id: `fda:${kNumber}`,
    origin: 'specialized' as const,
    title,
    url: detailUrl.toString(),
    ...(snippet ? { snippet } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    source: Object.freeze({ id: 'fda' as const, label: 'FDA/openFDA · 510(k)' }),
    identifiers: Object.freeze({ fdaId: kNumber }),
  })
}

function buildSnippet(raw: Record<string, unknown>): string | undefined {
  const applicant = boundedPlainText(raw.applicant, 300)
  const productCode = boundedPlainText(raw.product_code, 80)
  const clearanceType = boundedPlainText(raw.clearance_type, 120)
  return boundedPlainText([
    applicant,
    productCode ? `Product code ${productCode}` : null,
    clearanceType,
  ].filter(Boolean).join(' · '), 800) ?? undefined
}

function normalizedFdaDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const compact = value.trim().match(/^(\d{4})(\d{2})(\d{2})$/)
  return normalizedIsoDate(compact
    ? `${compact[1]}-${compact[2]}-${compact[3]}`
    : value)
}
