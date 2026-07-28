/* eslint-disable @typescript-eslint/no-explicit-any -- diligence_qa_chats is a preserved legacy table absent from generated DB types */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dbError } from '@/lib/api-error'
import {
  MAX_ANALYST_HISTORY_CONTEXT_TEXT,
  MAX_ANALYST_MESSAGE_CONTENT,
  normalizeAnalystCitations,
} from '@/lib/analyst/context-snapshot'
import { hasAccess, loadAccessContext, type AccessContext } from '@/lib/access/effective'

const LEGACY_DILIGENCE_PREFIX = 'legacy-diligence:'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ExpectedConversationScope {
  companyId: string | null
  dealId: string | null
  scope: string | null
}

function canReadConversationScope(access: AccessContext, expected: ExpectedConversationScope): boolean {
  if (expected.dealId) return hasAccess(access, 'dealflow', 'read')
  if (expected.companyId) return hasAccess(access, 'portfolio', 'read')
  if (expected.scope?.startsWith('diligence')) return hasAccess(access, 'diligence', 'read')
  if (expected.scope?.startsWith('accounting:')) return hasAccess(access, 'accounting', 'read')
  if (expected.scope === 'lps') {
    return hasAccess(access, 'lp_capital', 'read') || hasAccess(access, 'lp_relations', 'read')
  }
  return hasAccess(access, 'portfolio', 'read')
}

function expectedConversationScope(req: NextRequest): ExpectedConversationScope | null {
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('companyId')
  const dealId = searchParams.get('dealId')
  const portfolio = searchParams.get('portfolio') === 'true'
  const selected = Number(Boolean(companyId)) + Number(Boolean(dealId)) + Number(portfolio)
  if (selected !== 1) return null
  if (companyId) return { companyId, dealId: null, scope: null }
  if (dealId) return { companyId: null, dealId, scope: null }
  return { companyId: null, dealId: null, scope: searchParams.get('scope') }
}

function legacyDiligenceId(id: string): string | null {
  if (!id.startsWith('legacy-diligence:')) return null
  const dealId = id.slice(LEGACY_DILIGENCE_PREFIX.length)
  return UUID_PATTERN.test(dealId) ? dealId : null
}

function adaptLegacyCitations(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const mapped = value.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const citation = item as Record<string, unknown>
    if (typeof citation.document_id !== 'string' || typeof citation.summary !== 'string') return []
    return [{
      documentId: citation.document_id,
      label: citation.document_id,
      summary: citation.summary,
    }]
  })
  if (mapped.length === 0) return undefined
  try {
    return normalizeAnalystCitations(mapped)
  } catch {
    return undefined
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'No fund' }, { status: 403 })

  const expected = expectedConversationScope(req)
  if (!expected) {
    return NextResponse.json({ error: 'Expected conversation scope is required' }, { status: 400 })
  }
  const access = await loadAccessContext(admin, membership.fund_id, user.id, membership.role)
  if (!canReadConversationScope(access, expected)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const legacyDealId = legacyDiligenceId(id)
  if (id.startsWith('legacy-diligence:')) {
    if (!legacyDealId || expected.scope !== `diligence:${legacyDealId}`) {
      return NextResponse.json({ error: 'Conversation scope does not match the current page.' }, { status: 409 })
    }
    const { data: project, error: projectError } = await (admin as any)
      .from('diligence_deals')
      .select('id')
      .eq('id', legacyDealId)
      .eq('fund_id', membership.fund_id)
      .maybeSingle()
    if (projectError) return dbError(projectError, 'analyst-conversations-id-diligence-project')
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: rows, error: legacyError } = await (admin as any)
      .from('diligence_qa_chats')
      .select('role, content, citations, created_at')
      .eq('deal_id', legacyDealId)
      .eq('fund_id', membership.fund_id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (legacyError) return dbError(legacyError, 'analyst-conversations-id-legacy-diligence')

    const newestMessages: Array<{ role: string; content: string; citations?: ReturnType<typeof adaptLegacyCitations> }> = []
    let totalContent = 0
    for (const row of rows ?? []) {
      if ((row.role !== 'user' && row.role !== 'assistant') || typeof row.content !== 'string') continue
      const content = row.content.slice(0, MAX_ANALYST_MESSAGE_CONTENT)
      if (totalContent + content.length > MAX_ANALYST_HISTORY_CONTEXT_TEXT) continue
      totalContent += content.length
      const citations = row.role === 'assistant' ? adaptLegacyCitations(row.citations) : undefined
      newestMessages.push({ role: row.role, content, ...(citations ? { citations } : {}) })
    }
    const messages = newestMessages.reverse()
    return NextResponse.json({
      conversation: {
        id,
        title: '历史问答（旧版）',
        company_id: null,
        deal_id: null,
        scope: expected.scope,
        read_only: true,
        messages,
      },
    })
  }

  if (expected.scope?.startsWith('diligence:')) {
    const diligenceDealId = expected.scope.slice('diligence:'.length)
    if (!UUID_PATTERN.test(diligenceDealId)) {
      return NextResponse.json({ error: 'Invalid diligence scope' }, { status: 400 })
    }
    const { data: project, error: projectError } = await (admin as any)
      .from('diligence_deals')
      .select('id')
      .eq('id', diligenceDealId)
      .eq('fund_id', membership.fund_id)
      .maybeSingle()
    if (projectError) return dbError(projectError, 'analyst-conversations-id-diligence-project')
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let query = admin
    .from('analyst_conversations')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('fund_id', membership.fund_id)
  query = expected.companyId ? query.eq('company_id', expected.companyId) : query.is('company_id', null)
  query = expected.dealId ? query.eq('deal_id', expected.dealId) : query.is('deal_id', null)
  query = expected.scope ? query.eq('scope', expected.scope) : query.is('scope', null)
  const { data, error } = await query.maybeSingle()

  if (error) return dbError(error, 'analyst-conversations-id')
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ conversation: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'No fund' }, { status: 403 })

  if (id.startsWith('legacy-diligence:')) {
    return NextResponse.json({ error: 'Legacy diligence history is read-only' }, { status: 405 })
  }

  const { error } = await admin
    .from('analyst_conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('fund_id', membership.fund_id)

  if (error) return dbError(error, 'analyst-conversations-id')

  return NextResponse.json({ ok: true })
}
