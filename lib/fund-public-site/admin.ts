import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdminAccess } from '@/lib/api-helpers'
import { getTrustedRequestTenant, trustedTenantSlugFromHeaders } from '@/lib/tenancy/request'

export interface FundPublicSiteAdminContext {
  readonly admin: ReturnType<typeof createAdminClient>
  readonly fundId: string
  readonly fundName: string
  readonly logoUrl: string | null
  readonly tenantSlug: string | null
  readonly userId: string
}

export async function requireFundPublicSiteAdmin(
  request: Pick<NextRequest, 'headers'>,
): Promise<FundPublicSiteAdminContext | NextResponse> {
  const supabase = createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const admin = createAdminClient()
  const access = await assertAdminAccess(admin, user.id)
  if (access instanceof NextResponse) return access

  const tenantSlug = trustedTenantSlugFromHeaders(request.headers)
  if (!process.env.FUND_WORKSPACE_ROOT_DOMAIN || !tenantSlug) {
    return NextResponse.json({ error: 'Fund site not found' }, { status: 404 })
  }
  const tenant = await getTrustedRequestTenant(admin, request.headers)
  if (!tenant || tenant.id !== access.fundId) {
    return NextResponse.json({ error: 'Fund site not found' }, { status: 404 })
  }

  const { data: fund, error: fundError } = await admin
    .from('funds')
    .select('name, logo_url')
    .eq('id', access.fundId)
    .maybeSingle()
  if (fundError || !fund) return NextResponse.json({ error: 'Fund site not found' }, { status: 404 })

  return {
    admin,
    fundId: access.fundId,
    fundName: fund.name,
    logoUrl: fund.logo_url,
    tenantSlug,
    userId: user.id,
  }
}
