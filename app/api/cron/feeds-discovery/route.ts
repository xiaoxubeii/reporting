import { NextResponse } from 'next/server'

import { scheduleFeedDiscoveryJobs } from '@/lib/background-jobs/feed-discovery-scheduler'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ success: false, error: 'Cron is not configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (new URL(request.url).search.length > 0) {
    return NextResponse.json({ success: false, error: 'Query parameters are not allowed' }, { status: 400 })
  }

  try {
    const outcome = await scheduleFeedDiscoveryJobs()
    return NextResponse.json({ success: true, data: outcome })
  } catch {
    console.error('[cron/feeds-discovery] scheduling failed')
    return NextResponse.json(
      { success: false, error: 'Feed discovery scheduling failed' },
      { status: 503 },
    )
  }
}
