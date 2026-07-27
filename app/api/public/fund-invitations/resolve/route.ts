import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveFundInvitation } from '@/lib/identity/invitations'
import { identityErrorResponse, readIdentityJson } from '@/lib/identity/http'
import { classifyFundRequestHost } from '@/lib/tenancy/host'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const limited = await rateLimit({
    key: `fund-invite-resolve:${getClientIp(req)}`,
    limit: 30,
    windowSeconds: 300,
    databaseFailure: 'deny',
  })
  if (limited) return limited
  try {
    const body = await readIdentityJson(req)
    const rawToken = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).token
      : null
    const invitation = await resolveFundInvitation(createAdminClient(), rawToken)
    if (!invitation) return unavailable()
    const host = classifyFundRequestHost(req)
    if (host.mode === 'tenant' && host.slug !== invitation.fundSlug) return unavailable()
    if (process.env.FUND_WORKSPACE_ROOT_DOMAIN?.trim() && host.mode !== 'tenant') return unavailable()
    return NextResponse.json({ invitation }, {
      headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    })
  } catch (error) {
    return identityErrorResponse(error, 'fund-invitation-resolve')
  }
}

function unavailable(): NextResponse {
  return NextResponse.json(
    { error: 'This invitation is invalid or expired.', code: 'invitation_unavailable' },
    { status: 404, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
  )
}
