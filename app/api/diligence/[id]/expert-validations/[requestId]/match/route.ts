import { NextResponse } from 'next/server'
import { apiError, assertDeal, internalContext } from '@/lib/expert-validation/api'
import { matchExperts } from '@/lib/expert-validation/service'

export async function POST(_req: Request, { params }: { params: { id: string; requestId: string } }) {
  const context = await internalContext('write')
  if (context instanceof NextResponse) return context
  try {
    if (!await assertDeal(context.admin, context.gate.fundId, params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data, error } = await context.admin
      .from('diligence_expert_requests')
      .select('question, expert_profile, status')
      .eq('id', params.requestId)
      .eq('fund_id', context.gate.fundId)
      .eq('deal_id', params.id)
      .maybeSingle()
    if (error) throw error
    if (!data || data.status !== 'draft') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const matches = await matchExperts({
      admin: context.admin as never,
      fundId: context.gate.fundId,
      question: data.question,
      expertProfile: data.expert_profile,
    })
    return NextResponse.json({ matches })
  } catch (error) {
    return apiError(error)
  }
}
