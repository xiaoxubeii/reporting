import { NextRequest, NextResponse } from 'next/server'
import { apiError, assertDeal, internalContext, readJson } from '@/lib/expert-validation/api'
import { selectExpert } from '@/lib/expert-validation/service'
import { requiredString, ValidationError } from '@/lib/expert-validation/validation'

export async function POST(req: NextRequest, { params }: { params: { id: string; requestId: string } }) {
  const context = await internalContext('write')
  if (context instanceof NextResponse) return context
  try {
    if (!await assertDeal(context.admin, context.gate.fundId, params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const body = await readJson(req, 4_000) as Record<string, unknown>
    if (body.selection_method !== 'manual' && body.selection_method !== 'auto_match') {
      throw new ValidationError('selection_method must be manual or auto_match')
    }
    const request = await selectExpert({
      admin: context.admin as never,
      fundId: context.gate.fundId,
      dealId: params.id,
      requestId: params.requestId,
      expertId: requiredString(body.expert_id, 'expert_id', 100),
      selectionMethod: body.selection_method,
    })
    return NextResponse.json({ request })
  } catch (error) {
    return apiError(error)
  }
}
