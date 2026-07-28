import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dbError } from '@/lib/api-error'
import { hasAccess, loadAccessContext } from '@/lib/access/effective'
import {
  MAX_QA_ENTRY_BODY_BYTES,
  QARequestBodyError,
  readBoundedJsonRequest,
} from '@/lib/diligence/qa-input'

/**
 * Manage a single Q&A entry on the deal's latest draft.
 *
 *   PATCH  { question_id, excluded }  → toggle whether the entry feeds the deal
 *                                       evaluation (memo draft + scoring).
 *   DELETE ?question_id=...           → remove the entry entirely.
 *
 * Both target the latest in-progress draft and are fund-scoped.
 */

async function resolve(req: NextRequest, dealId: string) {
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
  const fundId = membership.fund_id
  const access = await loadAccessContext(admin, fundId, user.id, membership.role)
  if (!hasAccess(access, 'diligence', 'write')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const { data: draft } = await admin
    .from('diligence_memo_drafts')
    .select('id')
    .eq('deal_id', dealId)
    .eq('fund_id', fundId)
    .eq('is_draft', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!draft) return { error: NextResponse.json({ error: 'No draft found.' }, { status: 404 }) }

  return { admin, fundId, draftId: draft.id }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await resolve(req, params.id)
  if ('error' in r) return r.error
  const { admin, fundId, draftId } = r

  let body: Record<string, unknown>
  try {
    const parsed = await readBoundedJsonRequest(req, MAX_QA_ENTRY_BODY_BYTES)
    body = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch (error) {
    if (error instanceof QARequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const questionId = typeof body.question_id === 'string' ? body.question_id : ''
  if (!questionId) return NextResponse.json({ error: 'question_id is required' }, { status: 400 })
  if (questionId.length > 256) {
    return NextResponse.json({ error: 'question_id is too long' }, { status: 413 })
  }
  const excluded = !!body.excluded

  const { data, error } = await admin.rpc('set_diligence_qa_answer_excluded', {
    p_fund_id: fundId,
    p_deal_id: params.id,
    p_draft_id: draftId,
    p_question_id: questionId,
    p_excluded: excluded,
  })
  if (error) return dbError(error, 'diligence-qa-entry-update')
  if (data !== 'updated') return NextResponse.json({ error: 'Q&A entry not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await resolve(req, params.id)
  if ('error' in r) return r.error
  const { admin, fundId, draftId } = r

  const questionId = new URL(req.url).searchParams.get('question_id') ?? ''
  if (!questionId) return NextResponse.json({ error: 'question_id is required' }, { status: 400 })
  if (questionId.length > 256) {
    return NextResponse.json({ error: 'question_id is too long' }, { status: 413 })
  }

  const { data, error } = await admin.rpc('delete_diligence_qa_answer', {
    p_fund_id: fundId,
    p_deal_id: params.id,
    p_draft_id: draftId,
    p_question_id: questionId,
  })
  if (error) return dbError(error, 'diligence-qa-entry-delete')
  if (data !== 'deleted') return NextResponse.json({ error: 'Q&A entry not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
