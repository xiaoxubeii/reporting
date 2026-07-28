import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { isAuthSessionMissingError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadPersonalProfile, savePersonalProfile, savePersonalTimeZone } from '@/lib/identity/profile'
import { identityErrorResponse, readIdentityJson } from '@/lib/identity/http'
import { getTrustedRequestTenant } from '@/lib/tenancy/request'
import { setCurrentUserMailbox } from '@/lib/email/mailboxes'
import { deriveFundEmailDomain } from '@/lib/email/domain'
import { FundEmailError } from '@/lib/email/errors'
import { isTrustedRequestHost, isTrustedSameOriginRequest } from '@/lib/http/trusted-origin'

export const dynamic = 'force-dynamic'

async function currentUser() {
  const { data: { user }, error } = await createClient().auth.getUser()
  if (error && !isAuthSessionMissingError(error)) throw new Error('Authentication unavailable')
  return user
}

export async function GET(request: NextRequest) {
  if (!isTrustedRequestHost(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const admin = createAdminClient()
    const [profile, membershipResult] = await Promise.all([
      loadPersonalProfile(admin, user.id),
      admin.from('fund_members').select('fund_id,role').eq('user_id', user.id).maybeSingle(),
    ])
    if (membershipResult.error) throw new Error('membership lookup failed')
    const membership = membershipResult.data
    if (!membership) {
      return NextResponse.json({
        externalEmail: user.email ?? null,
        profile,
        currentFund: null,
        mailbox: null,
      })
    }

    const tenant = await getTrustedRequestTenant(admin as never, new Headers(headers()))
    if (tenant && tenant.id !== membership.fund_id) {
      return NextResponse.json({ error: 'Fund not found' }, { status: 404 })
    }
    const [fundResult, mailboxResult] = await Promise.all([
      admin.from('funds').select('id,name,slug,email_subdomain').eq('id', membership.fund_id).single(),
      admin.from('fund_email_mailboxes')
        .select('local_part,display_name,active,claimed_at')
        .eq('fund_id', membership.fund_id)
        .eq('claimed_by_user_id', user.id)
        .eq('kind', 'user')
        .maybeSingle(),
    ])
    if (fundResult.error || !fundResult.data || mailboxResult.error) throw new Error('personal state lookup failed')
    const fund = fundResult.data
    const domain = fund.email_subdomain ? deriveFundEmailDomain(fund.email_subdomain) : null
    const mailbox = mailboxResult.data
    return NextResponse.json({
      externalEmail: user.email ?? null,
      profile,
      currentFund: {
        id: fund.id,
        name: fund.name,
        slug: fund.slug,
        emailDomain: domain,
        role: membership.role,
      },
      mailbox: mailbox ? {
        localPart: mailbox.local_part,
        address: domain ? `${mailbox.local_part}@${domain}` : null,
        displayName: mailbox.display_name,
        active: mailbox.active,
        claimedAt: mailbox.claimed_at,
      } : null,
    })
  } catch (error) {
    return identityErrorResponse(error, 'settings-personal-read')
  }
}

export async function PATCH(req: NextRequest) {
  if (!isTrustedSameOriginRequest(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const admin = createAdminClient()
    const body = await readIdentityJson(req)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const input = body as Record<string, unknown>
    const hasName = Object.hasOwn(input, 'fullName')
    const hasMailbox = Object.hasOwn(input, 'mailboxLocalPart')
    const hasTimeZone = Object.hasOwn(input, 'timeZone')
    if (Object.keys(input).length !== 1 || Number(hasName) + Number(hasMailbox) + Number(hasTimeZone) !== 1) {
      return NextResponse.json({ error: 'Update one personal setting at a time.' }, { status: 400 })
    }
    if (hasName) {
      const profile = await savePersonalProfile(admin, { userId: user.id, fullName: input.fullName })
      return NextResponse.json({ profile })
    }
    if (hasTimeZone) {
      const profile = await savePersonalTimeZone(admin, { userId: user.id, timeZone: input.timeZone })
      return NextResponse.json({ profile })
    }

    const { data: membership, error: membershipError } = await admin
      .from('fund_members')
      .select('fund_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (membershipError) throw new Error('membership lookup failed')
    if (!membership) return NextResponse.json({ error: 'Current Fund membership is required.' }, { status: 403 })
    const tenant = await getTrustedRequestTenant(admin as never, new Headers(headers()))
    if (tenant && tenant.id !== membership.fund_id) {
      return NextResponse.json({ error: 'Fund not found' }, { status: 404 })
    }
    const profile = await loadPersonalProfile(admin, user.id)
    if (!profile.fullName) {
      return NextResponse.json({ error: 'Save your real name before claiming a mailbox.' }, { status: 409 })
    }
    const mailbox = await setCurrentUserMailbox(admin, {
      fundId: membership.fund_id,
      userId: user.id,
      localPart: typeof input.mailboxLocalPart === 'string' ? input.mailboxLocalPart : '',
      displayName: profile.fullName,
    })
    const { data: fund, error: fundError } = await admin
      .from('funds')
      .select('email_subdomain')
      .eq('id', membership.fund_id)
      .single()
    if (fundError || !fund?.email_subdomain) throw new Error('Fund email identity unavailable')
    const domain = deriveFundEmailDomain(fund.email_subdomain)
    return NextResponse.json({
      mailbox: {
        localPart: mailbox.localPart,
        address: `${mailbox.localPart}@${domain}`,
        displayName: mailbox.displayName,
        active: mailbox.active,
      },
    })
  } catch (error) {
    if (error instanceof FundEmailError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    return identityErrorResponse(error, 'settings-personal-write')
  }
}
