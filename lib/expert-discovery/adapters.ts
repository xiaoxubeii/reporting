import { createHash } from 'node:crypto'
import { boundedPlainText } from '@/lib/search/sanitize'
import {
  fetchBoundedApiJson,
  invalidApiResponse,
  record,
  withApiDeadline,
  type FetchLike,
} from '@/lib/search/specialized/api-fetch'
import type { DiscoveredExpert, ExpertDiscoverySourceId, ExpertSourceEvidence } from './types'

const PUBMED_SEARCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
const PUBMED_SUMMARY = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi'
const CLINICAL_TRIALS = 'https://clinicaltrials.gov/api/v2/studies'
const RECORD_LIMIT = 5
const PEOPLE_PER_RECORD_LIMIT = 8

export async function discoverFromSource(
  sourceId: ExpertDiscoverySourceId,
  query: string,
  signal: AbortSignal,
  fetcher: FetchLike = fetch,
): Promise<readonly DiscoveredExpert[]> {
  return sourceId === 'pubmed'
    ? discoverPubMed(query, signal, fetcher)
    : discoverClinicalTrials(query, signal, fetcher)
}

async function discoverPubMed(query: string, parentSignal: AbortSignal, fetcher: FetchLike) {
  return withApiDeadline(parentSignal, async signal => {
    const searchUrl = new URL(PUBMED_SEARCH)
    searchUrl.search = new URLSearchParams({ db: 'pubmed', term: query, retmax: String(RECORD_LIMIT), retmode: 'json', sort: 'relevance', tool: 'reporting' }).toString()
    const searchRoot = record(await fetchBoundedApiJson(fetcher, searchUrl, signal))
    const result = record(searchRoot?.esearchresult)
    if (!result || !Array.isArray(result.idlist)) throw invalidApiResponse('PubMed returned an invalid result list')
    const ids = result.idlist.filter((id): id is string => typeof id === 'string' && /^\d{1,12}$/.test(id)).slice(0, RECORD_LIMIT)
    if (ids.length === 0) return Object.freeze([])

    const summaryUrl = new URL(PUBMED_SUMMARY)
    summaryUrl.search = new URLSearchParams({ db: 'pubmed', id: ids.join(','), retmode: 'json', version: '2.0', tool: 'reporting' }).toString()
    const summaryRoot = record(await fetchBoundedApiJson(fetcher, summaryUrl, signal))
    const summaries = record(summaryRoot?.result)
    if (!summaries) throw invalidApiResponse('PubMed returned invalid summaries')
    return Object.freeze(ids.flatMap(pmid => pubMedPeople(pmid, summaries[pmid])))
  })
}

function pubMedPeople(pmid: string, value: unknown): DiscoveredExpert[] {
  const summary = record(value)
  if (!summary || !Array.isArray(summary.authors)) return []
  const recordTitle = boundedPlainText(summary.title, 500) ?? `PubMed ${pmid}`
  return summary.authors.slice(0, PEOPLE_PER_RECORD_LIMIT).flatMap((author, index) => {
    const person = record(author)
    const name = boundedPlainText(person?.name, 160)
    if (!name) return []
    const evidence: ExpertSourceEvidence = Object.freeze({
      sourceId: 'pubmed', recordId: pmid, recordTitle,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, role: 'Author',
    })
    return [expert({ sourceId: 'pubmed', recordId: pmid, index, name, email: null, title: 'Published author', organization: null, evidence })]
  })
}

async function discoverClinicalTrials(query: string, parentSignal: AbortSignal, fetcher: FetchLike) {
  return withApiDeadline(parentSignal, async signal => {
    const url = new URL(CLINICAL_TRIALS)
    url.search = new URLSearchParams({
      'query.term': query,
      pageSize: String(RECORD_LIMIT),
      format: 'json',
      fields: [
        'NCTId', 'BriefTitle', 'OfficialTitle', 'OverallOfficialName',
        'OverallOfficialAffiliation', 'OverallOfficialRole', 'CentralContactName',
        'CentralContactEMail', 'CentralContactAffiliation', 'CentralContactRole',
        'LeadSponsorName',
      ].join(','),
    }).toString()
    const root = record(await fetchBoundedApiJson(fetcher, url, signal))
    if (!root || !Array.isArray(root.studies)) throw invalidApiResponse('ClinicalTrials.gov returned invalid studies')
    return Object.freeze(root.studies.slice(0, RECORD_LIMIT).flatMap(clinicalTrialPeople))
  })
}

function clinicalTrialPeople(value: unknown): DiscoveredExpert[] {
  const study = record(value)
  const protocol = record(study?.protocolSection)
  const identification = record(protocol?.identificationModule)
  const contacts = record(protocol?.contactsLocationsModule)
  const sponsor = record(protocol?.sponsorCollaboratorsModule)
  const nct = boundedPlainText(identification?.nctId, 32)
  if (!nct || !/^NCT\d{8}$/.test(nct)) return []
  const recordTitle = boundedPlainText(identification?.briefTitle, 500)
    ?? boundedPlainText(identification?.officialTitle, 500) ?? nct
  const officials = Array.isArray(contacts?.overallOfficials) ? contacts.overallOfficials : []
  const centralContacts = Array.isArray(contacts?.centralContacts) ? contacts.centralContacts : []
  const sponsorName = boundedPlainText(sponsor?.leadSponsor && record(sponsor.leadSponsor)?.name, 240)
  return [...officials, ...centralContacts].slice(0, PEOPLE_PER_RECORD_LIMIT).flatMap((official, index) => {
    const person = record(official)
    const name = boundedPlainText(person?.name, 160)
    if (!name) return []
    const role = boundedPlainText(person?.role, 120)
    const organization = boundedPlainText(person?.affiliation, 240) ?? sponsorName
    const explicitEmail = boundedEmail(person?.email)
    const evidence: ExpertSourceEvidence = Object.freeze({
      sourceId: 'clinical_trials', recordId: nct, recordTitle,
      url: `https://clinicaltrials.gov/study/${nct}`, role,
    })
    return [expert({ sourceId: 'clinical_trials', recordId: nct, index, name, email: explicitEmail, title: role, organization, evidence })]
  })
}

function expert(input: {
  sourceId: ExpertDiscoverySourceId
  recordId: string
  index: number
  name: string
  email: string | null
  title: string | null
  organization: string | null
  evidence: ExpertSourceEvidence
}): DiscoveredExpert {
  // Only an explicit upstream email is a strong enough cross-record identity in V1.
  // Weak identities stay record-scoped so same-name clinicians are never merged silently.
  const identityParts = input.email
    ? ['email', normalize(input.email)]
    : [input.sourceId, 'record', input.recordId, String(input.index), normalize(input.name)]
  const identityFingerprint = createHash('sha256')
    .update(identityParts.join('|'))
    .digest('hex')
  const profileText = boundedPlainText([
    input.name,
    input.title,
    input.organization,
    `Evidence: ${input.evidence.recordTitle}`,
  ].filter(Boolean).join(' — '), 6000) ?? input.name
  return Object.freeze({
    identityFingerprint,
    name: input.name,
    email: input.email,
    title: input.title,
    organization: input.organization,
    profileText,
    evidence: Object.freeze([input.evidence]),
  })
}

function boundedEmail(value: unknown): string | null {
  const email = boundedPlainText(value, 320)?.toLocaleLowerCase()
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}
