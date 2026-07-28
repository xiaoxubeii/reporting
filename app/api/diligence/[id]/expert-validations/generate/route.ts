import { NextRequest, NextResponse } from 'next/server'
import { apiError, assertDeal, internalContext, readJson } from '@/lib/expert-validation/api'
import { generateValidationInputs } from '@/lib/expert-validation/generation'
import { isExpertGenerationUnavailable } from '@/lib/expert-validation/generation-unavailable'
import { resolveResearchSource } from '@/lib/expert-validation/service'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const context = await internalContext('write')
  if (context instanceof NextResponse) return context
  try {
    if (!await assertDeal(context.admin, context.gate.fundId, params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const body = await readJson(req, 8_000) as Record<string, unknown>
    const sourceRef = await resolveResearchSource({
      admin: context.admin as never,
      fundId: context.gate.fundId,
      dealId: params.id,
      locatorValue: body.source_ref ?? body.sourceRef,
    })
    const generated = await generateValidationInputs({
      admin: context.admin as never,
      fundId: context.gate.fundId,
      dealId: params.id,
      userId: context.gate.userId,
      sourceKind: sourceRef.kind,
      sourceSnapshot: sourceRef.snapshot,
    })
    return NextResponse.json({ generated, source_ref: sourceRef })
  } catch (error) {
    if (isExpertGenerationUnavailable(error)) {
      return NextResponse.json({
        error: 'AI generation is unavailable. Fill in the fields manually; nothing has been saved yet.',
        code: 'ai_generation_unavailable',
      }, { status: 422 })
    }
    return apiError(error)
  }
}
