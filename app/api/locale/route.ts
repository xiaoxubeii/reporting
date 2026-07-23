import { NextRequest, NextResponse } from 'next/server'
import { isSupportedLocale, LOCALE_COOKIE_NAME } from '@/i18n/locales'
import { isDevelopmentLoopbackForward } from '@/i18n/origin'

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365
const MAX_BODY_BYTES = 100

function jsonResponse(body: Record<string, string>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function getHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false

  const requestOrigin = getHttpOrigin(origin)
  if (!requestOrigin) return false

  const allowedOrigins = new Set([request.nextUrl.origin])
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (configuredSiteUrl) {
    const configuredOrigin = getHttpOrigin(configuredSiteUrl)
    if (configuredOrigin) allowedOrigins.add(configuredOrigin)
  }

  return (
    allowedOrigins.has(requestOrigin) ||
    isDevelopmentLoopbackForward(requestOrigin, request.nextUrl.origin)
  )
}

async function readBoundedBody(request: NextRequest): Promise<
  { ok: true; body: string } | { ok: false; tooLarge: boolean }
> {
  if (!request.body) return { ok: true, body: '' }

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let totalBytes = 0
  let body = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      totalBytes += value.byteLength
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, tooLarge: true }
      }
      body += decoder.decode(value, { stream: true })
    }

    body += decoder.decode()
    return { ok: true, body }
  } catch {
    return { ok: false, tooLarge: false }
  } finally {
    reader.releaseLock()
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return jsonResponse({ error: 'JSON request required' }, 415)
  }

  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      return jsonResponse({ error: 'Invalid content length' }, 400)
    }
    const declaredLength = Number(contentLength)
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      return jsonResponse({ error: 'Invalid content length' }, 400)
    }
    if (declaredLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Request body too large' }, 413)
    }
  }

  const bodyResult = await readBoundedBody(request)
  if (!bodyResult.ok) {
    return jsonResponse(
      { error: bodyResult.tooLarge ? 'Request body too large' : 'Invalid request body' },
      bodyResult.tooLarge ? 413 : 400,
    )
  }

  let body: unknown
  try {
    body = JSON.parse(bodyResult.body)
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !('locale' in body) ||
    !isSupportedLocale(body.locale)
  ) {
    return jsonResponse({ error: 'Unsupported locale' }, 400)
  }

  const response = jsonResponse({ locale: body.locale })
  response.cookies.set(LOCALE_COOKIE_NAME, body.locale, {
    httpOnly: true,
    maxAge: ONE_YEAR_IN_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  return response
}
