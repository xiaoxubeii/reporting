import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Promote an inbound deal into the Diligence flow. Creates a diligence_deals
 * row pre-filled from the inbound deal, links the two via
 * inbound_deals.promoted_diligence_id, and flips the inbound deal status to
 * `diligence`. Returns the new diligence_deal id so the UI can redirect.
 *
 * If the inbound deal already has a promoted_diligence_id, returns 409 with
 * the existing id rather than double-creating.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'No fund found' }, { status: 403 })
  const fundId = membership.fund_id

  const { data, error } = await admin
    .rpc('promote_inbound_deal_to_diligence', {
      p_deal_id: params.id,
      p_fund_id: fundId,
      p_user_id: user.id,
    })
  if (error) {
    if (error.code === 'P0002') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: 'Failed to create diligence record' }, { status: 500 })
  }
  const promotion = Array.isArray(data) ? data[0] : null
  if (!promotion?.diligence_id) {
    return NextResponse.json({ error: 'Failed to create diligence record' }, { status: 500 })
  }
  const diligenceId = promotion.diligence_id as string
  if (!promotion.created) {
    return NextResponse.json({
      error: 'This deal already has a Diligence record.',
      diligence_id: diligenceId,
    }, { status: 409 })
  }

  return NextResponse.json({ ok: true, diligence_id: diligenceId })
}
