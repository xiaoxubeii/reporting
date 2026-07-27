import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDropboxCredentials } from '@/lib/dropbox/credentials'
import { canonicalProviderOriginForFundId } from '@/lib/tenancy/links'
import { fundMatchesTrustedRequestTenant } from '@/lib/tenancy/request'
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

  const creds = await getDropboxCredentials(admin, membership.fund_id)
  if (!creds) {
    return NextResponse.json({
      error: 'Dropbox not configured. Add your Dropbox App Key and App Secret in Settings.',
    }, { status: 400 })
  }

  const baseUrl = await canonicalProviderOriginForFundId(admin as never, membership.fund_id)
  const redirectUri = `${baseUrl}/api/auth/dropbox/callback`

  let state: string
  try {
    state = createProviderOAuthState({
      provider: 'dropbox',
      fundId: membership.fund_id,
      userId: user.id,
      returnTo: '/settings',
      secret: providerOAuthStateSecret(),
    })
  } catch {
    return NextResponse.json({ error: 'Dropbox OAuth is not available' }, { status: 503 })
  }

  const params = new URLSearchParams({
    client_id: creds.appKey,
    redirect_uri: redirectUri,
    response_type: 'code',
    token_access_type: 'offline',
    state,
  })

  const response = NextResponse.redirect(`https://www.dropbox.com/oauth2/authorize?${params}`)
  response.cookies.set(providerOAuthStateCookieName('dropbox'), state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 600,
  })
  return response
}
