import type { FundHostContext } from './host'

export type FundHostRouteAuthority = 'legacy' | 'tenant' | 'platform' | 'worker' | 'webhook'

export type FundHostRouteAdmission =
  | { allowed: true; authority: FundHostRouteAuthority }
  | {
      allowed: false
      reason:
        | 'invalid-host'
        | 'platform-route-on-tenant'
        | 'fund-creation-on-tenant'
        | 'system-route-on-tenant'
        | 'tenant-route-on-platform'
        | 'unregistered-system-route'
    }

const PLATFORM_PAGE_PREFIXES = [
  '/auth',
  '/onboarding',
  '/setup',
  '/settings/personal',
] as const

const PLATFORM_PAGE_PATHS = new Set([
  '/',
  '/contact',
  '/demo',
  '/license',
  '/pending',
  '/pricing',
  '/privacy',
  '/terms',
])

const PLATFORM_API_PREFIXES = [
  '/api/onboarding/',
  '/api/settings/personal',
] as const

const PLATFORM_API_PATHS = new Set([
  '/api/auth/activity',
  '/api/auth/branding',
  '/api/auth/logout',
  '/api/auth/signup',
])

function hasPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)
}

function isWorkerRoute(pathname: string, method: string, hasBackgroundAuthorization: boolean): boolean {
  if (pathname.startsWith('/api/cron/')) return method === 'GET'
  if (method !== 'POST') return false
  if (pathname.startsWith('/api/internal/')) return true
  return pathname === '/api/search' && hasBackgroundAuthorization
}

function isWorkerPath(pathname: string, hasBackgroundAuthorization: boolean): boolean {
  return pathname.startsWith('/api/cron/')
    || pathname.startsWith('/api/internal/')
    || (pathname === '/api/search' && hasBackgroundAuthorization)
}

function isWebhookRoute(pathname: string, method: string): boolean {
  return method === 'POST'
    && (
      pathname === '/api/inbound-email'
      || pathname.startsWith('/api/inbound-email/')
      || pathname.startsWith('/api/webhooks/')
    )
}

function isPlatformRoute(pathname: string): boolean {
  if (PLATFORM_PAGE_PATHS.has(pathname) || pathname.endsWith('-explainer')) return true
  if (pathname.startsWith('/.well-known/')) return true
  if (pathname === '/api/setup' || pathname === '/api/locale') return true
  if (pathname === '/api/oauth/register' || pathname.startsWith('/api/oauth/metadata/')) return true
  if (PLATFORM_API_PATHS.has(pathname)) return true
  if (PLATFORM_PAGE_PREFIXES.some(prefix => hasPathPrefix(pathname, prefix))) return true
  return PLATFORM_API_PREFIXES.some(prefix => hasPathPrefix(pathname, prefix))
}

/**
 * Pure hosted-mode admission registry. It deliberately runs before session
 * refresh or alternate-auth bypasses; the selected authority still has to pass
 * its existing session, token, cron, Job Token, or provider authentication.
 */
export function admitFundHostRoute(
  host: FundHostContext,
  pathname: string,
  rawMethod: string,
  hasBackgroundAuthorization = false,
): FundHostRouteAdmission {
  const method = rawMethod.toUpperCase()
  if (host.mode === 'legacy') return { allowed: true, authority: 'legacy' }
  if (host.mode === 'invalid') return { allowed: false, reason: 'invalid-host' }

  const worker = isWorkerRoute(pathname, method, hasBackgroundAuthorization)
  const workerPath = isWorkerPath(pathname, hasBackgroundAuthorization)
  const webhook = isWebhookRoute(pathname, method)

  if (host.mode === 'tenant') {
    if (workerPath || webhook) return { allowed: false, reason: 'system-route-on-tenant' }
    if (pathname === '/setup' || pathname === '/api/setup') {
      return { allowed: false, reason: 'platform-route-on-tenant' }
    }
    if (pathname === '/api/onboarding/fund' && method === 'POST') {
      return { allowed: false, reason: 'fund-creation-on-tenant' }
    }
    return { allowed: true, authority: 'tenant' }
  }

  if (host.mode === 'platform') {
    if (worker) return { allowed: true, authority: 'worker' }
    if (webhook) return { allowed: true, authority: 'webhook' }
    if (isPlatformRoute(pathname)) return { allowed: true, authority: 'platform' }
    return { allowed: false, reason: 'tenant-route-on-platform' }
  }

  if (host.label === 'internal' && worker) return { allowed: true, authority: 'worker' }
  if (host.label === 'hooks' && webhook) return { allowed: true, authority: 'webhook' }
  return { allowed: false, reason: 'unregistered-system-route' }
}
