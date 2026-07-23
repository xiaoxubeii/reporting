type BrowserSupabaseUrlOptions = {
  browserUrl?: string
  serverUrl: string
  browserOrigin?: string
  allowRelativeProxy?: boolean
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function resolveBrowserSupabaseUrl({
  browserUrl,
  serverUrl,
  browserOrigin,
  allowRelativeProxy = true,
}: BrowserSupabaseUrlOptions): string {
  const configuredBrowserUrl = browserUrl?.trim()
  if (!configuredBrowserUrl || !allowRelativeProxy) return withoutTrailingSlash(serverUrl)

  const normalizedPath = configuredBrowserUrl.replace(/\/+$/, '')
  const isSafePath = normalizedPath === '/_supabase'
    && !configuredBrowserUrl.includes('\\')

  if (!isSafePath) throw new Error('Invalid Supabase browser URL')
  if (!browserOrigin) return withoutTrailingSlash(serverUrl)

  const origin = new URL(browserOrigin)
  const resolved = new URL(normalizedPath, origin)
  if (resolved.origin !== origin.origin) throw new Error('Invalid Supabase browser URL')

  return withoutTrailingSlash(resolved.toString())
}

export function getBrowserSupabaseUrl(): string {
  return resolveBrowserSupabaseUrl({
    browserUrl: process.env.NEXT_PUBLIC_SUPABASE_BROWSER_URL,
    serverUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    browserOrigin: typeof window === 'undefined' ? undefined : window.location.origin,
    allowRelativeProxy: process.env.NODE_ENV !== 'production',
  })
}
