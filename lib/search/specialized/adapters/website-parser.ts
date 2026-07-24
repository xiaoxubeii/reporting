import { createHash } from 'node:crypto'
import type { SearchCandidate, SearchAdapterDescriptor } from '../../adapter-contracts'
import { SearchAdapterError } from '../../adapter-contracts'
import { boundedPlainText, normalizedIsoDate } from '../../sanitize'

const MAX_WEBSITE_HTML_BYTES = 512_000
const MAX_DISCOVERED_CARDS = 100
const MAX_TITLE_LENGTH = 300
const MAX_SNIPPET_LENGTH = 800
const RESULT_ELEMENT = /<(article|li)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi
const ANCHOR = /<a\b([^>]*?)href\s*=\s*(?:"([^"]*)"|'([^']*)')([^>]*)>([\s\S]*?)<\/a\s*>/gi

export interface WebsiteSearchDefinition {
  readonly descriptor: SearchAdapterDescriptor
  readonly searchEndpoint: string
  readonly queryParameter: string
  readonly allowedSearchHosts: readonly string[]
  readonly allowedSearchPath: string
  readonly allowedRedirectHosts: readonly string[]
  readonly allowedResultHosts: readonly string[]
  readonly isAllowedResultPath: (pathname: string) => boolean
  readonly resultCardClass: RegExp
  readonly resultsContainer: RegExp
  readonly noResults: RegExp
}

/**
 * Parses a saved, bounded search-result response. It never performs transport,
 * follows links, fetches detail pages, or evaluates source markup.
 */
export function parseWebsiteSearchHtml(
  html: string,
  definition: WebsiteSearchDefinition,
  requestedLimit: number,
): readonly SearchCandidate[] {
  assertBoundedHtml(html, definition.descriptor.label)
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(0, Math.min(Math.trunc(requestedLimit), 5))
    : 5
  if (limit === 0) return Object.freeze([])

  const cards = extractResultCards(html, definition)
  if (cards.length === 0) {
    if (definition.resultsContainer.test(html) && definition.noResults.test(html)) {
      return Object.freeze([])
    }
    throw structureChanged(definition.descriptor.label)
  }

  const candidates: SearchCandidate[] = []
  let malformedAllowedResult = false
  for (const card of cards) {
    if (isAdvertisement(card.attributes, card.body)) continue
    const parsed = parseCard(card.body, definition)
    malformedAllowedResult ||= parsed.malformedAllowedResult
    if (parsed.candidate) candidates.push(parsed.candidate)
    if (candidates.length >= limit) break
  }

  if (candidates.length === 0 && malformedAllowedResult) {
    throw structureChanged(definition.descriptor.label)
  }
  return Object.freeze(candidates.slice())
}

export function validateWebsiteDefinition(definition: WebsiteSearchDefinition): void {
  let endpoint: URL
  try {
    endpoint = new URL(definition.searchEndpoint)
  } catch {
    throw new SearchAdapterError('invalid_response', `${definition.descriptor.label} has an invalid search endpoint`, {
      retryable: false,
    })
  }
  if (
    endpoint.protocol !== 'https:'
    || endpoint.username
    || endpoint.password
    || endpoint.port
    || !definition.allowedSearchHosts.includes(endpoint.hostname.toLowerCase())
    || endpoint.pathname !== definition.allowedSearchPath
  ) {
    throw new SearchAdapterError('invalid_response', `${definition.descriptor.label} has an unapproved search endpoint`, {
      retryable: false,
    })
  }
}

interface ResultCard {
  readonly attributes: string
  readonly body: string
}

function extractResultCards(
  html: string,
  definition: WebsiteSearchDefinition,
): readonly ResultCard[] {
  const cards: ResultCard[] = []
  for (const match of Array.from(html.matchAll(RESULT_ELEMENT))) {
    const attributes = match[2] ?? ''
    if (!definition.resultCardClass.test(attributes)) continue
    cards.push(Object.freeze({ attributes, body: match[3] ?? '' }))
    if (cards.length >= MAX_DISCOVERED_CARDS) break
  }
  return cards
}

function parseCard(
  body: string,
  definition: WebsiteSearchDefinition,
): { readonly candidate?: SearchCandidate; readonly malformedAllowedResult: boolean } {
  let encounteredAllowedUrl = false
  for (const match of Array.from(body.matchAll(ANCHOR))) {
    const rawHref = decodeAttribute(match[2] ?? match[3] ?? '')
    const url = allowedResultUrl(rawHref, definition)
    if (!url) continue
    encounteredAllowedUrl = true
    if (isAdvertisement(`${match[1] ?? ''} ${match[4] ?? ''}`, match[5] ?? '')) continue
    const title = boundedPlainText(match[5], MAX_TITLE_LENGTH)
    if (!title) continue

    const snippet = firstPlainTextElement(body, 'p', MAX_SNIPPET_LENGTH)
    const publishedAt = extractPublishedAt(body)
    return Object.freeze({
      candidate: Object.freeze({
        id: `${definition.descriptor.id}:${createHash('sha256').update(url).digest('hex').slice(0, 20)}`,
        origin: 'specialized' as const,
        title,
        url,
        ...(snippet ? { snippet } : {}),
        ...(publishedAt ? { publishedAt } : {}),
        source: Object.freeze({
          id: definition.descriptor.id,
          label: definition.descriptor.label,
        }),
      }),
      malformedAllowedResult: false,
    })
  }
  return Object.freeze({ malformedAllowedResult: encounteredAllowedUrl })
}

function allowedResultUrl(
  rawHref: string,
  definition: WebsiteSearchDefinition,
): string | null {
  let parsed: URL
  try {
    parsed = new URL(rawHref, definition.searchEndpoint)
  } catch {
    return null
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.port
    || !definition.allowedResultHosts.includes(parsed.hostname.toLowerCase())
    || !definition.isAllowedResultPath(parsed.pathname)
  ) return null
  parsed.hash = ''
  return parsed.toString()
}

function firstPlainTextElement(body: string, tag: 'p', maxLength: number): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i').exec(body)
  return boundedPlainText(match?.[1], maxLength)
}

function extractPublishedAt(body: string): string | undefined {
  const time = /<time\b[^>]*datetime\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/i.exec(body)
  return normalizedIsoDate(decodeAttribute(time?.[1] ?? time?.[2] ?? ''))
}

function isAdvertisement(attributes: string, body: string): boolean {
  const marker = `${attributes} ${body.slice(0, 600)}`
  return /(?:^|[\s_"'=-])(?:ad|ads|advertisement|advertorial|promoted|sponsored(?:-content)?)(?:$|[\s_"'=-])/i.test(marker)
    || /\brel\s*=\s*(?:"[^"]*sponsored[^"]*"|'[^']*sponsored[^']*')/i.test(marker)
}

function decodeAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim()
}

function assertBoundedHtml(html: unknown, label: string): asserts html is string {
  if (typeof html !== 'string' || !html.trim()) throw structureChanged(label)
  if (new TextEncoder().encode(html).byteLength > MAX_WEBSITE_HTML_BYTES) {
    throw new SearchAdapterError('invalid_response', `${label} search response exceeded the parser limit.`, {
      retryable: false,
    })
  }
}

function structureChanged(label: string): SearchAdapterError {
  return new SearchAdapterError('invalid_response', `${label} search result structure changed.`, {
    retryable: false,
  })
}
