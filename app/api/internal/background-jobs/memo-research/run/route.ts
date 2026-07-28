import { NextResponse } from 'next/server'

import { executeMemoResearchWorker } from '@/lib/memo-agent/research-worker'

export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const result = await executeMemoResearchWorker(request)
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    console.error('[internal/background-jobs/memo-research] worker failed')
    return NextResponse.json(
      { error: 'Memo Research worker failed' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
