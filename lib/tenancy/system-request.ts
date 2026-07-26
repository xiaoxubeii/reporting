import type { NextRequest } from 'next/server'
import { classifyFundRequestHost } from './host'
import { admitFundHostRoute } from './route-authority'

export function admitsRegisteredSystemRequest(request: NextRequest): boolean {
  try {
    const host = classifyFundRequestHost(request)
    return admitFundHostRoute(
      host,
      request.nextUrl.pathname,
      request.method,
      request.headers.has('authorization'),
    ).allowed
  } catch {
    return false
  }
}
