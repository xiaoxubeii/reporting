export const MAX_SEARCH_BODY_BYTES = 16 * 1024
export const MAX_SEARCH_CATEGORY_CONFIG_BODY_BYTES = 64 * 1024

export class SearchRequestBodyError extends Error {
  readonly code = 'invalid_request'

  constructor(message: string, readonly status: 400 | 403 | 413 | 415) {
    super(message)
    this.name = 'SearchRequestBodyError'
  }
}

export function assertSameOriginSearchRequest(request: Request): void {
  const requestUrl = new URL(request.url)
  const expectedOrigins = new Set([requestUrl.origin])
  const host = request.headers.get('Host')?.trim()
  if (host) {
    try { expectedOrigins.add(new URL(`${requestUrl.protocol}//${host}`).origin) } catch { /* invalid host stays denied */ }
  }
  const suppliedOrigin = request.headers.get('Origin') ?? originFromReferer(request.headers.get('Referer'))
  const fetchSite = request.headers.get('Sec-Fetch-Site')
  if (!suppliedOrigin || !expectedOrigins.has(suppliedOrigin) || (fetchSite && fetchSite !== 'same-origin')) {
    throw new SearchRequestBodyError('Cross-origin search requests are not allowed.', 403)
  }
  const contentType = request.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new SearchRequestBodyError('A JSON request is required.', 415)
  }
}

export async function readSearchJson(
  request: Request,
  maxBodyBytes = MAX_SEARCH_BODY_BYTES,
): Promise<unknown> {
  const declared = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    if (request.body) await request.body.cancel().catch(() => undefined)
    throw new SearchRequestBodyError('The search request is too large.', 413)
  }
  if (!request.body) throw new SearchRequestBodyError('A valid JSON request body is required.', 400)

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let body = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBodyBytes) {
        await reader.cancel().catch(() => undefined)
        throw new SearchRequestBodyError('The search request is too large.', 413)
      }
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
    try { return JSON.parse(body) } catch { throw new SearchRequestBodyError('A valid JSON request body is required.', 400) }
  } finally {
    reader.releaseLock()
  }
}

function originFromReferer(value: string | null): string | null {
  if (!value) return null
  try { return new URL(value).origin } catch { return null }
}
