import { NextRequest, NextResponse } from 'next/server'

import {
  BackgroundJobDispatcherError,
  dispatchBackgroundJobs,
} from '@/lib/background-jobs/dispatcher'

/**
 * Croner authenticates here with CRON_SECRET. This endpoint claims jobs from
 * the code-owned registry and gives every HTTP worker call a short-lived token.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  try {
    const result = await dispatchBackgroundJobs({
      authorization: request.headers.get('authorization'),
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof BackgroundJobDispatcherError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[cron/background-jobs] background dispatcher failed')
    return NextResponse.json({ error: 'Background job dispatch failed' }, { status: 500 })
  }
}
