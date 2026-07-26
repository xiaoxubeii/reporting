import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity'
import { canonicalFundRequestUrl } from '@/lib/tenancy/host'
import { getTrustedRequestTenant } from '@/lib/tenancy/request'
import { matchAuthenticatedIdentityToTenant } from '@/lib/tenancy/identity'

export async function POST(req: Request) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  let tenant = null
  if (user) {
    const admin = createAdminClient()
    const [{ data: membership }, { data: lpFundId, error: lpFundError }, resolvedTenant] = await Promise.all([
      admin.from('fund_members').select('fund_id').eq('user_id', user.id).maybeSingle(),
      supabase.rpc('resolve_my_lp_fund'),
      getTrustedRequestTenant(admin as never, req.headers),
    ])
    tenant = resolvedTenant
    const identity = matchAuthenticatedIdentityToTenant(
      tenant?.id ?? null,
      membership?.fund_id ?? null,
      lpFundError ? null : lpFundId,
    )
    if (identity.matches && membership) {
      logActivity(admin, membership.fund_id, user.id, 'logout')
    }
  }

  await supabase.auth.signOut(tenant ? { scope: 'local' } : undefined)

  return NextResponse.redirect(canonicalFundRequestUrl(req, '/auth'))
}
