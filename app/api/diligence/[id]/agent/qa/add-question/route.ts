import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dbError } from '@/lib/api-error'
import { randomUUID } from 'node:crypto'
import { hasAccess, loadAccessContext } from '@/lib/access/effective'
import {
  MAX_QA_ANSWER_BYTES,
  MAX_QA_ANSWER_LENGTH,
  MAX_QA_ENTRY_BODY_BYTES,
  MAX_QA_EVIDENCE_ENTRY_BYTES,
  QARequestBodyError,
  readBoundedJsonRequest,
  utf8ByteLength,
} from '@/lib/diligence/qa-input'

/**
 * Append a partner-authored Q&A entry to the deal's latest draft. The partner
 * supplies both the question and their own answer/judgment — it feeds the
 * memo draft alongside the agent-asked Q&A. Independent of the agent Q&A
 * session; finishQA preserves these entries.
 *
 * Body: { question_text: string, answer_text: string }
 */
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
  const questionText = typeof body.question_text === 'string' ? body.question_text.trim() : ''
  const answerText = typeof body.answer_text === 'string' ? body.answer_text.trim() : ''
  if (!questionText) return NextResponse.json({ error: 'question_text is required' }, { status: 400 })
  if (!answerText) return NextResponse.json({ error: 'answer_text is required' }, { status: 400 })
  if (
    questionText.length > 10_000
    || answerText.length > MAX_QA_ANSWER_LENGTH
    || utf8ByteLength(answerText) > MAX_QA_ANSWER_BYTES
  ) {
    return NextResponse.json({ error: 'Q&A entry is too large' }, { status: 413 })
  }

  const questionId = `partner_q_${randomUUID()}`
  const entry = {
    question_id: questionId,
    question_text: questionText,
    answer_text: answerText,
    partner_id: user.id,
    answered_at: new Date().toISOString(),
    feeds_dimensions: [],
    category: 'partner_question',
  }
  if (utf8ByteLength(JSON.stringify(entry)) > MAX_QA_EVIDENCE_ENTRY_BYTES) {
    return NextResponse.json({ error: 'Q&A entry is too large' }, { status: 413 })
  }

  const { data, error } = await admin.rpc('append_diligence_qa_answer', {
    p_fund_id: fundId,
    p_deal_id: params.id,
    p_stable_id: questionId,
    p_entry: entry,
  })
  if (error) return dbError(error, 'diligence-qa-add-question')
  if (data === 'no-draft') {
    return NextResponse.json({ error: 'No draft yet. Run Stage 1 ingest first.' }, { status: 409 })
  }
  if (data === 'limit') return NextResponse.json({ error: 'Q&A evidence limit reached.' }, { status: 409 })
  if (data !== 'promoted' && data !== 'duplicate') return NextResponse.json({ error: 'Could not add Q&A.' }, { status: 500 })

  return NextResponse.json({ ok: true, question_id: questionId })
}
