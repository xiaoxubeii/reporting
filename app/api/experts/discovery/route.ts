import { NextRequest, NextResponse } from 'next/server'
import { apiError, internalContext } from '@/lib/expert-validation/api'
import { listCandidates } from '@/lib/expert-discovery/service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const context = await internalContext('write')
  if (context instanceof NextResponse) return context
  if (context.gate.role !== 'admin') return NextResponse.json({ error: 'Fund admin required' }, { status: 403 })
  try {
    const status = request.nextUrl.searchParams.get('status') ?? 'pending'
    if (!['pending', 'confirmed', 'rejected', 'all'].includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    return NextResponse.json({ candidates: await listCandidates(context.admin, context.gate.fundId, status === 'all' ? undefined : status) })
  } catch (error) {
    return apiError(error)
  }
}
