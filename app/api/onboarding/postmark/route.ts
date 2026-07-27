import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertWriteAccess } from '@/lib/api-helpers'
import { headers } from 'next/headers'
import { fundMatchesTrustedRequestTenant } from '@/lib/tenancy/request'

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const writeCheck = await assertWriteAccess(admin, user.id)
  if (writeCheck instanceof NextResponse) return writeCheck

  const { fundId, postmarkInboundAddress } = await req.json()
  if (!fundId || !postmarkInboundAddress?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!(await fundMatchesTrustedRequestTenant(admin as never, new Headers(headers()), fundId))) {
    return NextResponse.json({ error: 'Fund not found' }, { status: 404 })
  }

  // Verify the fund belongs to this user
  const { data: membership } = await admin
    .from('fund_members')
    .select('id')
    .eq('fund_id', fundId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await admin
    .from('fund_settings')
    .update({ postmark_inbound_address: postmarkInboundAddress.trim() })
    .eq('fund_id', fundId)

  if (error) {
    return NextResponse.json({ error: 'Failed to save Postmark settings' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
