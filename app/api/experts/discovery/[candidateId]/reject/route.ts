import { NextRequest, NextResponse } from 'next/server'
import { internalContext } from '@/lib/expert-validation/api'
import { rejectCandidate } from '@/lib/expert-discovery/service'
import { ExpertDiscoveryInputError, parseRejection } from '@/lib/expert-discovery/validation'
import { rateLimit } from '@/lib/rate-limit'
import { assertSameOriginSearchRequest, readSearchJson, SearchRequestBodyError } from '@/lib/search/route-input'

export async function POST(request: NextRequest, { params }: { params: { candidateId: string } }) {
  try {
    assertSameOriginSearchRequest(request)
    const context = await internalContext('write')
    if (context instanceof NextResponse) return context
    if (context.gate.role !== 'admin') return NextResponse.json({ error: 'Fund admin required' }, { status: 403 })
    const limited = await rateLimit({ key: `expert-reject:${context.gate.fundId}:${context.gate.userId}`, limit: 30, windowSeconds: 60, databaseFailure: 'deny' })
    if (limited) return limited
    const { reason } = parseRejection(await readSearchJson(request))
    await rejectCandidate({ admin: context.admin, fundId: context.gate.fundId, userId: context.gate.userId, candidateId: params.candidateId, reason })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ExpertDiscoveryInputError || error instanceof SearchRequestBodyError) return NextResponse.json({ error: error.message }, { status: error instanceof SearchRequestBodyError ? error.status : 400 })
    const message = error instanceof Error ? error.message : ''
    if (/not found/i.test(message)) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    console.error('[expert-discovery] reject failed', message)
    return NextResponse.json({ error: 'Candidate could not be rejected' }, { status: 500 })
  }
}
