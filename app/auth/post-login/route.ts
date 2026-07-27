import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity'
import { headers } from 'next/headers'
import { getTrustedRequestTenant } from '@/lib/tenancy/request'
import { canonicalFundRequestOrigin } from '@/lib/tenancy/host'
import { safeNextPath } from '@/lib/safe-redirect'
import { resolveBrowserFundIdentity } from '@/lib/tenancy/browser-identity'

/**
 * Post-login side effects for the OTP flows.
 *
 * Email OTP verification happens client-side (`verifyOtp`), which sets the
 * session cookies but can't run the server-side work the old link callback did.
 * After a successful verify, the client navigates here to run exactly that:
 * fund-membership lookup + login activity log, with the new-user → onboarding
 * redirect. OAuth still uses `/auth/callback` (code exchange).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const origin = canonicalFundRequestOrigin(request)
  const next = safeNextPath(searchParams.get('next')) ?? '/'
  const method = searchParams.get('method') ?? 'otp'

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${origin}/auth?error=${encodeURIComponent('Your session expired. Please sign in again.')}`)
  }

  const admin = createAdminClient()
  const tenant = await getTrustedRequestTenant(admin as never, new Headers(headers()))
  const identity = await resolveBrowserFundIdentity({
    admin: admin as never,
    session: supabase as never,
    userId: user.id,
    tenantFundId: tenant?.id ?? null,
  })
  if (!identity.matches) {
    await supabase.auth.signOut({ scope: 'local' })
    return NextResponse.redirect(`${origin}/auth?error=workspace_mismatch`)
  }

  if (identity.membershipFundId) {
    logActivity(admin, identity.membershipFundId, user.id, 'login', { method })
    if (next === '/') {
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  } else if (identity.identityFundId && identity.lpStatus === 'invited' && !next.startsWith('/auth/')) {
    return NextResponse.redirect(`${origin}/portal/welcome`)
  } else if (identity.identityFundId && next === '/') {
    return NextResponse.redirect(`${origin}/portal/overview`)
  } else if (next === '/') {
    // New user with no fund — onboarding, matching the old link callback.
    return NextResponse.redirect(`${origin}/onboarding?confirmed=true`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
