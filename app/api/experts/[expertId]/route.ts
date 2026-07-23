import { NextRequest, NextResponse } from 'next/server'
import { apiError, internalContext, readJson } from '@/lib/expert-validation/api'
import { saveExpert } from '@/lib/expert-validation/service'
import { parseExpertInput, ValidationError } from '@/lib/expert-validation/validation'

export async function PATCH(req: NextRequest, { params }: { params: { expertId: string } }) {
  const context = await internalContext('write')
  if (context instanceof NextResponse) return context
  try {
    const input = parseExpertInput(await readJson(req))
    if (input.scope === 'global' && !(
      context.gate.role === 'admin' &&
      Boolean(process.env.EXPERT_GLOBAL_ADMIN_FUND_ID) &&
      process.env.EXPERT_GLOBAL_ADMIN_FUND_ID === context.gate.fundId
    )) throw new ValidationError('Global experts can only be managed through the trusted global-admin path')
    const result = await saveExpert({
      admin: context.admin as never,
      fundId: context.gate.fundId,
      userId: context.gate.userId,
      expertId: params.expertId,
      allowGlobalWrite: context.gate.role === 'admin' && Boolean(process.env.EXPERT_GLOBAL_ADMIN_FUND_ID) && process.env.EXPERT_GLOBAL_ADMIN_FUND_ID === context.gate.fundId,
      input,
    })
    return NextResponse.json(result)
  } catch (error) {
    return apiError(error)
  }
}
