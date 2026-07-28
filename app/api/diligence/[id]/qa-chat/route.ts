/* eslint-disable @typescript-eslint/no-explicit-any -- legacy diligence tables are not present in the generated Supabase schema yet */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dbError } from '@/lib/api-error'
import { hasAccess, loadAccessContext } from '@/lib/access/effective'

const MAX_LEGACY_MESSAGES = 100
const MAX_LEGACY_RESPONSE_BYTES = 256_000

/**
 * Compatibility-only reader for the shared Q&A stream that pre-dates personal Analyst threads.
 * New questions are handled by /api/analyst; this endpoint deliberately exposes no write methods.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await ensureDiligenceReader()
  if ('error' in guard) return guard.error
  const { admin, fundId } = guard

  const { data: project, error: projectError } = await (admin as any)
    .from('diligence_deals')
    .select('id')
    .eq('id', params.id)
    .eq('fund_id', fundId)
    .maybeSingle()
  if (projectError) return dbError(projectError, 'diligence-qa-chat-project')
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await (admin as any)
    .from('diligence_qa_chats')
    .select('id, role, content, citations, created_at')
    .eq('deal_id', params.id)
    .eq('fund_id', fundId)
    .order('created_at', { ascending: false })
    .limit(MAX_LEGACY_MESSAGES)

  if (error) return dbError(error, 'diligence-qa-chat-list')

  const messages = [] as unknown[]
  let bytes = 0
  for (const row of [...(data ?? [])].reverse()) {
    const rowBytes = Buffer.byteLength(JSON.stringify(row), 'utf8')
    if (bytes + rowBytes > MAX_LEGACY_RESPONSE_BYTES) continue
    bytes += rowBytes
    messages.push(row)
  }
  return NextResponse.json({ messages })
}

async function ensureDiligenceReader() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id, role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return { error: NextResponse.json({ error: 'No fund' }, { status: 403 }) }

  const access = await loadAccessContext(admin, membership.fund_id, user.id, membership.role)
  if (!hasAccess(access, 'diligence', 'read')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { admin, fundId: membership.fund_id }
}
