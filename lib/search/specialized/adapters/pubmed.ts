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

const ESEARCH_ENDPOINT = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
const ESUMMARY_ENDPOINT = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi'
const PMID_PATTERN = /^\d{1,12}$/
const DOI_PATTERN = /^10\.\d{4,9}\/[\S]+$/i

const PUBMED_DESCRIPTOR: SpecializedSourceDescriptor = Object.freeze({
  id: 'pubmed',
  label: 'PubMed',
  adapterType: 'api',
  liveTransportAvailable: true,
})

export class PubMedApiAdapter implements SpecializedSourceAdapter {
  readonly descriptor = PUBMED_DESCRIPTOR

  constructor(private readonly fetcher: FetchLike = fetch) {}

  async search(
    request: SpecializedSourceSearchRequest,
    context: SearchContext,
  ): Promise<SpecializedSourceResults> {
    const limit = Math.max(0, Math.min(request.limit, SPECIALIZED_SEARCH_LIMIT))
    if (limit === 0) return EMPTY_RESULTS

    return withApiDeadline(context.signal, async signal => {
      const searchUrl = new URL(ESEARCH_ENDPOINT)
      searchUrl.search = new URLSearchParams({
        db: 'pubmed',
        term: request.query,
        retmax: String(limit),
        retmode: 'json',
        sort: 'relevance',
        tool: 'reporting',
      }).toString()
      const searchPayload = await fetchBoundedApiJson(this.fetcher, searchUrl, signal)
      const pmids = parseSearchIds(searchPayload).slice(0, limit)
      if (pmids.length === 0) return EMPTY_RESULTS

      const summaryUrl = new URL(ESUMMARY_ENDPOINT)
      summaryUrl.search = new URLSearchParams({
        db: 'pubmed',
        id: pmids.join(','),
        retmode: 'json',
        version: '2.0',
        tool: 'reporting',
      }).toString()
      const summaryPayload = await fetchBoundedApiJson(this.fetcher, summaryUrl, signal)
      return Object.freeze({
        candidates: Object.freeze(parseSummaryCandidates(summaryPayload, pmids)),
      })
    })
  }
}

const EMPTY_RESULTS: SpecializedSourceResults = Object.freeze({ candidates: Object.freeze([]) })

function parseSearchIds(payload: unknown): readonly string[] {
  const root = record(payload)
  const result = record(root?.esearchresult)
  if (!root || !result || !Array.isArray(result.idlist)) {
    throw invalidApiResponse('PubMed ESearch returned an invalid result object')
  }
  if (result.idlist.some(id => typeof id !== 'string' || !PMID_PATTERN.test(id))) {
    throw invalidApiResponse('PubMed ESearch returned an invalid PMID list')
  }
  return result.idlist as string[]
}

function parseSummaryCandidates(payload: unknown, pmids: readonly string[]): SearchCandidate[] {
  const root = record(payload)
  const result = record(root?.result)
  if (!root || !result || !Array.isArray(result.uids)
    || result.uids.some(uid => typeof uid !== 'string' || !PMID_PATTERN.test(uid))) {
    throw invalidApiResponse('PubMed ESummary returned an invalid result object')
  }

  return pmids.map(pmid => {
    const summary = record(result[pmid])
    if (!summary || summary.uid !== pmid) {
      throw invalidApiResponse('PubMed ESummary omitted a requested record')
    }
    const title = boundedPlainText(summary.title, 500)
    if (!title) throw invalidApiResponse('PubMed ESummary returned a record without a title')

    const doi = parseDoi(summary.articleids)
    const snippet = buildSnippet(summary)
    const publishedAt = normalizedIsoDate(summary.epubdate)
      ?? normalizedIsoDate(summary.pubdate)
    return Object.freeze({
      id: `pubmed:${pmid}`,
      origin: 'specialized' as const,
      title,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      ...(snippet ? { snippet } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      source: Object.freeze({ id: 'pubmed' as const, label: 'PubMed' }),
      identifiers: Object.freeze({ pmid, ...(doi ? { doi } : {}) }),
    })
  })
}

function parseDoi(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw invalidApiResponse('PubMed ESummary returned invalid article identifiers')
  }
  for (const candidate of value) {
    const articleId = record(candidate)
    if (!articleId || typeof articleId.idtype !== 'string' || typeof articleId.value !== 'string') {
      throw invalidApiResponse('PubMed ESummary returned invalid article identifiers')
    }
    if (articleId.idtype.toLowerCase() !== 'doi') continue
    const doi = boundedPlainText(articleId.value, 250)?.toLowerCase()
    return doi && DOI_PATTERN.test(doi) ? doi : undefined
  }
  return undefined
}

function buildSnippet(summary: Record<string, unknown>): string | undefined {
  const journal = boundedPlainText(summary.fulljournalname, 300)
    ?? boundedPlainText(summary.source, 300)
  let authorText: string | null = null
  if (summary.authors !== undefined) {
    if (!Array.isArray(summary.authors)) {
      throw invalidApiResponse('PubMed ESummary returned invalid authors')
    }
    const authors = summary.authors.map(author => {
      const value = record(author)
      if (!value || typeof value.name !== 'string') {
        throw invalidApiResponse('PubMed ESummary returned invalid authors')
      }
      return boundedPlainText(value.name, 100)
    }).filter((value): value is string => Boolean(value))
    authorText = authors.length > 0 ? authors.slice(0, 3).join(', ') : null
  }
  return boundedPlainText([journal, authorText].filter(Boolean).join(' · '), 800) ?? undefined
}
