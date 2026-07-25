import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { assertRouteAccess } from '@/lib/access/gate'
import { rateLimit } from '@/lib/rate-limit'
import { parseSearchRequest, SearchContractError, type SearchFailureEnvelope, type SearchSuccessEnvelope } from '@/lib/search/contracts'
import { loadSearchCategoryConfig } from '@/lib/search/categories'
import { assertSameOriginSearchRequest, readSearchJson, SearchRequestBodyError } from '@/lib/search/route-input'
import { createSearchRuntime } from '@/lib/search/runtime'
import { SearchService } from '@/lib/search/service'
import { loadSearchSourcePolicy, SEARCH_RATE_LIMIT } from '@/lib/search/source-policy'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
const ROUTE = 'api/search'

export async function POST(request: Request) {
  const requestId = randomUUID()
  const startedAt = performance.now()
  try {
    assertSameOriginSearchRequest(request)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return failure('unauthorized', 'Authentication is required.', 401, false, requestId)

    const admin = createAdminClient()
    const gate = await assertRouteAccess(admin, user.id, ROUTE, 'POST')
    if (gate instanceof NextResponse) {
      return failure('forbidden', 'You do not have access to Search.', 403, false, requestId)
    }
    const limited = await rateLimit({
      key: `search:${gate.fundId}:${gate.userId}`,
      ...SEARCH_RATE_LIMIT,
      databaseFailure: 'deny',
    })
    if (limited) {
      const response = failure('rate_limited', 'Too many searches. Please retry shortly.', 429, true, requestId)
      response.headers.set('Retry-After', limited.headers.get('Retry-After') ?? String(SEARCH_RATE_LIMIT.windowSeconds))
      return response
    }

    const parsed = parseSearchRequest(await readSearchJson(request))
    const [policy, categories] = await Promise.all([
      loadSearchSourcePolicy(admin, gate.fundId),
      loadSearchCategoryConfig(admin, gate.fundId),
    ])
    if (!categories) return failure('unavailable', 'Search categories are not configured.', 503, true, requestId)
    const metricSink = (metric: { readonly source: string; readonly outcome: string; readonly resultCount: number; readonly durationMs: number }) => {
      console.info('[search] source completed', { requestId, ...metric })
    }
    const runtime = await createSearchRuntime({
      admin,
      access: gate.access,
      userId: gate.userId,
      policy,
    })
    const service = new SearchService({
      categories,
      registry: runtime.registry,
      metricSink,
    })
    const data = await service.search(parsed, {
      fundId: gate.fundId,
      userId: gate.userId,
      signal: request.signal,
    })
    recordSearchMetric(requestId, startedAt, data.sources.map(source => ({
      source: source.id,
      outcome: source.status,
      count: source.resultCount,
    })))
    const body: SearchSuccessEnvelope = { success: true, data, error: null }
    return NextResponse.json(body, { headers: { 'X-Request-Id': requestId, 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof SearchRequestBodyError) {
      return failure(error.status === 403 ? 'forbidden' : 'invalid_request', error.message, error.status, false, requestId)
    }
    if (error instanceof SearchContractError) {
      return failure(error.code, error.message, error.status, false, requestId)
    }
    console.error('[search] request failed', { requestId, durationMs: Math.round(performance.now() - startedAt) })
    return failure('search_failed', 'Search could not be completed. Try again shortly.', 500, true, requestId)
  }
}

function failure(code: string, message: string, status: number, retryable: boolean, requestId: string) {
  const body: SearchFailureEnvelope = { success: false, data: null, error: { code, message, retryable } }
  return NextResponse.json(body, { status, headers: { 'X-Request-Id': requestId, 'Cache-Control': 'no-store' } })
}

function recordSearchMetric(
  requestId: string,
  startedAt: number,
  sources: readonly { readonly source: string; readonly outcome: string; readonly count: number }[],
) {
  console.info('[search] completed', {
    requestId,
    durationMs: Math.round(performance.now() - startedAt),
    sources,
  })
}
