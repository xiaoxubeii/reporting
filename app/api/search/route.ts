import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'

import { assertRouteAccess } from '@/lib/access/gate'
import { requireBackgroundExecutionContext } from '@/lib/background-jobs/context'
import {
  claimBackgroundJobToolCall,
  completeBackgroundJobToolCall,
} from '@/lib/background-jobs/store'
import { backgroundJobSearchPolicy } from '@/lib/background-jobs/registry'
import { rateLimit } from '@/lib/rate-limit'
import {
  parseBackgroundSearchRequest,
  sanitizeBackgroundSearchResponse,
} from '@/lib/search/background-request'
import { loadSearchCategoryConfig, type SearchCategoryConfig } from '@/lib/search/categories'
import {
  parseSearchRequest,
  SearchContractError,
  type SearchFailureEnvelope,
  type SearchResponse,
  type SearchSuccessEnvelope,
} from '@/lib/search/contracts'
import {
  assertSameOriginSearchRequest,
  readSearchJson,
  SearchRequestBodyError,
} from '@/lib/search/route-input'
import { createPublicSearchRuntime, createSearchRuntime, type SearchRuntime } from '@/lib/search/runtime'
import { SearchService } from '@/lib/search/service'
import { loadSearchSourcePolicy, SEARCH_RATE_LIMIT } from '@/lib/search/source-policy'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
const ROUTE = 'api/search'
const TOOL_NAME = 'reporting_search'

