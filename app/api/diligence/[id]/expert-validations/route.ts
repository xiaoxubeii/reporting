import { NextRequest, NextResponse } from 'next/server'
import { apiError, assertDeal, internalContext, readJson } from '@/lib/expert-validation/api'
import { resolveResearchSource, toExpertRequest } from '@/lib/expert-validation/service'
import { parseConfirmedInputs } from '@/lib/expert-validation/validation'
import { sanitizeDisclosure } from '@/lib/expert-validation/generation'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const context = await internalContext('read')
  if (context instanceof NextResponse) return context
  try {
    if (!await assertDeal(context.admin, context.gate.fundId, params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data, error } = await context.admin
      .from('diligence_expert_requests')
      .select('*')
      .eq('fund_id', context.gate.fundId)
      .eq('deal_id', params.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    const requestRows = data ?? []
    const missingThreadRequestIds = requestRows
      .filter(row => !row.email_thread_id && row.status !== 'draft')
      .map(row => row.id)
    const recoveredThreadByRequest = new Map<string, string>()
    if (missingThreadRequestIds.length > 0) {
      const threads = await context.admin
        .from('fund_email_threads')
        .select('id, context_id, updated_at')
        .eq('fund_id', context.gate.fundId)
        .eq('context_type', 'diligence_expert_request')
        .in('context_id', missingThreadRequestIds)
        .order('updated_at', { ascending: false })
      if (threads.error) throw threads.error
      for (const thread of threads.data ?? []) {
        if (thread.context_id && !recoveredThreadByRequest.has(thread.context_id)) {
          recoveredThreadByRequest.set(thread.context_id, thread.id)
        }
      }
    }
    const documentIds = requestRows.map(row => row.document_id).filter((id): id is string => Boolean(id))
    const statusById = new Map<string, string>()
    if (documentIds.length > 0) {
      const documents = await context.admin
        .from('diligence_documents')
        .select('id, parse_status')
        .eq('fund_id', context.gate.fundId)
        .eq('deal_id', params.id)
        .in('id', documentIds)
      if (documents.error) throw documents.error
      for (const document of documents.data ?? []) statusById.set(document.id, document.parse_status)
    }
    return NextResponse.json({
      requests: requestRows.map(row => toExpertRequest({
        ...row,
        email_thread_id: row.email_thread_id ?? recoveredThreadByRequest.get(row.id) ?? null,
        evidence_parse_status: row.document_id ? statusById.get(row.document_id) ?? null : null,
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const context = await internalContext('write')
  if (context instanceof NextResponse) return context
  try {
    if (!await assertDeal(context.admin, context.gate.fundId, params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const body = await readJson(req) as Record<string, unknown>
    const confirmed = parseConfirmedInputs(body)
    const sourceRef = await resolveResearchSource({
      admin: context.admin as never,
      fundId: context.gate.fundId,
      dealId: params.id,
      locatorValue: body.source_ref ?? body.sourceRef,
    })
    const { data, error } = await context.admin
      .from('diligence_expert_requests')
      .insert({
        fund_id: context.gate.fundId,
        deal_id: params.id,
        created_by: context.gate.userId,
        source_kind: sourceRef.kind,
        source_ref: sourceRef as never,
        question: sanitizeDisclosure(confirmed.question),
        expert_profile: sanitizeDisclosure(confirmed.expertProfile),
        context_snapshot: sanitizeDisclosure(confirmed.contextSnapshot),
      })
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ request: toExpertRequest(data) }, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
