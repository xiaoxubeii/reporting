import { NextRequest, NextResponse } from 'next/server'
import { isAuthSessionMissingError } from '@supabase/auth-js'
import {
  canonicalizeTimeZone,
  parseTimeZoneCookie,
  serializeTimeZoneCookie,
  TIME_ZONE_COOKIE_NAME,
  type TimeZoneMode,
} from '@/i18n/time-zone'
import { loadPersonalProfile } from '@/lib/identity/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { canonicalFundRequestOrigin } from '@/lib/tenancy/host'

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365
const MAX_BODY_BYTES = 256

type PreferenceResponse = Readonly<{
  mode: TimeZoneMode
  timeZone: string
  changed: boolean
}>

function jsonResponse(body: object, status = 200) {
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

function getRequestAuthority(request: NextRequest): string | null {
  const rawAuthority = request.headers.get('host') ?? request.nextUrl.host
  if (
    !rawAuthority ||
    rawAuthority !== rawAuthority.trim() ||
    /[\s,\\/@]/.test(rawAuthority) ||
    rawAuthority.includes('://')
  ) {
    return null
  }

  try {
    const parsed = new URL(`${request.nextUrl.protocol}//${rawAuthority}`)
    return parsed.host.toLowerCase() === rawAuthority.toLowerCase()
      ? parsed.host.toLowerCase()
      : null
  } catch {
    return null
  }
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false

  const requestOrigin = getHttpOrigin(origin)
  if (!requestOrigin) return false

  if (process.env.FUND_WORKSPACE_ROOT_DOMAIN?.trim()) {
    try {
      return requestOrigin === canonicalFundRequestOrigin(request)
    } catch {
      return false
    }
  }

  const requestAuthority = getRequestAuthority(request)
  if (!requestAuthority) return false

  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configuredSiteUrl) {
    const configuredOrigin = getHttpOrigin(configuredSiteUrl)
    if (!configuredOrigin) return false
    const configuredAuthority = new URL(configuredOrigin).host.toLowerCase()
    return requestAuthority === configuredAuthority && requestOrigin === configuredOrigin
  }

  if (process.env.NODE_ENV === 'production') return false

  const originUrl = new URL(requestOrigin)
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
  return (
    loopbackHosts.has(originUrl.hostname) &&
    originUrl.host.toLowerCase() === requestAuthority &&
    originUrl.protocol === request.nextUrl.protocol
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

async function readPreferenceBody(request: NextRequest): Promise<
  { ok: true; mode: TimeZoneMode; timeZone: string } | { ok: false; response: NextResponse }
> {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return { ok: false, response: jsonResponse({ error: 'JSON request required' }, 415) }
  }

  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      return { ok: false, response: jsonResponse({ error: 'Invalid content length' }, 400) }
    }
    const declaredLength = Number(contentLength)
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      return { ok: false, response: jsonResponse({ error: 'Invalid content length' }, 400) }
    }
    if (declaredLength > MAX_BODY_BYTES) {
      return { ok: false, response: jsonResponse({ error: 'Request body too large' }, 413) }
    }
  }

  const bodyResult = await readBoundedBody(request)
  if (!bodyResult.ok) {
    return {
      ok: false,
      response: jsonResponse(
        { error: bodyResult.tooLarge ? 'Request body too large' : 'Invalid request body' },
        bodyResult.tooLarge ? 413 : 400,
      ),
    }
  }

  let body: unknown
  try {
    body = JSON.parse(bodyResult.body)
  } catch {
    return { ok: false, response: jsonResponse({ error: 'Invalid JSON' }, 400) }
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 2 ||
    !Object.hasOwn(body, 'mode') ||
    !Object.hasOwn(body, 'timeZone')
  ) {
    return { ok: false, response: jsonResponse({ error: 'Invalid time zone preference' }, 400) }
  }

  const input = body as Record<string, unknown>
  if (input.mode !== 'auto' && input.mode !== 'manual') {
    return { ok: false, response: jsonResponse({ error: 'Invalid time zone preference' }, 400) }
  }
  const timeZone = canonicalizeTimeZone(input.timeZone)
  if (timeZone === null) {
    return { ok: false, response: jsonResponse({ error: 'Invalid time zone preference' }, 400) }
  }

  return { ok: true, mode: input.mode, timeZone }
}

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error && !isAuthSessionMissingError(error)) throw new Error('Authentication unavailable')
    if (!user) return jsonResponse({ manualTimeZone: null })

    const profile = await loadPersonalProfile(createAdminClient(), user.id)
    return jsonResponse({ manualTimeZone: profile.timeZone })
  } catch {
    return jsonResponse({ error: 'Unable to load time zone preference' }, 500)
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const input = await readPreferenceBody(request)
  if (!input.ok) return input.response

  if (input.mode === 'manual') {
    try {
      const supabase = createClient()
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error && !isAuthSessionMissingError(error)) throw new Error('Authentication unavailable')
      if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)
    } catch {
      return jsonResponse({ error: 'Unable to update time zone preference' }, 500)
    }
  }

  const cookieValue = serializeTimeZoneCookie(input.mode, input.timeZone)
  const currentPreference = parseTimeZoneCookie(request.cookies.get(TIME_ZONE_COOKIE_NAME)?.value)
  const changed = (
    currentPreference?.mode !== input.mode ||
    currentPreference.timeZone !== input.timeZone
  )
  const body: PreferenceResponse = Object.freeze({
    mode: input.mode,
    timeZone: input.timeZone,
    changed,
  })
  const response = jsonResponse(body)

  if (changed) {
    response.cookies.set(TIME_ZONE_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      maxAge: ONE_YEAR_IN_SECONDS,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  }

  return response
}
