import { createHash } from 'node:crypto'
import { safeExternalHttpUrl } from '@/lib/feeds/url-policy'
import { WEB_SEARCH_LIMIT } from '../contracts'
import {
  SearchProviderError,
  type SearchCandidate,
  type SearchContext,
  type SearchProviderRequest,
  type SearchProviderResults,
  type WebSearchProvider,
} from '../provider-contracts'
import { boundedPlainText, normalizedIsoDate } from '../sanitize'
import { SEARCH_UPSTREAM_TIMEOUT_MS } from '../source-policy'
import { readBoundedResponseText } from '../read-bounded-text'

const MAX_SEARXNG_RESPONSE_BYTES = 1_000_000
const APPROVED_ENGINES = Object.freeze([
  'bing',
  'duckduckgo',
  'brave',
  'startpage',
  'bing news',
  'duckduckgo news',
  'brave.news',
  'startpage news',
])

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export class SearxngWebSearchProvider implements WebSearchProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async search(
    request: SearchProviderRequest,
    context: SearchContext,
  ): Promise<SearchProviderResults> {
    const deadline = deadlineSignal(context.signal, SEARCH_UPSTREAM_TIMEOUT_MS)
    try {
      const body = new URLSearchParams({
        q: request.query,
        format: 'json',
        categories: 'general,news',
        safesearch: '1',
        pageno: '1',
        engines: APPROVED_ENGINES.join(','),
      })
      const response = await this.fetcher(`${this.baseUrl}/search`, {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        signal: deadline.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: body.toString(),
      })
      if (response.status === 429) {
        await discardBody(response)
        throw new SearchProviderError('rate_limited', 'SearXNG rate limited the request', {
          retryable: true,
          upstreamStatus: response.status,
        })
      }
      if (!response.ok) {
        await discardBody(response)
        throw new SearchProviderError('failed', 'SearXNG request failed', {
          retryable: response.status >= 500,
          upstreamStatus: response.status,
        })
      }
      const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? ''
      if (!contentType.includes('application/json')) {
        await discardBody(response)
        throw new SearchProviderError('invalid_response', 'SearXNG returned a non-JSON response', {
          retryable: false,
        })
      }
      const payload = record(JSON.parse(await readBoundedResponseText(
        response,
        MAX_SEARXNG_RESPONSE_BYTES,
        () => new SearchProviderError(
          'invalid_response',
          'SearXNG response was too large',
          { retryable: false },
        ),
      )))
      if (!payload || !Array.isArray(payload.results)) {
        throw new SearchProviderError('invalid_response', 'SearXNG returned an invalid result object', {
          retryable: false,
        })
      }

      const candidates = payload.results
        .flatMap(value => normalizeCandidate(value))
        .slice(0, WEB_SEARCH_LIMIT)
      const hasEngineFailures = Array.isArray(payload.unresponsive_engines)
        && payload.unresponsive_engines.length > 0
      const status = candidates.length === 0
        ? (hasEngineFailures ? 'failed' : 'empty')
        : (hasEngineFailures ? 'partial' : 'ok')
      return Object.freeze({
        candidates: Object.freeze(candidates),
        statuses: Object.freeze([Object.freeze({
          id: 'web' as const,
          status,
          resultCount: candidates.length,
          ...(status === 'failed' ? { retryable: true, message: 'Web engines were unavailable.' } : {}),
        })]),
      })
    } catch (error) {
      if (error instanceof SearchProviderError) throw error
      if (isAbortError(error)) {
        throw new SearchProviderError('timeout', 'SearXNG timed out', { retryable: true })
      }
      if (error instanceof SyntaxError) {
        throw new SearchProviderError('invalid_response', 'SearXNG returned malformed JSON', { retryable: false })
      }
      throw new SearchProviderError('failed', 'SearXNG request failed', { retryable: true })
    } finally {
      deadline.dispose()
    }
  }
}

function normalizeCandidate(value: unknown): readonly SearchCandidate[] {
  const raw = record(value)
  if (!raw) return []
  const title = boundedPlainText(raw.title, 500)
  const url = safeExternalHttpUrl(raw.url)
  if (!title || !url) return []
  const engineValue = typeof raw.engine === 'string'
    ? raw.engine
    : Array.isArray(raw.engines) && typeof raw.engines[0] === 'string'
      ? raw.engines[0]
      : null
  const engine = boundedPlainText(engineValue, 60)
  const snippet = boundedPlainText(raw.content, 800) ?? undefined
  return [Object.freeze({
    id: `web:${createHash('sha256').update(url).digest('hex').slice(0, 20)}`,
    origin: 'web' as const,
    title,
    url,
    ...(snippet ? { snippet } : {}),
    ...(normalizedIsoDate(raw.publishedDate) ? { publishedAt: normalizedIsoDate(raw.publishedDate) } : {}),
    source: Object.freeze({
      id: 'web' as const,
      label: engine ? `Web · ${engine}` : 'Web',
    }),
  })]
}

async function discardBody(response: Response): Promise<void> {
  if (response.body) await response.body.cancel().catch(() => undefined)
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error
    && ((error as { name?: unknown }).name === 'AbortError'
      || (error as { name?: unknown }).name === 'TimeoutError')
}

function deadlineSignal(parent: AbortSignal, timeoutMs: number): {
  readonly signal: AbortSignal
  readonly dispose: () => void
} {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parent.reason)
  if (parent.aborted) abortFromParent()
  else parent.addEventListener('abort', abortFromParent, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), timeoutMs)
  return Object.freeze({
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      parent.removeEventListener('abort', abortFromParent)
    },
  })
}
