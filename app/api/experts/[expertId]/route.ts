import { NextRequest, NextResponse } from 'next/server'
import { apiError, internalContext } from '@/lib/expert-validation/api'
import { saveExpert } from '@/lib/expert-validation/service'
import { mayManagePlatformExperts } from '@/lib/expert-validation/platform-admin'
import { parseExpertInput, ValidationError } from '@/lib/expert-validation/validation'
import { rateLimit } from '@/lib/rate-limit'
import { assertSameOriginSearchRequest, readSearchJson, SearchRequestBodyError } from '@/lib/search/route-input'

export async function GET(_req: NextRequest, { params }: { params: { expertId: string } }) {
  const context = await internalContext('write')
  if (context instanceof NextResponse) return context
  if (context.gate.role !== 'admin') return NextResponse.json({ error: 'Fund admin required' }, { status: 403 })
  const allowGlobalWrite = mayManagePlatformExperts(context.gate.fundId, context.gate.role)
  let query = context.admin.from('experts')
    .select('id, name, email, title, organization, profile_text, status')
    .eq('id', params.expertId)
  query = allowGlobalWrite
    ? query.or(`scope.eq.global,and(scope.eq.fund,fund_id.eq.${context.gate.fundId})`)
    : query.eq('scope', 'fund').eq('fund_id', context.gate.fundId)
  const { data, error } = await query.maybeSingle()
  if (error) return apiError(error)
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ expert: { ...data, profileText: data.profile_text, profile_text: undefined } })
}

export async function PATCH(req: NextRequest, { params }: { params: { expertId: string } }) {
  try {
    assertSameOriginSearchRequest(req)
    const context = await internalContext('write')
    if (context instanceof NextResponse) return context
    if (context.gate.role !== 'admin') return NextResponse.json({ error: 'Fund admin required' }, { status: 403 })
    const limited = await rateLimit({ key: `expert-update:${context.gate.fundId}:${context.gate.userId}`, limit: 30, windowSeconds: 60, databaseFailure: 'deny' })
    if (limited) return limited
    const input = parseExpertInput(await readSearchJson(req, 32_000))
    const allowGlobalWrite = mayManagePlatformExperts(context.gate.fundId, context.gate.role)
    if (input.scope === 'global' && !allowGlobalWrite) throw new ValidationError('Platform experts are read-only')
    const result = await saveExpert({
      admin: context.admin as never,
      fundId: context.gate.fundId,
      userId: context.gate.userId,
      expertId: params.expertId,
      allowGlobalWrite,
      input,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SearchRequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status })
    return apiError(error)
  }
}
