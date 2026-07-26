import { NextRequest, NextResponse } from 'next/server'
import { apiError, internalContext } from '@/lib/expert-validation/api'
import { listExperts, saveExpert } from '@/lib/expert-validation/service'
import { mayManagePlatformExperts } from '@/lib/expert-validation/platform-admin'
import { parseExpertInput, ValidationError } from '@/lib/expert-validation/validation'
import { rateLimit } from '@/lib/rate-limit'
import { assertSameOriginSearchRequest, readSearchJson, SearchRequestBodyError } from '@/lib/search/route-input'

export async function GET(req: NextRequest) {
  const context = await internalContext('read')
  if (context instanceof NextResponse) return context
  try {
    const search = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 200)
    const includeInactiveFund = req.nextUrl.searchParams.get('includeInactive') === '1' && context.gate.role === 'admin'
    return NextResponse.json({ experts: await listExperts(context.admin as never, context.gate.fundId, search, { includeInactiveFund }) })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOriginSearchRequest(req)
    const context = await internalContext('write')
    if (context instanceof NextResponse) return context
    if (context.gate.role !== 'admin') return NextResponse.json({ error: 'Fund admin required' }, { status: 403 })
    const limited = await rateLimit({ key: `expert-create:${context.gate.fundId}:${context.gate.userId}`, limit: 20, windowSeconds: 60, databaseFailure: 'deny' })
    if (limited) return limited
    const input = parseExpertInput(await readSearchJson(req, 32_000))
    const allowGlobalWrite = mayManagePlatformExperts(context.gate.fundId, context.gate.role)
    if (input.scope === 'global' && !allowGlobalWrite) throw new ValidationError('Platform experts are managed by platform operations')
    const result = await saveExpert({
      admin: context.admin as never,
      fundId: context.gate.fundId,
      userId: context.gate.userId,
      allowGlobalWrite,
      input,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof SearchRequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status })
    return apiError(error)
  }
}
