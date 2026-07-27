import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { assertAdminAccess } from '@/lib/api-helpers'
import { IdentityOnboardingError } from '@/lib/identity/errors'
import { identityErrorResponse } from '@/lib/identity/http'
import { mintPostmarkWebhookCredential } from '@/lib/email/postmark-webhook-token'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { fundMatchesTrustedRequestTenant } from '@/lib/tenancy/request'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const gate = await assertAdminAccess(admin, user.id)
  if (gate instanceof NextResponse) return gate
  if (!(await fundMatchesTrustedRequestTenant(admin as never, new Headers(headers()), gate.fundId))) {
    return NextResponse.json({ error: 'Fund not found' }, { status: 404 })
  }

  const limited = await rateLimit({
    key: `postmark-webhook-token:${gate.fundId}:${user.id}:${getClientIp(request)}`,
    limit: 10,
    windowSeconds: 3600,
    databaseFailure: 'deny',
  })
  if (limited) return limited

  try {
    const masterKey = process.env.ENCRYPTION_KEY?.trim()
    if (!masterKey) throw new IdentityOnboardingError('encryption_unavailable', 'Token rotation is temporarily unavailable.', 503)

    const settings = await admin
      .from('fund_settings')
      .select('encryption_key_encrypted')
      .eq('fund_id', gate.fundId)
      .maybeSingle()
    if (settings.error || !settings.data?.encryption_key_encrypted) {
      throw new IdentityOnboardingError('storage_unavailable', 'Token rotation is temporarily unavailable.', 503)
    }

    const credential = mintPostmarkWebhookCredential(settings.data.encryption_key_encrypted, masterKey)
    const updated = await admin
      .from('fund_settings')
      .update({
        postmark_webhook_token: null,
        postmark_webhook_token_encrypted: credential.encryptedToken,
      })
      .eq('fund_id', gate.fundId)
      .select('fund_id')
      .maybeSingle()
    if (updated.error || !updated.data) {
      throw new IdentityOnboardingError('storage_unavailable', 'Token rotation is temporarily unavailable.', 503)
    }

    return NextResponse.json({ webhookToken: credential.rawToken })
  } catch (error) {
    return identityErrorResponse(error, 'settings-postmark-webhook-token')
  }
}
