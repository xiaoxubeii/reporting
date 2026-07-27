export const FUND_TENANT_SLUG_HEADER = 'x-reporting-tenant-slug'
const FORGED_TENANT_FUND_HEADER = 'x-reporting-tenant-fund-id'

export const RESERVED_FUND_SLUGS = new Set([
  'www',
  'api',
  'auth',
  'admin',
  'hooks',
  'internal',
  'support',
  'fundworkspace',
])

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const ROOT_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export type FundHostContext =
  | { mode: 'legacy' }
  | { mode: 'platform'; hostname: string; rootDomain: string }
  | { mode: 'tenant'; hostname: string; rootDomain: string; slug: string }
  | { mode: 'reserved'; hostname: string; rootDomain: string; label: string }
  | { mode: 'invalid'; reason: string }

type FundWorkspaceEnvironment = Record<string, string | undefined>

interface RequestHostSource {
  readonly headers: Pick<Headers, 'get'>
  readonly nextUrl?: { readonly host: string }
  readonly url?: string
}

interface RequestOriginSource extends RequestHostSource {
  readonly url: string
}

export function isValidFundSlug(value: string): boolean {
  return value.length >= 3
    && value.length <= 63
    && DNS_LABEL.test(value)
    && !value.startsWith('xn--')
    && !RESERVED_FUND_SLUGS.has(value)
}

function normalizeRootDomain(rawRoot: string): string {
  const root = rawRoot.trim().toLowerCase().replace(/\.$/, '')
  if (
    !root
    || root.includes(':')
    || root.includes('xn--')
    || !ROOT_DOMAIN.test(root)
    || root.split('.').some(label => label.length > 63)
  ) {
    throw new Error('Invalid Fund workspace root domain')
  }
  return root
}

function normalizeRequestHostname(rawHost: string): string | null {
  if (!rawHost || /[\s,\\/@]/.test(rawHost) || rawHost.includes('://')) return null

  let hostname = rawHost
  const colon = hostname.lastIndexOf(':')
  if (colon !== -1) {
    if (hostname.indexOf(':') !== colon) return null
    const port = hostname.slice(colon + 1)
    if (!/^\d{1,5}$/.test(port) || Number(port) > 65535) return null
    hostname = hostname.slice(0, colon)
  }

  hostname = hostname.toLowerCase().replace(/\.$/, '')
  if (!hostname || hostname.includes('xn--') || !ROOT_DOMAIN.test(hostname)) return null
  return hostname
}

export function classifyFundHost(
  rawHost: string,
  rawRootDomain: string | undefined = process.env.FUND_WORKSPACE_ROOT_DOMAIN,
): FundHostContext {
  if (!rawRootDomain?.trim()) return { mode: 'legacy' }

  const rootDomain = normalizeRootDomain(rawRootDomain)
  const hostname = normalizeRequestHostname(rawHost)
  if (!hostname) return { mode: 'invalid', reason: 'Invalid request hostname' }
  if (hostname === rootDomain) return { mode: 'platform', hostname, rootDomain }
  if (!hostname.endsWith(`.${rootDomain}`)) {
    return { mode: 'invalid', reason: 'Hostname is outside the configured Fund workspace root' }
  }

  const label = hostname.slice(0, -(rootDomain.length + 1))
  if (label.includes('.') || !DNS_LABEL.test(label) || label.startsWith('xn--')) {
    return { mode: 'invalid', reason: 'Invalid Fund tenant label' }
  }
  if (RESERVED_FUND_SLUGS.has(label)) {
    return { mode: 'reserved', hostname, rootDomain, label }
  }
  if (!isValidFundSlug(label)) return { mode: 'invalid', reason: 'Invalid Fund tenant slug' }
  return { mode: 'tenant', hostname, rootDomain, slug: label }
}

/**
 * Read the HTTP authority supplied by the client. Next.js can construct
 * `nextUrl` from an internal listener while the mandatory Host header carries
 * the public Fund hostname. Forwarded-host headers are deliberately ignored;
 * classifyFundHost applies the root allowlist and ambiguity checks.
 */
