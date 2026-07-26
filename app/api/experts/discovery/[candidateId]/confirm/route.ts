import { NextRequest, NextResponse } from 'next/server'
import { internalContext } from '@/lib/expert-validation/api'
import { confirmCandidate } from '@/lib/expert-discovery/service'
import { ExpertDiscoveryInputError, parseConfirmation } from '@/lib/expert-discovery/validation'
import { rateLimit } from '@/lib/rate-limit'
import { assertSameOriginSearchRequest, readSearchJson, SearchRequestBodyError } from '@/lib/search/route-input'

export async function POST(request: NextRequest, { params }: { params: { candidateId: string } }) {
  try {
    assertSameOriginSearchRequest(request)
    const context = await internalContext('write')
    if (context instanceof NextResponse) return context
    if (context.gate.role !== 'admin') return NextResponse.json({ error: 'Fund admin required' }, { status: 403 })
    const limited = await rateLimit({ key: `expert-confirm:${context.gate.fundId}:${context.gate.userId}`, limit: 20, windowSeconds: 60, databaseFailure: 'deny' })
    if (limited) return limited
    const input = parseConfirmation(await readSearchJson(request))
    return NextResponse.json(await confirmCandidate({ admin: context.admin, fundId: context.gate.fundId, userId: context.gate.userId, candidateId: params.candidateId, input }))
  } catch (error) {
    if (error instanceof ExpertDiscoveryInputError || error instanceof SearchRequestBodyError) return NextResponse.json({ error: error.message }, { status: error instanceof SearchRequestBodyError ? error.status : 400 })
    const message = error instanceof Error ? error.message : ''
    if (/already exists|duplicate/i.test(message)) return NextResponse.json({ error: 'An expert with this email already exists in your fund' }, { status: 409 })
    if (/rejected candidate|candidate expert link is invalid|not eligible/i.test(message)) return NextResponse.json({ error: 'Candidate is not eligible for confirmation' }, { status: 409 })
    if (/not found/i.test(message)) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    console.error('[expert-discovery] confirm failed', message)
    return NextResponse.json({ error: 'Candidate could not be confirmed' }, { status: 500 })
  }
}
