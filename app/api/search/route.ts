import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { assertRouteAccess } from '@/lib/access/gate'
import { hasAccess } from '@/lib/access/effective'
import { FeedService } from '@/lib/feeds/service'
import { rateLimit } from '@/lib/rate-limit'
import { parseSearchRequest, SearchContractError, type SearchFailureEnvelope, type SearchSuccessEnvelope } from '@/lib/search/contracts'
import { MinifluxFeedSearchProvider } from '@/lib/search/providers/feed'
import { DirectSpecializedSearchProvider } from '@/lib/search/providers/specialized'
import { SearxngWebSearchProvider } from '@/lib/search/providers/web'
import { assertSameOriginSearchRequest, readSearchJson, SearchRequestBodyError } from '@/lib/search/route-input'
import { configuredSearxngUrl } from '@/lib/search/searxng/config'
import { instrumentFeedProvider, instrumentSpecializedProvider, instrumentWebProvider } from '@/lib/search/instrumentation'
import { SearchService } from '@/lib/search/service'
import { loadSearchSourcePolicy, SEARCH_RATE_LIMIT } from '@/lib/search/source-policy'
import { ClinicalTrialsApiAdapter } from '@/lib/search/specialized/adapters/clinical-trials'
import { Fda510kApiAdapter } from '@/lib/search/specialized/adapters/fda-510k'
import { MassDeviceWebsiteAdapter } from '@/lib/search/specialized/adapters/massdevice'
import { PubMedApiAdapter } from '@/lib/search/specialized/adapters/pubmed'
import { TctmdWebsiteAdapter } from '@/lib/search/specialized/adapters/tctmd'
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
    const policy = await loadSearchSourcePolicy(admin, gate.fundId)
    const searxngUrl = policy.web ? safeSearxngUrl() : null
    const canSearchFeeds = hasAccess(gate.access, 'dealflow', 'read', 'feeds')
    const specializedProvider = new DirectSpecializedSearchProvider([
      new PubMedApiAdapter(),
      new ClinicalTrialsApiAdapter(),
      new Fda510kApiAdapter(),
      new TctmdWebsiteAdapter(),
      new MassDeviceWebsiteAdapter(),
    ], () => policy)
    const metricSink = (metric: { readonly source: string; readonly outcome: string; readonly resultCount: number; readonly durationMs: number }) => {
      console.info('[search] source completed', { requestId, ...metric })
    }
    const service = new SearchService({
      ...(canSearchFeeds ? { feedProvider: instrumentFeedProvider(new MinifluxFeedSearchProvider(new FeedService(admin)), metricSink) } : {}),
      ...(searxngUrl ? { webProvider: instrumentWebProvider(new SearxngWebSearchProvider(searxngUrl), metricSink) } : {}),
      specializedProvider: instrumentSpecializedProvider(specializedProvider, metricSink),
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

function safeSearxngUrl(): string | null {
  try { return configuredSearxngUrl() } catch { return null }
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
