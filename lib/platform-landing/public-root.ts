import type { FundHostContext } from '@/lib/tenancy/host'

export type PublicRootSurface = 'platform-landing' | 'tenant-home' | 'public-shell'

export function publicRootSurface(
  hostContext: FundHostContext,
  pathname: string,
): PublicRootSurface {
  if (pathname === '/' && hostContext.mode === 'platform') return 'platform-landing'
  if (pathname === '/' && hostContext.mode === 'tenant') return 'tenant-home'
  return 'public-shell'
}
