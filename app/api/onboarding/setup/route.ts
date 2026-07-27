import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveFund } from '@/lib/api-helpers'
import { fundMatchesTrustedRequestTenant } from '@/lib/tenancy/request'
import { loadFundSetupState } from '@/lib/identity/setup'
import { identityErrorResponse } from '@/lib/identity/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const gate = await resolveFund(admin, user.id)
  if (gate instanceof NextResponse) return gate
  if (!(await fundMatchesTrustedRequestTenant(admin as never, new Headers(headers()), gate.fundId))) {
    return NextResponse.json({ error: 'Fund not found' }, { status: 404 })
  }
  try {
    return NextResponse.json({ setup: await loadFundSetupState(admin, {
      fundId: gate.fundId,
      userId: user.id,
    }) })
  } catch (error) {
    return identityErrorResponse(error, 'onboarding-setup')
  }
}
