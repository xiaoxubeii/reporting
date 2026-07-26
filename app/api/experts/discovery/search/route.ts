import { NextRequest, NextResponse } from 'next/server'
import { internalContext } from '@/lib/expert-validation/api'
import { discoverExperts } from '@/lib/expert-discovery/service'
import { ExpertDiscoveryInputError, parseDiscoverySearch } from '@/lib/expert-discovery/validation'
import { rateLimit } from '@/lib/rate-limit'
import { assertSameOriginSearchRequest, readSearchJson, SearchRequestBodyError } from '@/lib/search/route-input'
import { loadSearchSourcePolicy } from '@/lib/search/source-policy'

export async function POST(request: NextRequest) {
  try {
    assertSameOriginSearchRequest(request)
    const context = await internalContext('write')
    if (context instanceof NextResponse) return context
    if (context.gate.role !== 'admin') return NextResponse.json({ error: 'Fund admin required' }, { status: 403 })
    const limited = await rateLimit({ key: `expert-discovery:${context.gate.fundId}:${context.gate.userId}`, limit: 6, windowSeconds: 60, databaseFailure: 'deny' })
    if (limited) return limited
    const input = parseDiscoverySearch(await readSearchJson(request))
    const policy = await loadSearchSourcePolicy(context.admin, context.gate.fundId)
    const sourceIds = input.sourceIds.filter(sourceId => policy.specialized[sourceId])
    if (sourceIds.length === 0) return NextResponse.json({ error: 'Selected discovery sources are unavailable' }, { status: 400 })
    return NextResponse.json(await discoverExperts({
      admin: context.admin,
      fundId: context.gate.fundId,
      userId: context.gate.userId,
      query: input.query,
      sourceIds,
      signal: request.signal,
    }))
  } catch (error) {
    if (error instanceof ExpertDiscoveryInputError || error instanceof SearchRequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error instanceof SearchRequestBodyError ? error.status : 400 })
    }
    console.error('[expert-discovery] search failed', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ error: 'Expert discovery could not be completed' }, { status: 500 })
  }
}
