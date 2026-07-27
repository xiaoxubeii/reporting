const MAX_BODY_BYTES = 64 * 1024

export class FundPublicSiteRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 413 | 415,
  ) {
    super(message)
    this.name = 'FundPublicSiteRequestError'
  }
}

export function assertSameOriginFundPublicSiteMutation(request: Request): void {
  const requestUrl = new URL(request.url)
  const expectedOrigins = new Set([requestUrl.origin])
  const host = request.headers.get('Host')?.trim()
  if (host) {
    try {
      expectedOrigins.add(new URL(`${requestUrl.protocol}//${host}`).origin)
    } catch {
      throw new FundPublicSiteRequestError('Cross-origin changes are not allowed.', 403)
    }
  }

  const suppliedOrigin = request.headers.get('Origin') ?? originFromReferer(request.headers.get('Referer'))
  const fetchSite = request.headers.get('Sec-Fetch-Site')
  if (!suppliedOrigin || !expectedOrigins.has(suppliedOrigin) || (fetchSite && fetchSite !== 'same-origin')) {
    throw new FundPublicSiteRequestError('Cross-origin changes are not allowed.', 403)
  }

  const contentType = request.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new FundPublicSiteRequestError('A JSON request is required.', 415)
  }
}

export async function readFundPublicSiteJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    if (request.body) await request.body.cancel().catch(() => undefined)
    throw new FundPublicSiteRequestError('The request is too large.', 413)
  }

  if (!request.body) throw new FundPublicSiteRequestError('Invalid JSON body.', 400)

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let totalBytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new FundPublicSiteRequestError('The request is too large.', 413)
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    reader.releaseLock()
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new FundPublicSiteRequestError('Invalid JSON body.', 400)
  }
}

function originFromReferer(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}
