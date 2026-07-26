import { canonicalFundOrigin } from './host'

interface FundSlugClient {
  from(table: 'funds'): {
    select(columns: 'slug'): {
      eq(column: 'id', value: string): {
        maybeSingle(): PromiseLike<{
          readonly data: { readonly slug?: unknown } | null
          readonly error: { readonly message?: string } | null
        }>
      }
    }
  }
}

export async function canonicalFundOriginForId(
  client: FundSlugClient,
  fundId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  if (!env.FUND_WORKSPACE_ROOT_DOMAIN?.trim()) {
    return validatedLegacyOrigin(
      env.NEXT_PUBLIC_SITE_URL
        || env.NEXT_PUBLIC_APP_URL
        || 'http://localhost:3000',
    )
  }

  const { data, error } = await client
    .from('funds')
    .select('slug')
    .eq('id', fundId)
    .maybeSingle()
  if (error || typeof data?.slug !== 'string') throw new Error('Fund slug not found')
  return canonicalFundOrigin(data.slug, env)
}

/**
 * Provider callbacks historically preferred APP_URL and then VERCEL_URL,
 * whereas public links preferred SITE_URL. Keep that legacy contract while
 * tenant mode converges both on the persisted Fund slug.
 */
export async function canonicalProviderOriginForFundId(
  client: FundSlugClient,
  fundId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  if (env.FUND_WORKSPACE_ROOT_DOMAIN?.trim()) {
    return canonicalFundOriginForId(client, fundId, env)
  }
  const vercelOrigin = env.VERCEL_URL?.trim()
    ? `https://${env.VERCEL_URL.trim()}`
    : undefined
  return validatedLegacyOrigin(
    env.NEXT_PUBLIC_APP_URL
      || vercelOrigin
      || 'http://localhost:3000',
  )
}

function validatedLegacyOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Configured application URL is invalid')
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('Configured application URL must use HTTPS')
  }
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('Configured application URL must be a bare origin')
  }
  return url.origin
}
