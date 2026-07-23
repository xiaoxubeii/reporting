import { NextResponse } from 'next/server'
import { apiError, assertDeal, internalContext } from '@/lib/expert-validation/api'
import { materializeExpertResponse, recordMaterializationError } from '@/lib/expert-validation/materialize'

export async function POST(_req: Request, { params }: { params: { id: string; requestId: string } }) {
  const context = await internalContext('write')
  if (context instanceof NextResponse) return context
  try {
    if (!await assertDeal(context.admin, context.gate.fundId, params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data } = await context.admin
      .from('diligence_expert_requests')
      .select('id')
      .eq('id', params.requestId)
      .eq('fund_id', context.gate.fundId)
      .eq('deal_id', params.id)
      .eq('status', 'submitted')
      .maybeSingle()
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    try {
      const materialization = await materializeExpertResponse({
        admin: context.admin as never,
        requestId: params.requestId,
        enqueuedBy: context.gate.userId,
      })
      return NextResponse.json({ materialization })
    } catch (error) {
      await recordMaterializationError(context.admin as never, params.requestId, error)
      throw error
    }
  } catch (error) {
    return apiError(error)
  }
}
