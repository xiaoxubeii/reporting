import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { readJson } from '@/lib/expert-validation/api'
import { materializeExpertResponse, recordMaterializationError } from '@/lib/expert-validation/materialize'
import { PUBLIC_INVITATION_ERROR, rateKey, submitPublicResponse, validateRawToken } from '@/lib/expert-validation/public'
import { parseResponse } from '@/lib/expert-validation/validation'
import { getTrustedRequestTenant } from '@/lib/tenancy/request'

export async function POST(req: NextRequest) {
  const ipLimited = await rateLimit({ key: rateKey('ip', getClientIp(req)), limit: 12, windowSeconds: 900 })
  if (ipLimited) return secure(ipLimited)
  try {
    const body = await readJson(req, 55_000) as Record<string, unknown>
    const token = validateRawToken(body.token)
    const tokenLimited = await rateLimit({ key: rateKey('token', token), limit: 8, windowSeconds: 900 })
    if (tokenLimited) return secure(tokenLimited)
    const responseMarkdown = parseResponse(body)
    const adminClient = createAdminClient()
    const tenant = await getTrustedRequestTenant(adminClient as never, req.headers)
    const admin = adminClient as never
    const submission = await submitPublicResponse({
      admin,
      rawToken: token,
      responseMarkdown,
      expectedFundId: tenant?.id,
    })
    if (!submission.alreadySubmitted) {
      try {
        await materializeExpertResponse({ admin, requestId: submission.requestId })
      } catch (error) {
        await recordMaterializationError(admin, submission.requestId, error)
      }
    }
    return secure(NextResponse.json({ submitted: true, submitted_at: submission.submittedAt }))
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
