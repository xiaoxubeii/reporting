import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleResendInboundWebhook } from '@/lib/email/resend-webhook'
import { createResendWebhookRuntime } from '@/lib/email/resend-webhook-runtime'
import { admitsRegisteredSystemRequest } from '@/lib/tenancy/system-request'

export async function POST(
  request: NextRequest,
  { params }: { params: { routeToken: string } },
) {
  if (!admitsRegisteredSystemRequest(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const admin = createAdminClient()
  const result = await handleResendInboundWebhook(
    request,
    params.routeToken,
    createResendWebhookRuntime(admin),
  )
  return NextResponse.json(result.body, { status: result.status })
}