export async function POST(request: Request) {
  const requestId = randomUUID()
  const startedAt = performance.now()
  try {
    // Authorization is an exclusive mode switch. If present but invalid, never
    // fall back to a browser cookie or Session.
    if (request.headers.has('authorization')) {
      return await handleBackgroundSearch(request, requestId, startedAt)
    }
    return await handleBrowserSearch(request, requestId, startedAt)
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

async function handleBrowserSearch(request: Request, requestId: string, startedAt: number) {
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
  if (limited) return rateLimited(limited, requestId)

  const parsed = parseSearchRequest(await readSearchJson(request))
  const [policy, categories] = await Promise.all([
    loadSearchSourcePolicy(admin, gate.fundId),
    loadSearchCategoryConfig(admin, gate.fundId),
  ])
  if (!categories) return failure('unavailable', 'Search categories are not configured.', 503, true, requestId)
  const runtime = await createSearchRuntime({
    admin,
    access: gate.access,
    userId: gate.userId,
    policy,
  })
  const data = await runSearch(runtime, categories, parsed, gate.fundId, gate.userId, request, requestId, startedAt)
  return success(data, requestId)
}

async function handleBackgroundSearch(request: Request, requestId: string, startedAt: number) {
  requireJsonContentType(request)
  const parsed = parseBackgroundSearchRequest(await readSearchJson(request))
  let context
  try {
    context = await requireBackgroundExecutionContext({
      authorization: request.headers.get('authorization'),
      audience: 'reporting-search',
      requiredScope: 'search:execute',
    })
  } catch {
    return failure('unauthorized', 'Authentication is required.', 401, false, requestId)
  }
  if (context.scope !== 'search:execute' || context.tokenId !== parsed.toolCallId) {
    return failure('unauthorized', 'Authentication is required.', 401, false, requestId)
  }

  const requestHash = createHash('sha256').update(JSON.stringify({ query: parsed.query })).digest('hex')
  const searchPolicy = backgroundJobSearchPolicy(context.kind)
  const claim = await claimBackgroundJobToolCall({
    jobId: context.jobId,
    attemptId: context.attemptId,
    toolName: TOOL_NAME,
    toolCallId: parsed.toolCallId,
    requestHash,
    maxCalls: searchPolicy.maxCalls,
  })
  if (claim.state === 'cached') return cachedResponse(claim.response, requestId)
  if (claim.state === 'inactive') return failure('unauthorized', 'Background attempt is no longer active.', 401, false, requestId)
  if (claim.state === 'limit') return failure('rate_limited', 'Background Search call limit reached.', 429, false, requestId)
  if (claim.state === 'in_progress') return failure('in_progress', 'This tool call is already running.', 409, true, requestId)
  if (claim.state === 'conflict') return failure('conflict', 'The tool call ID was already used for another request.', 409, false, requestId)

  const admin = createAdminClient()
  let response: NextResponse
  try {
    const rateKey = context.actor.type === 'user'
      ? `search:${context.fundId}:${context.actor.userId}`
      : `search-job:${context.jobId}:${context.attemptId}`
    const limited = await rateLimit({ key: rateKey, ...SEARCH_RATE_LIMIT, databaseFailure: 'deny' })
    if (limited) {
      response = rateLimited(limited, requestId)
    } else {
      const [sourcePolicy, categories] = await Promise.all([
        loadSearchSourcePolicy(admin, context.fundId),
        loadSearchCategoryConfig(admin, context.fundId),
      ])
      if (!categories) {
        response = failure('unavailable', 'Search categories are not configured.', 503, true, requestId)
      } else {
        const runtime = context.sourceMode === 'user'
          ? await createSearchRuntime({
            admin,
            access: context.access!,
            userId: context.actor.type === 'user' ? context.actor.userId : '',
            policy: sourcePolicy,
          })
          : await createPublicSearchRuntime({ policy: sourcePolicy })
        const categoryIds = serverCategoryIds(categories, runtime)
        const userId = context.actor.type === 'user' ? context.actor.userId : context.jobId
        const data = await runSearch(
          runtime,
          categories,
          { query: parsed.query, categoryIds },
          context.fundId,
          userId,
          request,
          requestId,
          startedAt,
        )
        response = success(sanitizeBackgroundSearchResponse(data), requestId)
      }
    }
  } catch (error) {
    if (error instanceof SearchContractError) {
      response = failure(error.code, error.message, error.status, false, requestId)
    } else {
      response = failure('search_failed', 'Search could not be completed. Try again shortly.', 500, true, requestId)
    }
  }

  const body = await response.clone().json()
  const completed = await completeBackgroundJobToolCall({
    jobId: context.jobId,
    attemptId: context.attemptId,
    toolName: TOOL_NAME,
    toolCallId: parsed.toolCallId,
    requestHash,
    response: { httpStatus: response.status, body },
    isError: response.status >= 400,
  })
  if (!completed) return failure('conflict', 'Background attempt changed before Search completed.', 409, true, requestId)
  return response
}

async function runSearch(
  runtime: SearchRuntime,
  categories: SearchCategoryConfig,
  parsed: { readonly query: string; readonly categoryIds: readonly string[] },
  fundId: string,
  userId: string,
  request: Request,
  requestId: string,
  startedAt: number,
): Promise<SearchResponse> {
  const metricSink = (metric: { readonly source: string; readonly outcome: string; readonly resultCount: number; readonly durationMs: number }) => {
    console.info('[search] source completed', { requestId, ...metric })
  }
  const service = new SearchService({ categories, registry: runtime.registry, metricSink })
  const data = await service.search(parsed, { fundId, userId, signal: request.signal })
  recordSearchMetric(requestId, startedAt, data.sources.map(source => ({
    source: source.id,
    outcome: source.status,
    count: source.resultCount,
  })))
  return data
}

function serverCategoryIds(categories: SearchCategoryConfig, runtime: SearchRuntime): readonly string[] {
  const ids = categories.categories
    .filter(category => category.enabled && category.adapterIds.some(id => runtime.runnableAdapterIds.has(id)))
    .map(category => category.id)
  if (ids.length === 0) throw new SearchContractError('No server-approved Search categories are available.')
  return Object.freeze(ids)
}

function requireJsonContentType(request: Request): void {
  const contentType = request.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') throw new SearchRequestBodyError('A JSON request is required.', 415)
}

function cachedResponse(value: unknown, requestId: string): NextResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return failure('conflict', 'Cached Search response is invalid.', 409, false, requestId)
  }
  const cached = value as { httpStatus?: unknown; body?: unknown }
  if (!Number.isInteger(cached.httpStatus) || Number(cached.httpStatus) < 200 || Number(cached.httpStatus) > 599) {
    return failure('conflict', 'Cached Search response is invalid.', 409, false, requestId)
  }
  return NextResponse.json(cached.body, {
    status: Number(cached.httpStatus),
    headers: { 'X-Request-Id': requestId, 'Cache-Control': 'no-store', 'X-Background-Cache': 'hit' },
  })
}

function success(data: SearchResponse, requestId: string) {
  const body: SearchSuccessEnvelope = { success: true, data, error: null }
  return NextResponse.json(body, { headers: { 'X-Request-Id': requestId, 'Cache-Control': 'no-store' } })
}

function failure(code: string, message: string, status: number, retryable: boolean, requestId: string) {
  const body: SearchFailureEnvelope = { success: false, data: null, error: { code, message, retryable } }
  return NextResponse.json(body, { status, headers: { 'X-Request-Id': requestId, 'Cache-Control': 'no-store' } })
}

function rateLimited(limited: NextResponse, requestId: string) {
  const response = failure('rate_limited', 'Too many searches. Please retry shortly.', 429, true, requestId)
  response.headers.set('Retry-After', limited.headers.get('Retry-After') ?? String(SEARCH_RATE_LIMIT.windowSeconds))
  return response
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
