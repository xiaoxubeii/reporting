import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { acceptFundInvitation, resolveFundInvitationAcceptanceContext } from '@/lib/identity/invitations'
import { identityErrorResponse, readIdentityJson } from '@/lib/identity/http'
import { canonicalFundOriginForId } from '@/lib/tenancy/links'
import { classifyFundRequestHost, fundWorkspaceEnvironmentForRequest } from '@/lib/tenancy/host'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { FeedApiError } from '@/lib/feeds/errors'
import { feedFailure } from '@/lib/feeds/envelope'

export async function POST(req: NextRequest) {
  const limited = await rateLimit({
    key: `fund-invite-accept:${getClientIp(req)}`,
    limit: 10,
    windowSeconds: 300,
    databaseFailure: 'deny',
  })
  if (limited) return limited
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const admin = createAdminClient()
  try {
    const body = await readIdentityJson(req)
    const rawToken = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).token
      : null
    const invitation = await resolveFundInvitationAcceptanceContext(admin, rawToken)
    if (!invitation) return unavailable()
    const host = classifyFundRequestHost(req)
    if (host.mode === 'tenant' && host.slug !== invitation.fundSlug) return unavailable()
    if (process.env.FUND_WORKSPACE_ROOT_DOMAIN?.trim() && host.mode !== 'tenant') return unavailable()
    const accepted = await acceptFundInvitation(admin, { rawToken, userId: user.id })
    return NextResponse.json({
      ok: true,
      role: accepted.role,
      canonicalOrigin: await canonicalFundOriginForId(
        admin as never,
        accepted.fundId,
        fundWorkspaceEnvironmentForRequest(req),
      ),
    }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
  } catch (error) {
    if (error instanceof FeedApiError) return feedFailure(error)
    return identityErrorResponse(error, 'fund-invitation-accept')
  }
}

function unavailable(): NextResponse {
  return NextResponse.json(
    { error: 'This invitation is invalid or expired.', code: 'invitation_unavailable' },
    { status: 404, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
  )
}
