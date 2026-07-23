import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertRouteAccess, type GateResult } from '@/lib/access/gate'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { feedFailure } from './envelope'
import { FeedApiError } from './errors'
import { rateLimit } from '@/lib/rate-limit'

export interface FeedRouteContext {
  admin: SupabaseClient
  gate: GateResult
}

export async function requireFeedRoute(routeKey: string, method: string): Promise<FeedRouteContext | NextResponse> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return feedFailure(new FeedApiError('unauthorized', 401, 'Authentication is required.'))
  const admin = createAdminClient()
  const gate = await assertRouteAccess(admin, user.id, routeKey, method)
  if (gate instanceof NextResponse) {
    return feedFailure(new FeedApiError('forbidden', gate.status, gate.status === 401
      ? 'Authentication is required.'
      : 'You do not have access to feeds.'))
  }
  if (!isFeedMutationAllowed(gate.role, method)) {
    return feedFailure(new FeedApiError('forbidden', 403, 'This is a read-only demo. Changes are not allowed.'))
  }
  return { admin, gate }
}

export function isFeedMutationAllowed(role: string, method: string): boolean {
  const normalized = method.toUpperCase()
  return normalized === 'GET' || normalized === 'HEAD' || role !== 'viewer'
}

export function assertSameOriginMutation(request: Request): void {
  const requestUrl = new URL(request.url)
  const expectedOrigins = new Set([requestUrl.origin])
  const host = request.headers.get('Host')?.trim()
  if (host) {
    try {
      expectedOrigins.add(new URL(`${requestUrl.protocol}//${host}`).origin)
    } catch {
      throw new FeedApiError('forbidden', 403, 'Cross-origin feed changes are not allowed.')
    }
  }
  const origin = request.headers.get('Origin')
  const referer = request.headers.get('Referer')
  const fetchSite = request.headers.get('Sec-Fetch-Site')
  let suppliedOrigin = origin
  if (!suppliedOrigin && referer) {
    try {
      suppliedOrigin = new URL(referer).origin
    } catch {
      suppliedOrigin = null
    }
  }
  if (!suppliedOrigin || !expectedOrigins.has(suppliedOrigin) || (fetchSite && fetchSite !== 'same-origin')) {
    throw new FeedApiError('forbidden', 403, 'Cross-origin feed changes are not allowed.')
  }
  const contentType = request.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new FeedApiError('invalid_request', 415, 'A JSON request is required.')
  }
}

const MAX_FEEDS_JSON_BYTES = 16 * 1024

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await readLimitedJson(request, MAX_FEEDS_JSON_BYTES)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid')
    return value as Record<string, unknown>
  } catch {
    throw new FeedApiError('invalid_request', 400, 'A valid JSON request body is required.')
  }
}

async function readLimitedJson(request: Request, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    if (request.body) await request.body.cancel().catch(() => undefined)
    throw new Error('request body too large')
  }

  if (!request.body || typeof request.body.getReader !== 'function') {
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('request body too large')
    return JSON.parse(text)
  }

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let totalBytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error('request body too large')
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return JSON.parse(text)
  } finally {
    reader.releaseLock()
  }
}

export async function limitFeedAction(
  context: FeedRouteContext,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<NextResponse | null> {
  const limited = await rateLimit({
    key: `feeds:${action}:${context.gate.fundId}:${context.gate.userId}`,
    limit,
    windowSeconds,
  })
  if (!limited) return null
  const response = feedFailure(new FeedApiError('rate_limited', 429, 'Too many feed requests. Please retry shortly.'))
  const retryAfter = limited.headers.get('Retry-After')
  if (retryAfter) response.headers.set('Retry-After', retryAfter)
  return response
}
