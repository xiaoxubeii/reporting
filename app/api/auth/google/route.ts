import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGoogleCredentials } from '@/lib/google/credentials'
import { canonicalProviderOriginForFundId } from '@/lib/tenancy/links'
import { fundMatchesTrustedRequestTenant } from '@/lib/tenancy/request'
import { safeNextPath } from '@/lib/safe-redirect'
import {
  createProviderOAuthState,
  providerOAuthStateCookieName,
  providerOAuthStateSecret,
} from '@/lib/provider-oauth-state'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'No fund found' }, { status: 403 })
  if (membership.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  if (!await fundMatchesTrustedRequestTenant(admin, req.headers, membership.fund_id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const creds = await getGoogleCredentials(admin, membership.fund_id)
  if (!creds) {
    return NextResponse.json({
      error: 'Google OAuth not configured. Add your Google Client ID and Client Secret in Settings.',
    }, { status: 400 })
  }

  const baseUrl = await canonicalProviderOriginForFundId(admin as never, membership.fund_id)
  const redirectUri = `${baseUrl}/api/auth/google/callback`

  // Pass return_to in state so callback knows where to redirect.
  // Cap the length and re-validate the open-redirect guard so a very long or
  // malformed `return_to` query param can't blow past Google's URL-length
  // limit on the auth request (silent OAuth failure) or smuggle a protocol-
  // relative redirect target.
  const rawReturnTo = req.nextUrl.searchParams.get('return_to')
  const returnTo = safeNextPath(rawReturnTo?.slice(0, 200)) ?? '/settings'
  let state: string
  try {
    state = createProviderOAuthState({
      provider: 'google',
      fundId: membership.fund_id,
      userId: user.id,
      returnTo,
      secret: providerOAuthStateSecret(),
    })
  } catch {
    return NextResponse.json({ error: 'Google OAuth is not available' }, { status: 503 })
  }

  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    // drive.readonly lets the app read any file the user can access in Drive
    // — required for "import a folder by URL" to read the contents of files
    // the user didn't explicitly pick via Google Picker. drive.file alone
    // returns 403 on direct API calls to files the app didn't create.
    // drive.file is also kept so files uploaded TO Drive by the app (e.g.
    // rendered memo Google Docs) stay tracked as app-owned.
    // gmail.send permits outbound email send for asks/letters.
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/gmail.send',
    access_type: 'offline',
    // `consent` forces the consent screen so refresh tokens are re-issued
    // even if the user previously authorized. `select_account` forces the
    // account picker first, useful when the browser has multiple Google
    // sessions and the default isn't the one that should own the connection.
    prompt: 'consent select_account',
    state,
  })

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  response.cookies.set(providerOAuthStateCookieName('google'), state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 600,
  })
  return response
}