export function classifyFundRequestHost(
  request: RequestHostSource,
  rawRootDomain: string | undefined = process.env.FUND_WORKSPACE_ROOT_DOMAIN,
): FundHostContext {
  const fallbackHost = request.nextUrl?.host ?? (request.url ? new URL(request.url).host : '')
  return classifyFundHost(request.headers.get('host') ?? fallbackHost, rawRootDomain)
}

export function canonicalFundOrigin(
  slug: string,
  env: FundWorkspaceEnvironment = process.env,
): string {
  const rawRoot = env.FUND_WORKSPACE_ROOT_DOMAIN
  if (!rawRoot?.trim()) throw new Error('Fund workspace root domain is not configured')
  if (!isValidFundSlug(slug)) throw new Error('Invalid Fund slug')

  const root = normalizeRootDomain(rawRoot)
  return canonicalOriginForHostname(`${slug}.${root}`, root, env)
}

export function canonicalPlatformOrigin(
  env: FundWorkspaceEnvironment = process.env,
): string {
  const rawRoot = env.FUND_WORKSPACE_ROOT_DOMAIN
  if (!rawRoot?.trim()) throw new Error('Fund workspace root domain is not configured')
  const root = normalizeRootDomain(rawRoot)
  return canonicalOriginForHostname(root, root, env)
}

export function canonicalFundRequestOrigin(
  request: RequestOriginSource,
  env: FundWorkspaceEnvironment = process.env,
): string {
  const context = classifyFundRequestHost(request, env.FUND_WORKSPACE_ROOT_DOMAIN)
  const fallbackOrigin = new URL(request.url).origin
  const requestEnv = withTrustedLocalRequestPort(request, context, env)
  if (context.mode === 'legacy') return fallbackOrigin
  if (context.mode === 'tenant') return canonicalFundOrigin(context.slug, requestEnv)
  if (context.mode === 'platform') return canonicalPlatformOrigin(requestEnv)
  if (context.mode === 'reserved') {
    return canonicalOriginForHostname(context.hostname, context.rootDomain, requestEnv)
  }
  throw new Error('Invalid Fund request Host')
}

function withTrustedLocalRequestPort(
  request: RequestOriginSource,
  context: FundHostContext,
  env: FundWorkspaceEnvironment,
): FundWorkspaceEnvironment {
  if (context.mode === 'legacy' || context.mode === 'invalid') return env
  if (context.rootDomain !== 'localhost' || env.FUND_WORKSPACE_DEV_PORT?.trim()) return env

  const authority = request.headers.get('host') ?? request.nextUrl?.host ?? new URL(request.url).host
  const colon = authority.lastIndexOf(':')
  if (colon < 0) return env
  const port = authority.slice(colon + 1)
  if (!/^\d{1,5}$/.test(port) || Number(port) > 65535) return env
  return { ...env, FUND_WORKSPACE_DEV_PORT: port }
}

export function canonicalFundRequestUrl(
  request: RequestOriginSource,
  path: string,
  env: FundWorkspaceEnvironment = process.env,
): URL {
  return new URL(path, canonicalFundRequestOrigin(request, env))
}

function canonicalOriginForHostname(
  hostname: string,
  root: string,
  env: FundWorkspaceEnvironment,
): string {
  if (root === 'localhost') {
    const port = env.FUND_WORKSPACE_DEV_PORT?.trim()
    if (port && (!/^\d{1,5}$/.test(port) || Number(port) > 65535)) {
      throw new Error('Invalid Fund workspace development port')
    }
    return `http://${hostname}${port ? `:${port}` : ''}`
  }
  return `https://${hostname}`
}

export function normalizeFundSlugCandidate(name: string): string | null {
  const candidate = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return isValidFundSlug(candidate) ? candidate : null
}

export function sanitizeTenantRequestHeaders(incoming: Headers, trustedSlug?: string): Headers {
  const headers = new Headers(incoming)
  headers.delete(FUND_TENANT_SLUG_HEADER)
  headers.delete(FORGED_TENANT_FUND_HEADER)
  if (trustedSlug) headers.set(FUND_TENANT_SLUG_HEADER, trustedSlug)
  return headers
}
