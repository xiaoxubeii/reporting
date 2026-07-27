import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTrustedRequestTenant } from '@/lib/tenancy/request'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { bootstrapFundIdentity } from '@/lib/identity/fund-bootstrap'
import { identityErrorResponse, readIdentityJson } from '@/lib/identity/http'
import { canonicalFundOriginForId } from '@/lib/tenancy/links'
import { fundWorkspaceEnvironmentForRequest } from '@/lib/tenancy/host'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const tenant = await getTrustedRequestTenant(admin as never, new Headers(headers()))
  const { data: membership, error } = await admin
    .from('fund_members')
    .select('fund_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Identity service is temporarily unavailable.' }, { status: 503 })
  if (!membership) return NextResponse.json({ state: 'create', fundId: null })
  if (tenant && tenant.id !== membership.fund_id) {
    return NextResponse.json({ error: 'Fund not found' }, { status: 404 })
  }
  return NextResponse.json({
    state: 'created',
    fundId: membership.fund_id,
    canonicalOrigin: await canonicalFundOriginForId(
      admin as never,
      membership.fund_id,
      fundWorkspaceEnvironmentForRequest(req),
    ),
  })
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit({
    key: `onboard-fund:${getClientIp(req)}`,
    limit: 5,
    windowSeconds: 300,
    databaseFailure: 'deny',
  })
  if (limited) return limited

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (await getTrustedRequestTenant(admin as never, new Headers(headers()))) {
    return NextResponse.json({ error: 'Fund creation is unavailable on a Fund workspace' }, { status: 404 })
  }

  try {
    const body = await readIdentityJson(req)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const result = await bootstrapFundIdentity(
      admin,
      {
        actorUserId: user.id,
        fundName: (body as Record<string, unknown>).fundName,
        slug: (body as Record<string, unknown>).slug,
        claudeApiKey: (body as Record<string, unknown>).claudeApiKey,
      },
      fundWorkspaceEnvironmentForRequest(req),
    )
    return NextResponse.json(result)
  } catch (error) {
    return identityErrorResponse(error, 'onboarding-fund')
  }
}
