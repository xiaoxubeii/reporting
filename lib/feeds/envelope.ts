import { NextResponse } from 'next/server'
import { toFeedApiError } from './errors'

export function feedSuccess<T>(data: T, options?: { status?: number; meta?: Record<string, unknown> }) {
  return NextResponse.json({
    success: true,
    data,
    error: null,
    ...(options?.meta ? { meta: options.meta } : {}),
  }, { status: options?.status ?? 200 })
}

export function feedFailure(error: unknown) {
  const safe = toFeedApiError(error)
  return NextResponse.json({
    success: false,
    data: null,
    error: { code: safe.code, message: safe.safeMessage },
  }, { status: safe.status })
}
