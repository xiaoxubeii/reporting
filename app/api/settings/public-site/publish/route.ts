import { NextResponse, type NextRequest } from 'next/server'
import { requireFundPublicSiteAdmin } from '@/lib/fund-public-site/admin'
import { FundPublicSiteConflictError, publishFundPublicSite } from '@/lib/fund-public-site/store'
import {
  assertSameOriginFundPublicSiteMutation,
  FundPublicSiteRequestError,
  readFundPublicSiteJson,
} from '@/lib/fund-public-site/request'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function POST(request: NextRequest) {
  try {
    assertSameOriginFundPublicSiteMutation(request)
  } catch (error) {
    return requestFailure(error)
  }
  const context = await requireFundPublicSiteAdmin(request)
  if (context instanceof NextResponse) return noStore(context)
  let body: unknown
  try {
    body = await readFundPublicSiteJson(request)
  } catch (error) {
    return requestFailure(error)
  }
  if (!isExpectedRevision(body)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: NO_STORE })
  }
  try {
    const site = await publishFundPublicSite(
      context.admin,
      context.fundId,
      context.userId,
      body.expectedDraftRevision,
      body.expectedLifecycleRevision,
    )
    return NextResponse.json({ site }, { headers: NO_STORE })
  } catch (error) {
    if (error instanceof FundPublicSiteConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409, headers: NO_STORE })
    }
    console.error('[fund-public-site] publish failed', error)
    return NextResponse.json({ error: 'Unable to publish public site' }, { status: 500, headers: NO_STORE })
  }
}

function isExpectedRevision(value: unknown): value is { expectedDraftRevision: number; expectedLifecycleRevision: number } {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value as object).length === 2
    && Number.isSafeInteger((value as { expectedDraftRevision?: unknown }).expectedDraftRevision)
    && Number((value as { expectedDraftRevision: number }).expectedDraftRevision) > 0
    && Number.isSafeInteger((value as { expectedLifecycleRevision?: unknown }).expectedLifecycleRevision)
    && Number((value as { expectedLifecycleRevision: number }).expectedLifecycleRevision) > 0
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', NO_STORE['Cache-Control'])
  return response
}

function requestFailure(error: unknown): NextResponse {
  if (error instanceof FundPublicSiteRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE })
  }
  return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: NO_STORE })
}
