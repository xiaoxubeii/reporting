import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleResendInboundWebhook } from '@/lib/email/resend-webhook'
import { createResendWebhookRuntime } from '@/lib/email/resend-webhook-runtime'

export async function POST(
  request: Request,
  { params }: { params: { routeToken: string } },
) {
  const admin = createAdminClient()
  const result = await handleResendInboundWebhook(
    request,
    params.routeToken,
    createResendWebhookRuntime(admin),
  )
  return NextResponse.json(result.body, { status: result.status })
}
