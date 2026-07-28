import type { NextRequest } from 'next/server'
import { canonicalFundRequestOrigin } from '@/lib/tenancy/host'

function httpOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
  } catch { return null }
}

function requestAuthority(request: NextRequest): string | null {
  const raw = request.headers.get('host') ?? request.nextUrl.host
  if (!raw || raw !== raw.trim() || /[\s,\\/@]/.test(raw) || raw.includes('://')) return null
  try {
    const parsed = new URL(`${request.nextUrl.protocol}//${raw}`)
    return parsed.host.toLowerCase() === raw.toLowerCase() ? parsed.host.toLowerCase() : null
  } catch { return null }
}

export function isTrustedRequestHost(request: NextRequest): boolean {
  const authority = requestAuthority(request)
  if (!authority) return false
  if (process.env.FUND_WORKSPACE_ROOT_DOMAIN?.trim()) {
    try { return new URL(canonicalFundRequestOrigin(request)).host.toLowerCase() === authority } catch { return false }
  }
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) {
    const origin = httpOrigin(configured)
    return origin !== null && new URL(origin).host.toLowerCase() === authority
  }
  if (process.env.NODE_ENV === 'production') return false
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`${request.nextUrl.protocol}//${authority}`).hostname)
  } catch { return false }
}

export function isTrustedSameOriginRequest(request: NextRequest): boolean {
  if (!isTrustedRequestHost(request)) return false
  const supplied = httpOrigin(request.headers.get('origin') ?? '')
  if (!supplied) return false
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin') return false
  if (process.env.FUND_WORKSPACE_ROOT_DOMAIN?.trim()) {
    try { return supplied === canonicalFundRequestOrigin(request) } catch { return false }
  }
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return supplied === httpOrigin(configured)
  return process.env.NODE_ENV !== 'production' && supplied === `${request.nextUrl.protocol}//${requestAuthority(request)}`
}
