import { FUND_TENANT_SLUG_HEADER, isRoutableFundSlug } from './host'
import { resolveTenantDescriptor, type TenantDescriptor } from './descriptor'

interface TenantDescriptorRpcClient {
  rpc(
    name: 'resolve_public_fund_host',
    args: { readonly p_slug: string },
  ): PromiseLike<{ readonly data: unknown; readonly error: { readonly message?: string } | null }>
}

export function trustedTenantSlugFromHeaders(requestHeaders: Headers): string | null {
  const slug = requestHeaders.get(FUND_TENANT_SLUG_HEADER)
  return slug && isRoutableFundSlug(slug) ? slug : null
}

export function getTrustedRequestTenant(
  client: TenantDescriptorRpcClient,
  requestHeaders: Headers,
): Promise<TenantDescriptor | null> {
  const slug = trustedTenantSlugFromHeaders(requestHeaders)
  return slug ? resolveTenantDescriptor(client, slug) : Promise.resolve(null)
}

export async function fundMatchesTrustedRequestTenant(
  client: TenantDescriptorRpcClient,
  requestHeaders: Headers,
  fundId: string,
): Promise<boolean> {
  const tenant = await getTrustedRequestTenant(client, requestHeaders)
  return !tenant || tenant.id === fundId
}
