/* eslint-disable @typescript-eslint/no-explicit-any -- diligence_qa_chats is a preserved legacy table absent from generated DB types */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dbError } from '@/lib/api-error'
import { hasAccess, loadAccessContext, type AccessContext } from '@/lib/access/effective'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function diligenceIdFromScope(scope: string | null): string | null {
  if (!scope?.startsWith('diligence:')) return null
  const id = scope.slice('diligence:'.length)
  return UUID_PATTERN.test(id) ? id : null
}

function canReadConversationScope(access: AccessContext, selector: {
  companyId: string | null
  dealId: string | null
  scope: string | null
}): boolean {
  if (selector.dealId) return hasAccess(access, 'dealflow', 'read')
  if (selector.companyId) return hasAccess(access, 'portfolio', 'read')
  if (selector.scope?.startsWith('diligence')) return hasAccess(access, 'diligence', 'read')
  if (selector.scope?.startsWith('accounting:')) return hasAccess(access, 'accounting', 'read')
  if (selector.scope === 'lps') {
    return hasAccess(access, 'lp_capital', 'read') || hasAccess(access, 'lp_relations', 'read')
  }
  return hasAccess(access, 'portfolio', 'read')
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id, role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'No fund' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('companyId')
  const dealId = searchParams.get('dealId')
  const portfolio = searchParams.get('portfolio') === 'true'
  // A domain thread ('accounting:<vehicle>', 'lps', 'diligence'); absent = the portfolio thread.
  const scope = searchParams.get('scope')
  const selectorCount = Number(Boolean(companyId)) + Number(Boolean(dealId)) + Number(portfolio)
  if (selectorCount > 1 || (scope !== null && !portfolio)) {
    return NextResponse.json({ error: 'Invalid conversation scope selectors' }, { status: 400 })
  }
  const diligenceDealId = diligenceIdFromScope(scope)

  if (scope?.startsWith('diligence:') && !diligenceDealId) {
    return NextResponse.json({ error: 'Invalid diligence scope' }, { status: 400 })
  }
  const access = await loadAccessContext(admin, membership.fund_id, user.id, membership.role)
  if (!canReadConversationScope(access, { companyId, dealId, scope })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (diligenceDealId) {
    const { data: project, error: projectError } = await (admin as any)
      .from('diligence_deals')
      .select('id')
      .eq('id', diligenceDealId)
      .eq('fund_id', membership.fund_id)
      .maybeSingle()
    if (projectError) return dbError(projectError, 'analyst-conversations-diligence-project')
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let query = admin
    .from('analyst_conversations')
    .select('id, title, company_id, deal_id, scope, message_count, created_at, updated_at')
    .eq('fund_id', membership.fund_id)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (dealId) {
    query = query.eq('deal_id', dealId)
  } else if (companyId) {
    query = query.eq('company_id', companyId).is('deal_id', null)
  } else if (portfolio || scope) {
    // Both are the "not company, not deal" case; `scope` then picks the domain thread apart from
    // the portfolio one. Listing is by ownership — the scope only sorts threads, it grants nothing.
    query = query.is('company_id', null).is('deal_id', null)
    query = scope ? query.eq('scope', scope) : query.is('scope', null)
  }

  const { data, error } = await query
  if (error) return dbError(error, 'analyst-conversations')

  if (!diligenceDealId) return NextResponse.json({ conversations: data })

  const { data: legacyRows, error: legacyError, count: legacyCount } = await (admin as any)
    .from('diligence_qa_chats')
    .select('id, created_at', { count: 'exact' })
    .eq('deal_id', diligenceDealId)
    .eq('fund_id', membership.fund_id)
    .order('created_at', { ascending: false })
    .limit(1)
  if (legacyError) return dbError(legacyError, 'analyst-conversations-legacy-diligence')

  const latestLegacy = legacyRows?.[0]
  const conversations = [...(data ?? [])]
  if (latestLegacy && legacyCount) {
    conversations.push({
      id: `legacy-diligence:${diligenceDealId}`,
      title: '历史问答（旧版）',
      company_id: null,
      deal_id: null,
      scope,
      read_only: true,
      message_count: legacyCount,
      created_at: latestLegacy.created_at,
      updated_at: latestLegacy.created_at,
    } as any)
    conversations.sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
  }

  return NextResponse.json({ conversations })
}
