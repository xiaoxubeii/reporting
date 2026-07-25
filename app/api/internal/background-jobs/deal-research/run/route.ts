import { NextResponse } from 'next/server'

import { executeDealResearchWorker } from '@/lib/deals/research-worker'

export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const result = await executeDealResearchWorker(request)
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    console.error('[internal/background-jobs/deal-research] worker failed')
    return NextResponse.json(
      { error: 'Deal Research worker failed' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
