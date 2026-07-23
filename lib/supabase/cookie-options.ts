type SupabaseCookieOptions = {
  name?: string
  path?: string
  sameSite?: 'lax'
  secure?: boolean
}

export function resolveSupabaseCookieOptions(
  rawCookieName: string | undefined,
  required = false,
): SupabaseCookieOptions | undefined {
  const cookieName = rawCookieName?.trim()
  if (!cookieName) {
    if (required) throw new Error('Supabase cookie name is required with the browser proxy')
    return undefined
  }

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(cookieName)) {
    throw new Error('Invalid Supabase cookie name')
  }

  return { name: cookieName }
}

export function getSupabaseCookieOptions(): SupabaseCookieOptions {
  const browserUrl = process.env.NEXT_PUBLIC_SUPABASE_BROWSER_URL?.trim().replace(/\/+$/, '')
  const browserProxyEnabled = process.env.NODE_ENV !== 'production'
    && browserUrl === '/_supabase'

  const resolved = resolveSupabaseCookieOptions(
    process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME,
    browserProxyEnabled,
  )

  return {
    ...resolved,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  }
}
