export type TenantIdentityMatch =
  | { readonly matches: true; readonly identityFundId: string | null }
  | { readonly matches: false; readonly identityFundId: string | null }

export function matchAuthenticatedIdentityToTenant(
  tenantFundId: string | null,
  gpFundId: string | null,
  lpFundId: string | null,
): TenantIdentityMatch {
  const identityFunds = Array.from(new Set([gpFundId, lpFundId].filter((id): id is string => Boolean(id))))
  if (identityFunds.length > 1) return { matches: false, identityFundId: null }
  const identityFundId = identityFunds[0] ?? null
  if (!tenantFundId || !identityFundId) return { matches: true, identityFundId }
  return { matches: tenantFundId === identityFundId, identityFundId }
}
