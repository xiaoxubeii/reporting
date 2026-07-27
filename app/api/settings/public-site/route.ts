import { NextResponse, type NextRequest } from 'next/server'
import { FundPublicSiteValidationError, parseFundPublicSiteContent } from '@/lib/fund-public-site/content'
import { requireFundPublicSiteAdmin } from '@/lib/fund-public-site/admin'
import {
  FundPublicSiteConflictError,
  getOrCreateFundPublicSiteDraft,
  saveFundPublicSiteDraft,
} from '@/lib/fund-public-site/store'
import { isFundPublicSiteTemplate } from '@/lib/fund-public-site/templates'
import {
  assertSameOriginFundPublicSiteMutation,
  FundPublicSiteRequestError,
  readFundPublicSiteJson,
} from '@/lib/fund-public-site/request'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(request: NextRequest) {
  const context = await requireFundPublicSiteAdmin(request)
  if (context instanceof NextResponse) return withNoStore(context)
  try {
    const site = await getOrCreateFundPublicSiteDraft(
      context.admin,
      context.fundId,
      context.fundName,
      context.userId,
    )
    return NextResponse.json({ site, fund: { name: context.fundName, slug: context.tenantSlug } }, { headers: NO_STORE })
  } catch (error) {
    console.error('[fund-public-site] GET failed', error)
    return NextResponse.json({ error: 'Unable to load public site' }, { status: 500, headers: NO_STORE })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOriginFundPublicSiteMutation(request)
  } catch (error) {
    return requestFailure(error)
  }
  const context = await requireFundPublicSiteAdmin(request)
  if (context instanceof NextResponse) return withNoStore(context)

  let body: unknown
  try {
    body = await readFundPublicSiteJson(request)
  } catch (error) {
    return requestFailure(error)
  }
  if (!isRecord(body) || !hasExactKeys(body, ['expectedRevision', 'templateKey', 'content'])) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: NO_STORE })
  }
  if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) {
    return NextResponse.json({ error: 'Invalid draft revision' }, { status: 400, headers: NO_STORE })
  }
  if (!isFundPublicSiteTemplate(body.templateKey)) {
    return NextResponse.json({ error: 'Unsupported template' }, { status: 400, headers: NO_STORE })
  }

  try {
    const content = parseFundPublicSiteContent(body.content)
    const site = await saveFundPublicSiteDraft(context.admin, {
      fundId: context.fundId,
      userId: context.userId,
      expectedRevision: Number(body.expectedRevision),
      templateKey: body.templateKey,
      content,
    })
    return NextResponse.json({ site }, { headers: NO_STORE })
  } catch (error) {
    if (error instanceof FundPublicSiteValidationError) {
      return NextResponse.json({ error: 'Invalid public site content', issues: error.issues }, { status: 400, headers: NO_STORE })
    }
    if (error instanceof FundPublicSiteConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409, headers: NO_STORE })
    }
    console.error('[fund-public-site] PATCH failed', error)
    return NextResponse.json({ error: 'Unable to save public site' }, { status: 500, headers: NO_STORE })
  }
}

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', NO_STORE['Cache-Control'])
  return response
}

function requestFailure(error: unknown): NextResponse {
  if (error instanceof FundPublicSiteRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE })
  }
  return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: NO_STORE })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort()
  return keys.length === expected.length && [...expected].sort().every((key, index) => key === keys[index])
}
