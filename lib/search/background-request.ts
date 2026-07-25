import { createHash } from 'node:crypto'

import {
  MAX_SEARCH_QUERY_LENGTH,
  SearchContractError,
  type SearchResponse,
} from './contracts'

export interface BackgroundSearchRequest {
  readonly query: string
  readonly toolCallId: string
}

const TOOL_CALL_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/
const MAX_BACKGROUND_RESULTS = 10

export function parseBackgroundSearchRequest(value: unknown): BackgroundSearchRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SearchContractError('Background Search request must be an object.')
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.length !== 2 || keys[0] !== 'query' || keys[1] !== 'toolCallId') {
    throw new SearchContractError('Background Search request contains an unsupported field.')
  }
  if (typeof record.query !== 'string') throw new SearchContractError('A search query is required.')
  const query = record.query.trim()
  if (!query || query.length > MAX_SEARCH_QUERY_LENGTH || /[\u0000-\u001f\u007f]/.test(query)) {
    throw new SearchContractError('The search query is invalid.')
  }
  if (typeof record.toolCallId !== 'string' || !TOOL_CALL_ID_PATTERN.test(record.toolCallId)) {
    throw new SearchContractError('The tool call ID is invalid.')
  }
  return Object.freeze({ query, toolCallId: record.toolCallId })
}

export function sanitizeBackgroundSearchResponse(response: SearchResponse): SearchResponse {
  return Object.freeze({
    results: Object.freeze(response.results.slice(0, MAX_BACKGROUND_RESULTS).map(result => {
      return Object.freeze({
        id: opaqueEvidenceId(result),
        primaryOrigin: result.primaryOrigin,
        origins: Object.freeze(result.origins.slice(0, 3)),
        title: boundedText(result.title, 300),
        ...(safeUrl(result.url) ? { url: result.url } : {}),
        ...(result.snippet ? { snippet: boundedText(result.snippet, 1_000) } : {}),
        ...(result.publishedAt ? { publishedAt: boundedText(result.publishedAt, 64) } : {}),
        sources: Object.freeze(result.sources.slice(0, 8).map(source => Object.freeze({
          id: source.id,
          label: codeOwnedSourceLabel(source.id),
        }))),
        ...(result.identifiers ? { identifiers: result.identifiers } : {}),
      })
    })),
    sources: Object.freeze(response.sources.slice(0, 20).map(source => Object.freeze({
      id: source.id,
      status: source.status,
      resultCount: Math.max(0, Math.min(MAX_BACKGROUND_RESULTS, source.resultCount)),
      ...(source.retryable === true ? { retryable: true } : {}),
    }))),
    partial: response.partial,
  })
}

function boundedText(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, maxLength)
}

function safeUrl(value: string | undefined): boolean {
  return typeof value === 'string' && value.length <= 2_048 && /^https?:\/\//i.test(value)
}

function opaqueEvidenceId(result: SearchResponse['results'][number]): string {
  const stableReference = result.url
    ?? result.identifiers?.doi
    ?? result.identifiers?.pmid
    ?? result.identifiers?.nct
    ?? result.identifiers?.fdaId
    ?? result.id
  const digest = createHash('sha256')
    .update(stableReference)
    .digest('hex')
    .slice(0, 24)
  return `evidence_${digest}`
}

function codeOwnedSourceLabel(id: SearchResponse['results'][number]['sources'][number]['id']): string {
  const labels: Record<typeof id, string> = {
    feeds: 'Feed evidence',
    web: 'Web',
    pubmed: 'PubMed',
    clinical_trials: 'ClinicalTrials.gov',
    fda: 'FDA',
    tctmd: 'TCTMD',
    massdevice: 'MassDevice',
  }
  return labels[id]
}
