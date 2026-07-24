import { SearchAdapterError } from '../adapter-contracts'
import { SEARCH_UPSTREAM_TIMEOUT_MS } from '../source-policy'
import { readBoundedResponseText } from '../read-bounded-text'

const MAX_API_RESPONSE_BYTES = 1_000_000

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export async function withApiDeadline<T>(
  parentSignal: AbortSignal,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const deadline = deadlineSignal(parentSignal, SEARCH_UPSTREAM_TIMEOUT_MS)
  try {
    return await operation(deadline.signal)
  } catch (error) {
    if (error instanceof SearchAdapterError) throw error
    if (isAbortError(error)) {
      throw new SearchAdapterError('timeout', 'Professional API request timed out', {
        retryable: true,
      })
    }
    if (error instanceof SyntaxError) {
      throw new SearchAdapterError('invalid_response', 'Professional API returned malformed JSON', {
        retryable: false,
      })
    }
    throw new SearchAdapterError('failed', 'Professional API request failed', {
      retryable: true,
    })
  } finally {
    deadline.dispose()
  }
}

export async function fetchBoundedApiJson(
  fetcher: FetchLike,
  url: URL,
  signal: AbortSignal,
  options: { readonly notFoundErrorCode?: string } = {},
): Promise<unknown | null> {
  const response = await fetcher(url, {
    method: 'GET',
    redirect: 'error',
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  })

  if (response.status === 404 && options.notFoundErrorCode) {
    const payload = await readJsonResponse(response)
    const error = record(record(payload)?.error)
    if (error?.code === options.notFoundErrorCode) return null
    throw new SearchAdapterError('failed', 'Professional API endpoint was not found', {
      retryable: false,
      upstreamStatus: response.status,
    })
  }
  if (response.status === 429) {
    await discardBody(response)
    throw new SearchAdapterError('rate_limited', 'Professional API rate limited the request', {
      retryable: true,
      upstreamStatus: response.status,
    })
  }
  if (!response.ok) {
    await discardBody(response)
    throw new SearchAdapterError('failed', 'Professional API request failed', {
      retryable: response.status >= 500,
      upstreamStatus: response.status,
    })
  }

  return readJsonResponse(response)
}

export function invalidApiResponse(message: string): SearchAdapterError {
  return new SearchAdapterError('invalid_response', message, { retryable: false })
}

export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    await discardBody(response)
    throw new SearchAdapterError('invalid_response', 'Professional API returned non-JSON content', {
      retryable: false,
    })
  }
  return JSON.parse(await readBoundedResponseText(
    response,
    MAX_API_RESPONSE_BYTES,
    () => invalidApiResponse('Professional API response was too large'),
  )) as unknown
}

async function discardBody(response: Response): Promise<void> {
  if (response.body) await response.body.cancel().catch(() => undefined)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError' || error.name === 'TimeoutError'
    : typeof error === 'object' && error !== null && 'name' in error
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
  const timer = setTimeout(
    () => controller.abort(new DOMException('Timed out', 'TimeoutError')),
    timeoutMs,
  )
  return Object.freeze({
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      parent.removeEventListener('abort', abortFromParent)
    },
  })
}
