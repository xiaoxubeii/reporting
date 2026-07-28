import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { finishQA, QAConcurrentSessionError } from '@/lib/memo-agent/stages/qa'
import { hasAccess, loadAccessContext } from '@/lib/access/effective'
import {
  parseQAFinishBody,
  QARequestBodyError,
  readBoundedQAFinishJson,
} from '@/lib/diligence/qa-input'

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

  let body: unknown
  try {
    body = await readBoundedQAFinishJson(req)
  } catch (error) {
    if (error instanceof QARequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const parsed = parseQAFinishBody(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  }

  try {
    const result = await finishQA({
      admin,
      fundId,
      dealId: params.id,
      sessionId: parsed.sessionId,
      draftId: parsed.draftId,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof QAConcurrentSessionError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
