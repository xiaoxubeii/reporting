import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dbError } from '@/lib/api-error'
import { draftHasGeneratedArtifacts } from '@/lib/diligence/draft-artifacts'
import { isFinalDecisionStatus } from '@/lib/diligence/final-decision'

// 'invested' is the current label for a closed/won deal; 'won'/'lost'/'on_hold'
// are retained for back-compat with rows written before the relabel.
const VALID_DEAL_STATUSES = ['invested', 'active', 'passed', 'won', 'lost', 'on_hold'] as const
const VALID_MEMO_STAGES = ['not_started', 'ingest', 'research', 'qa', 'draft', 'score', 'render', 'finalized'] as const

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await ensureMember()
  if ('error' in guard) return guard.error
  const { admin, fundId } = guard

  const { data: deal } = await admin
    .from('diligence_deals')
    .select('*')
    .eq('id', params.id)
    .eq('fund_id', fundId)
    .maybeSingle()
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Document count for the overview tab.
  const { count: documentCount } = await admin
    .from('diligence_documents')
    .select('id', { count: 'exact', head: true })
    .eq('deal_id', params.id)
    .eq('fund_id', fundId)

  // Latest draft summary, if any.
  const { data: latestDraft } = await admin
    .from('diligence_memo_drafts')
    .select('id, draft_version, agent_version, output_language, source_draft_id, is_draft, created_at, finalized_at')
    .eq('deal_id', params.id)
    .eq('fund_id', fundId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const latestDraftSummary = latestDraft
    ? {
        ...latestDraft,
        has_generated_artifacts: await draftHasGeneratedArtifacts({
          admin,
          fundId,
          dealId: params.id,
          draftId: latestDraft.id,
          isDraft: latestDraft.is_draft,
          finalizedAt: latestDraft.finalized_at,
        }),
      }
    : null

  return NextResponse.json({
    deal,
    documentCount: documentCount ?? 0,
    latestDraft: latestDraftSummary,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await ensureMember()
  if ('error' in guard) return guard.error
  const { admin, fundId, role } = guard

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  let requestedDealStatus: typeof VALID_DEAL_STATUSES[number] | null = null
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  if (typeof body.sector === 'string') updates.sector = body.sector.trim() || null
  if (typeof body.stage_at_consideration === 'string') updates.stage_at_consideration = body.stage_at_consideration.trim() || null
  if (typeof body.lead_partner_id === 'string' || body.lead_partner_id === null) updates.lead_partner_id = body.lead_partner_id
  if (typeof body.deal_status === 'string') {
    if (!VALID_DEAL_STATUSES.includes(body.deal_status)) {
      return NextResponse.json({ error: 'Invalid deal_status' }, { status: 400 })
    }
    if (isFinalDecisionStatus(body.deal_status)) {
      if (role !== 'admin') {
        return NextResponse.json({ error: 'Admin required', code: 'admin_required' }, { status: 403 })
      }
    }
    requestedDealStatus = body.deal_status
  }
  if (typeof body.current_memo_stage === 'string') {
    if (!VALID_MEMO_STAGES.includes(body.current_memo_stage)) {
      return NextResponse.json({ error: 'Invalid current_memo_stage' }, { status: 400 })
    }
    updates.current_memo_stage = body.current_memo_stage
  }
  if (requestedDealStatus && Object.keys(updates).length > 0) {
    return NextResponse.json({
      error: 'Record a Deal status separately from other updates.',
      code: 'deal_status_separate_update_required',
    }, { status: 400 })
  }
  if (requestedDealStatus) {
    const { error } = await admin.rpc('set_diligence_deal_status', {
      p_actor_user_id: guard.userId,
      p_deal_id: params.id,
      p_fund_id: fundId,
      p_status: requestedDealStatus,
    })
    if (error) {
      if (error.message.includes('finalized_memo_required')) {
        return NextResponse.json({
          error: 'Finalize a memo before recording the final investment decision.',
          code: 'finalized_memo_required',
        }, { status: 409 })
      }
      if (error.message.includes('admin_required')) {
        return NextResponse.json({ error: 'Admin required', code: 'admin_required' }, { status: 403 })
      }
      if (error.message.includes('fund_membership_required')) {
        return NextResponse.json({ error: 'No fund found' }, { status: 403 })
      }
      if (error.message.includes('diligence_deal_not_found')) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      return dbError(error, 'diligence-deal-status')
    }
    return NextResponse.json({ ok: true })
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: updatedDeal, error } = await admin
    .from('diligence_deals')
    .update(updates)
    .eq('id', params.id)
    .eq('fund_id', fundId)
    .select('id')
    .maybeSingle()
  if (error) return dbError(error, 'diligence-deal-update')
  if (!updatedDeal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await ensureAdmin()
  if ('error' in guard) return guard.error
  const { admin, fundId } = guard

  // ON DELETE CASCADE handles documents, drafts, attention items, sessions, notes.
  // Storage objects under {dealId}/* will dangle; cleaning them is async (TODO).
  const { error } = await admin
    .from('diligence_deals')
    .delete()
    .eq('id', params.id)
    .eq('fund_id', fundId)
  if (error) return dbError(error, 'diligence-deal-delete')
  return NextResponse.json({ ok: true })
}

// ---------------------------------------------------------------------------

async function ensureMember() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id, role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return { error: NextResponse.json({ error: 'No fund found' }, { status: 403 }) }

  const membershipRow = membership as { fund_id: string; role: string }
  return { admin, fundId: membershipRow.fund_id, userId: user.id, role: membershipRow.role }
}

async function ensureAdmin() {
  const guard = await ensureMember()
  if ('error' in guard) return guard
  if (guard.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin required' }, { status: 403 }) }
  }
  return guard
}
