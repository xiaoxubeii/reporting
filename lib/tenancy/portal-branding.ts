import type { PortalFund } from '@/lib/portal-fund'
import type { FundTheme } from '@/lib/theme'

export interface HostPortalBranding {
  readonly id: string
  readonly name: string
  readonly logoUrl: string | null
  readonly theme: FundTheme | null
}

export type PortalBrandingSelection =
  | { readonly allowed: false }
  | { readonly allowed: true; readonly branding: PortalFund | null }

/**
 * Bind Portal chrome to the resolved Host Fund while retaining the existing
 * LP-graph branding in legacy self-host mode. Invited users may not have an
 * active LP Fund yet, so the safe Host descriptor is also their pre-activation
 * branding source.
 */
export function selectPortalBranding(
  tenant: HostPortalBranding | null,
  linkedFund: PortalFund | null,
): PortalBrandingSelection {
  if (tenant && linkedFund && tenant.id !== linkedFund.fundId) {
    return Object.freeze({ allowed: false })
  }
  if (!tenant) return Object.freeze({ allowed: true, branding: linkedFund })

  return Object.freeze({
    allowed: true,
    branding: Object.freeze({
      fundId: tenant.id,
      name: tenant.name,
      logoUrl: tenant.logoUrl,
      theme: tenant.theme,
    }),
  })
}
