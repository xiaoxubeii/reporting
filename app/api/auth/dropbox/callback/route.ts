import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/crypto'
import { getDropboxCredentials } from '@/lib/dropbox/credentials'
import { canonicalProviderOriginForFundId } from '@/lib/tenancy/links'
import { fundMatchesTrustedRequestTenant } from '@/lib/tenancy/request'
import { canonicalFundRequestUrl } from '@/lib/tenancy/host'
import {
  providerOAuthStateCookieName,
  providerOAuthStateSecret,
  verifyProviderOAuthState,
} from '@/lib/provider-oauth-state'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(canonicalFundRequestUrl(req, '/auth'))

  const code = req.nextUrl.searchParams.get('code')
  const stateParam = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (!stateParam) return clearStateAndRedirect(req, '/settings?dropbox_error=missing_params')

  let state
  try {
    state = verifyProviderOAuthState(stateParam, {
      provider: 'dropbox',
      userId: user.id,
      secret: providerOAuthStateSecret(),
    })
  } catch {
    return clearStateAndRedirect(req, '/settings?dropbox_error=server_error')
  }
  if (!state || req.cookies.get(providerOAuthStateCookieName('dropbox'))?.value !== stateParam) {
    return clearStateAndRedirect(req, '/settings?dropbox_error=invalid_state')
  }
  if (error) return clearStateAndRedirect(req, '/settings?dropbox_error=consent_denied')
  if (!code) return clearStateAndRedirect(req, '/settings?dropbox_error=missing_params')

  const fundId = state.fundId

  // Verify user has access to this fund
  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id, role')
    .eq('user_id', user.id)
    .eq('fund_id', fundId)
    .maybeSingle()

  if (!membership) {
    return clearStateAndRedirect(req, '/settings?dropbox_error=forbidden')
  }
  if (membership.role !== 'admin') {
    return clearStateAndRedirect(req, '/settings?dropbox_error=forbidden')
  }
  if (!await fundMatchesTrustedRequestTenant(admin, req.headers, fundId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const baseUrl = await canonicalProviderOriginForFundId(admin as never, fundId)

  const creds = await getDropboxCredentials(admin, fundId)
  if (!creds) {
    return clearStateAndRedirect(req, new URL('/settings?dropbox_error=not_configured', baseUrl))
  }

  const redirectUri = `${baseUrl}/api/auth/dropbox/callback`

  const tokenRes = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.appKey,
      client_secret: creds.appSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    console.error('[dropbox-oauth] Token exchange failed:', await tokenRes.text())
    return clearStateAndRedirect(req, new URL('/settings?dropbox_error=token_exchange_failed', baseUrl))
  }

  const tokens = await tokenRes.json()
  const refreshToken = tokens.refresh_token

  if (!refreshToken) {
    return clearStateAndRedirect(req, new URL('/settings?dropbox_error=no_refresh_token', baseUrl))
  }

  // Encrypt and store refresh token
  const { data: settings } = await admin
    .from('fund_settings')
    .select('encryption_key_encrypted')
    .eq('fund_id', fundId)
    .single()

  if (!settings?.encryption_key_encrypted) {
    return clearStateAndRedirect(req, new URL('/settings?dropbox_error=no_encryption_key', baseUrl))
  }

  const kek = process.env.ENCRYPTION_KEY
  if (!kek) {
    return clearStateAndRedirect(req, new URL('/settings?dropbox_error=server_error', baseUrl))
  }

  const { decrypt } = await import('@/lib/crypto')
  const dek = decrypt(settings.encryption_key_encrypted, kek)
  const encryptedRefreshToken = encrypt(refreshToken, dek)

  const { error: updateError } = await admin
    .from('fund_settings')
    .update({ dropbox_refresh_token_encrypted: encryptedRefreshToken })
    .eq('fund_id', fundId)
  if (updateError) {
    return clearStateAndRedirect(req, new URL('/settings?dropbox_error=server_error', baseUrl))
  }

  return clearStateAndRedirect(req, new URL('/settings?dropbox_connected=true', baseUrl))
}

function clearStateAndRedirect(req: NextRequest, destination: string | URL): NextResponse {
  const response = NextResponse.redirect(
    typeof destination === 'string' ? canonicalFundRequestUrl(req, destination) : destination,
  )
  response.cookies.set(providerOAuthStateCookieName('dropbox'), '', {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 0,
  })
  return response
}
