import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/crypto'
import { getGoogleCredentials } from '@/lib/google/credentials'
import { canonicalProviderOriginForFundId } from '@/lib/tenancy/links'
import { fundMatchesTrustedRequestTenant } from '@/lib/tenancy/request'
import { canonicalFundRequestUrl } from '@/lib/tenancy/host'
import { safeNextPath } from '@/lib/safe-redirect'
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

  if (!stateParam) return clearStateAndRedirect(req, '/settings?drive_error=missing_params')

  let state
  try {
    state = verifyProviderOAuthState(stateParam, {
      provider: 'google',
      userId: user.id,
      secret: providerOAuthStateSecret(),
    })
  } catch {
    return clearStateAndRedirect(req, '/settings?drive_error=server_error')
  }
  if (!state || req.cookies.get(providerOAuthStateCookieName('google'))?.value !== stateParam) {
    return clearStateAndRedirect(req, '/settings?drive_error=invalid_state')
  }
  if (error) return clearStateAndRedirect(req, resultPath(state.returnTo, 'drive_error', 'consent_denied'))
  if (!code) return clearStateAndRedirect(req, resultPath(state.returnTo, 'drive_error', 'missing_params'))

  const fundId = state.fundId
  const returnTo = safeNextPath(state.returnTo) ?? '/settings'

  // Verify user has access to this fund
  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id, role')
    .eq('user_id', user.id)
    .eq('fund_id', fundId)
    .maybeSingle()

  if (!membership) {
    return clearStateAndRedirect(req, resultPath(returnTo, 'drive_error', 'forbidden'))
  }
  if (membership.role !== 'admin') return clearStateAndRedirect(req, resultPath(returnTo, 'drive_error', 'forbidden'))
  if (!await fundMatchesTrustedRequestTenant(admin, req.headers, fundId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const baseUrl = await canonicalProviderOriginForFundId(admin as never, fundId)

  // Get Google credentials from DB or env
  const creds = await getGoogleCredentials(admin, fundId)
  if (!creds) {
    return clearStateAndRedirect(req, new URL(resultPath(returnTo, 'drive_error', 'not_configured'), baseUrl))
  }

  const redirectUri = `${baseUrl}/api/auth/google/callback`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    console.error('[google-oauth] Token exchange failed:', await tokenRes.text())
    return clearStateAndRedirect(req, new URL(resultPath(returnTo, 'drive_error', 'token_exchange_failed'), baseUrl))
  }

  const tokens = await tokenRes.json()
  const refreshToken = tokens.refresh_token

  if (!refreshToken) {
    return clearStateAndRedirect(req, new URL(resultPath(returnTo, 'drive_error', 'no_refresh_token'), baseUrl))
  }

  // Encrypt and store refresh token using the fund's encryption key
  const { data: settings } = await admin
    .from('fund_settings')
    .select('encryption_key_encrypted')
    .eq('fund_id', fundId)
    .single()

  if (!settings?.encryption_key_encrypted) {
    return clearStateAndRedirect(req, new URL(resultPath(returnTo, 'drive_error', 'no_encryption_key'), baseUrl))
  }

  const kek = process.env.ENCRYPTION_KEY
  if (!kek) {
    return clearStateAndRedirect(req, new URL(resultPath(returnTo, 'drive_error', 'server_error'), baseUrl))
  }

  // Decrypt the DEK, then encrypt the refresh token with it
  const { decrypt } = await import('@/lib/crypto')
  const dek = decrypt(settings.encryption_key_encrypted, kek)
  const encryptedRefreshToken = encrypt(refreshToken, dek)

  const { error: updateError } = await admin
    .from('fund_settings')
    .update({ google_refresh_token_encrypted: encryptedRefreshToken })
    .eq('fund_id', fundId)
  if (updateError) {
    return clearStateAndRedirect(req, new URL(resultPath(returnTo, 'drive_error', 'server_error'), baseUrl))
  }

  return clearStateAndRedirect(req, new URL(resultPath(returnTo, 'google_connected', 'true'), baseUrl))
}

function resultPath(returnTo: string, key: string, value: string): string {
  const path = safeNextPath(returnTo) ?? '/settings'
  const url = new URL(path, 'https://placeholder.invalid')
  url.searchParams.set(key, value)
  return `${url.pathname}${url.search}${url.hash}`
}

function clearStateAndRedirect(req: NextRequest, destination: string | URL): NextResponse {
  const response = NextResponse.redirect(
    typeof destination === 'string' ? canonicalFundRequestUrl(req, destination) : destination,
  )
  response.cookies.set(providerOAuthStateCookieName('google'), '', {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 0,
  })
  return response
}
