import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { getTrustedRequestTenant } from '@/lib/tenancy/request'
import { normalizeExternalInvitationEmail } from '@/lib/identity/invitations'
import { identityErrorResponse, readIdentityJson } from '@/lib/identity/http'

export async function POST(req: NextRequest) {
  const limited = await rateLimit({ key: `signup:${getClientIp(req)}`, limit: 5, windowSeconds: 300, databaseFailure: 'deny' })
  if (limited) return limited

  let body: unknown
  try {
    body = await readIdentityJson(req)
  } catch (error) {
    return identityErrorResponse(error, 'auth-signup')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const { email, password, acceptedLicense } = body as Record<string, unknown>

  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }
  if (acceptedLicense !== true) {
    return NextResponse.json({ error: 'You must accept the license agreement.' }, { status: 400 })
  }

  let normalizedEmail: string
  try {
    normalizedEmail = normalizeExternalInvitationEmail(email)
  } catch {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
  }
  const domain = normalizedEmail.split('@')[1]
  if (!domain) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Server-side whitelist check
  const tenant = await getTrustedRequestTenant(admin as never, new Headers(headers()))
  let invitationQuery = admin
    .from('fund_member_invitations')
    .select('id')
    .eq('email_normalized', normalizedEmail)
    .not('delivery_confirmed_at', 'is', null)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .is('replaced_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
  if (tenant) invitationQuery = invitationQuery.eq('fund_id', tenant.id)

  const [{ data: allowed }, { data: invitation }] = await Promise.all([
    admin
      .from('allowed_signups')
      .select('id')
      .in('email_pattern', [normalizedEmail, `*@${domain}`])
      .limit(1)
      .maybeSingle(),
    invitationQuery.maybeSingle(),
  ])

  if (!allowed && !invitation) {
    return NextResponse.json({
      error: 'not_whitelisted',
    }, { status: 403 })
  }

  // Whitelist passed — tell the client to proceed with signUp
  return NextResponse.json({ ok: true })
}
