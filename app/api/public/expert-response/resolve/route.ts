import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { readJson } from '@/lib/expert-validation/api'
import { PUBLIC_INVITATION_ERROR, rateKey, resolvePublicInvitation, validateRawToken } from '@/lib/expert-validation/public'
import { getTrustedRequestTenant } from '@/lib/tenancy/request'

export async function POST(req: NextRequest) {
  const ipLimited = await rateLimit({ key: rateKey('ip', getClientIp(req)), limit: 30, windowSeconds: 900 })
  if (ipLimited) return secure(ipLimited)
  try {
    const body = await readJson(req, 2_000) as Record<string, unknown>
    const token = validateRawToken(body.token)
    const tokenLimited = await rateLimit({ key: rateKey('token', token), limit: 20, windowSeconds: 900 })
    if (tokenLimited) return secure(tokenLimited)
    const admin = createAdminClient()
    const tenant = await getTrustedRequestTenant(admin as never, req.headers)
    const invitation = await resolvePublicInvitation(admin as never, token, tenant?.id)
    return secure(NextResponse.json({ invitation }))
  } catch {
    return secure(NextResponse.json({ error: PUBLIC_INVITATION_ERROR }, { status: 404 }))
  }
}

function secure(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  response.headers.set('CDN-Cache-Control', 'no-store')
  response.headers.set('Vercel-CDN-Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
