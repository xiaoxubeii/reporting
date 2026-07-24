import { SPECIALIZED_SEARCH_LIMIT } from '../../contracts'
import {
  getSearchAdapterDescriptor,
  type SearchCandidate,
  type SearchContext,
  type SearchAdapter,
  type SearchAdapterResults,
  type SearchAdapterRequest,
} from '../../adapter-contracts'
import { boundedPlainText, normalizedIsoDate } from '../../sanitize'
import {
  fetchBoundedApiJson,
  type FetchLike,
  invalidApiResponse,
  record,
  withApiDeadline,
} from '../api-fetch'

const CLINICAL_TRIALS_ENDPOINT = 'https://clinicaltrials.gov/api/v2/studies'
const NCT_PATTERN = /^NCT\d{8}$/
const FIELDS = Object.freeze([
  'NCTId',
  'BriefTitle',
  'OfficialTitle',
  'BriefSummary',
  'StudyFirstPostDate',
])

const CLINICAL_TRIALS_DESCRIPTOR = getSearchAdapterDescriptor('clinical_trials')

export class ClinicalTrialsApiAdapter implements SearchAdapter {
  readonly descriptor = CLINICAL_TRIALS_DESCRIPTOR

  constructor(private readonly fetcher: FetchLike = fetch) {}

  async search(
    request: SearchAdapterRequest,
    context: SearchContext,
  ): Promise<SearchAdapterResults> {
    const limit = Math.max(0, Math.min(request.limit, SPECIALIZED_SEARCH_LIMIT))
    if (limit === 0) return EMPTY_RESULTS

    return withApiDeadline(context.signal, async signal => {
      const url = new URL(CLINICAL_TRIALS_ENDPOINT)
      url.search = new URLSearchParams({
        'query.term': request.query,
        pageSize: String(limit),
        format: 'json',
        fields: FIELDS.join(','),
      }).toString()
      const payload = await fetchBoundedApiJson(this.fetcher, url, signal)
      return Object.freeze({
        candidates: Object.freeze(parseCandidates(payload).slice(0, limit)),
      })
    })
  }
}

const EMPTY_RESULTS: SearchAdapterResults = Object.freeze({ candidates: Object.freeze([]) })

function parseCandidates(payload: unknown): SearchCandidate[] {
  const root = record(payload)
  if (!root || !Array.isArray(root.studies)) {
    throw invalidApiResponse('ClinicalTrials.gov returned an invalid result object')
  }
  return root.studies.map(parseCandidate)
}

function parseCandidate(value: unknown): SearchCandidate {
  const study = record(value)
  const protocol = record(study?.protocolSection)
  const identification = record(protocol?.identificationModule)
  if (!study || !protocol || !identification
    || typeof identification.nctId !== 'string'
    || !NCT_PATTERN.test(identification.nctId)) {
    throw invalidApiResponse('ClinicalTrials.gov returned a study without a valid NCT ID')
  }
  const nct = identification.nctId
  const title = boundedPlainText(identification.briefTitle, 500)
    ?? boundedPlainText(identification.officialTitle, 500)
  if (!title) {
    throw invalidApiResponse('ClinicalTrials.gov returned a study without a title')
  }

  const description = optionalRecord(protocol.descriptionModule, 'description module')
  const status = optionalRecord(protocol.statusModule, 'status module')
  const firstPostDate = optionalRecord(status?.studyFirstPostDateStruct, 'first-post date')
  const snippet = boundedPlainText(description?.briefSummary, 800) ?? undefined
  const publishedAt = normalizedIsoDate(firstPostDate?.date)
  return Object.freeze({
    id: `clinical_trials:${nct}`,
    origin: 'specialized' as const,
    title,
    url: `https://clinicaltrials.gov/study/${nct}`,
    ...(snippet ? { snippet } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    source: Object.freeze({ id: 'clinical_trials' as const, label: 'ClinicalTrials.gov' }),
    identifiers: Object.freeze({ nct }),
  })
}

function optionalRecord(value: unknown, label: string): Record<string, unknown> | null {
  if (value === undefined) return null
  const parsed = record(value)
  if (!parsed) throw invalidApiResponse(`ClinicalTrials.gov returned an invalid ${label}`)
  return parsed
}
