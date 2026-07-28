import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getNextBatch,
  loadSessionState,
  QAConcurrentSessionError,
  startQASession,
} from '@/lib/memo-agent/stages/qa'
import { hasAccess, loadAccessContext } from '@/lib/access/effective'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id, role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'No fund found' }, { status: 403 })
  const fundId = membership.fund_id
  const access = await loadAccessContext(admin, fundId, user.id, membership.role)
  if (!hasAccess(access, 'diligence', 'write')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Find the latest in-progress draft.
  const { data: draft } = await admin
    .from('diligence_memo_drafts')
    .select('id, ingestion_output, research_output')
    .eq('deal_id', params.id)
    .eq('fund_id', fundId)
    .eq('is_draft', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!draft) {
    return NextResponse.json({ error: 'Run Stage 1 ingest first.' }, { status: 409 })
  }
  if (!draft.ingestion_output) {
    return NextResponse.json({ error: 'Run Stage 1 ingest first.' }, { status: 409 })
  }

  const draftId = draft.id
  try {
    const sessionId = await startQASession({ admin, fundId, dealId: params.id, draftId, userId: user.id })
    const batch = await getNextBatch({ admin, fundId, dealId: params.id, draftId, sessionId })
    const state = await loadSessionState(admin, sessionId, fundId, params.id, draftId)
    return NextResponse.json({ session_id: sessionId, draft_id: draftId, ...batch, state })
  } catch (err) {
    if (err instanceof QAConcurrentSessionError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Q&A failed' }, { status: 500 })
  }
}
