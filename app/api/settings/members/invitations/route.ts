import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdminAccess } from '@/lib/api-helpers'
import { fundMatchesTrustedRequestTenant } from '@/lib/tenancy/request'
import { createFundInvitation, listFundInvitations } from '@/lib/identity/invitations'
import { identityErrorResponse, readIdentityJson } from '@/lib/identity/http'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

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

export async function GET() {
  const context = await authority()
  if ('response' in context) return context.response
  try {
    return NextResponse.json({ invitations: await listFundInvitations(context.admin, context.fundId) })
  } catch (error) {
    return identityErrorResponse(error, 'settings-invitations-list')
  }
}

export async function POST(req: NextRequest) {
  const context = await authority()
  if ('response' in context) return context.response
  const limited = await rateLimit({
    key: `fund-invite:${context.fundId}:${context.user.id}:${getClientIp(req)}`,
    limit: 20,
    windowSeconds: 3600,
    databaseFailure: 'deny',
  })
  if (limited) return limited
  try {
    const body = await readIdentityJson(req)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const invitation = await createFundInvitation(context.admin, {
      fundId: context.fundId,
      actorUserId: context.user.id,
      email: (body as Record<string, unknown>).email,
      role: (body as Record<string, unknown>).role,
      locale: requestLocale(req),
    })
    return NextResponse.json({ invitation }, { status: 201 })
  } catch (error) {
    return identityErrorResponse(error, 'settings-invitations-create')
  }
}

function requestLocale(req: NextRequest): 'en' | 'zh-CN' {
  return req.cookies.get('locale')?.value === 'zh-CN' ? 'zh-CN' : 'en'
}
