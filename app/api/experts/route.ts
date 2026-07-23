import { NextRequest, NextResponse } from 'next/server'
import { apiError, internalContext, readJson } from '@/lib/expert-validation/api'
import { listExperts, saveExpert } from '@/lib/expert-validation/service'
import { parseExpertInput, ValidationError } from '@/lib/expert-validation/validation'

function mayWriteGlobal(fundId: string, role: string): boolean {
  return role === 'admin' && Boolean(process.env.EXPERT_GLOBAL_ADMIN_FUND_ID) && process.env.EXPERT_GLOBAL_ADMIN_FUND_ID === fundId
}

export async function GET(req: NextRequest) {
  const context = await internalContext('read')
  if (context instanceof NextResponse) return context
  try {
    const search = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 200)
    return NextResponse.json({ experts: await listExperts(context.admin as never, context.gate.fundId, search) })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(req: NextRequest) {
  const context = await internalContext('write')
  if (context instanceof NextResponse) return context
  try {
    const input = parseExpertInput(await readJson(req))
    if (input.scope === 'global' && !mayWriteGlobal(context.gate.fundId, context.gate.role)) {
      throw new ValidationError('Global experts can only be managed through the trusted global-admin path')
    }
    const result = await saveExpert({
      admin: context.admin as never,
      fundId: context.gate.fundId,
      userId: context.gate.userId,
      allowGlobalWrite: mayWriteGlobal(context.gate.fundId, context.gate.role),
      input,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
