import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdminAccess } from '@/lib/api-helpers'
import { fundMatchesTrustedRequestTenant } from '@/lib/tenancy/request'
import { resendFundInvitation, revokeFundInvitation } from '@/lib/identity/invitations'
import { identityErrorResponse } from '@/lib/identity/http'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

async function authority() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient()
  const gate = await assertAdminAccess(admin, user.id)
  if (gate instanceof NextResponse) return { response: gate }
  if (!(await fundMatchesTrustedRequestTenant(admin as never, new Headers(headers()), gate.fundId))) {
    return { response: NextResponse.json({ error: 'Fund not found' }, { status: 404 }) }
  }
  return { admin, user, fundId: gate.fundId }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const context = await authority()
  if ('response' in context) return context.response
  const limited = await rateLimit({
    key: `fund-invite-resend:${context.fundId}:${context.user.id}:${getClientIp(req)}`,
    limit: 20,
    windowSeconds: 3600,
    databaseFailure: 'deny',
  })
  if (limited) return limited
  try {
    const invitation = await resendFundInvitation(context.admin, {
      fundId: context.fundId,
      invitationId: params.id,
      actorUserId: context.user.id,
      locale: req.cookies.get('locale')?.value === 'zh-CN' ? 'zh-CN' : 'en',
    })
    return NextResponse.json({ invitation })
  } catch (error) {
    return identityErrorResponse(error, 'settings-invitations-resend')
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const context = await authority()
  if ('response' in context) return context.response
  try {
    await revokeFundInvitation(context.admin, {
      fundId: context.fundId,
      invitationId: params.id,
      actorUserId: context.user.id,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return identityErrorResponse(error, 'settings-invitations-revoke')
  }
}
