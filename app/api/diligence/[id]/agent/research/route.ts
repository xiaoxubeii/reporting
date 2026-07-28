import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { kickBackgroundJobDispatcher } from '@/lib/background-jobs/kick'
import { enforceCapsForStage } from '@/lib/memo-agent/cost'
import { enqueueMemoResearchBackground } from '@/lib/memo-agent/research-background'

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

  const { data: deal } = await admin
    .from('diligence_deals')
    .select('id')
    .eq('id', params.id)
    .eq('fund_id', fundId)
    .maybeSingle()
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Require ingestion_output to exist on the latest draft.
  const { data: draft } = await admin
    .from('diligence_memo_drafts')
    .select('id, ingestion_output')
    .eq('deal_id', params.id)
    .eq('fund_id', fundId)
    .eq('is_draft', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!draft || !draft.ingestion_output) {
    return NextResponse.json({
      error: 'Run Stage 1 ingest first, research depends on the ingestion output.',
    }, { status: 409 })
  }

  // Reject if a job is already in flight.
  const { data: existing } = await admin
    .from('memo_agent_jobs')
    .select('id, status, kind')
    .eq('deal_id', params.id)
    .eq('fund_id', fundId)
    .in('status', ['pending', 'running'])
    .limit(1)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({
      error: `A ${existing.kind} job is already ${existing.status}.`,
      job_id: existing.id,
    }, { status: 409 })
  }

  const enforced = await enforceCapsForStage({ admin, fundId, dealId: params.id, stage: 'research' })
  if (!enforced.ok) {
    return NextResponse.json({ error: enforced.reason, estimate: enforced.estimate, caps: enforced.caps }, { status: 422 })
  }

  let created: Awaited<ReturnType<typeof enqueueMemoResearchBackground>>
  try {
    created = await enqueueMemoResearchBackground({
      fundId,
      dealId: params.id,
      draftId: draft.id,
      actorUserId: user.id,
    }, admin)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'enqueue failed'
    if (/already active/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    console.error('[memo-research] atomic enqueue failed')
    return NextResponse.json({ error: 'Unable to enqueue research' }, { status: 500 })
  }
  await kickBackgroundJobDispatcher()

  return NextResponse.json({
    job_id: created.id,
    background_job_id: created.backgroundJobId,
    kind: 'research',
    status: created.status,
    estimate: enforced.estimate,
    caps: enforced.caps,
  })
}
