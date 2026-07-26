import { NextResponse } from 'next/server'

import { executeFeedDiscoveryWorker } from '@/lib/background-jobs/feed-discovery-worker'

export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const result = await executeFeedDiscoveryWorker(request)
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    console.error('[internal/background-jobs/feed-discovery] worker failed')
    return NextResponse.json(
      { error: 'Feed Discovery worker failed' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
