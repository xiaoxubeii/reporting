import { matchAuthenticatedIdentityToTenant } from './identity'
import { resolveLpActivationFundId } from './lp-activation'

interface QueryError {
  readonly message?: string
}

interface QueryResult<T> {
  readonly data: T | null
  readonly error: QueryError | null
}

interface EqQuery<T> {
  eq(column: string, value: string): EqQuery<T>
  maybeSingle(): PromiseLike<QueryResult<T>>
}

interface SelectQuery<T> {
  select(columns: string): EqQuery<T>
}

interface BrowserIdentityAdminClient {
  from(table: 'fund_members'): SelectQuery<{ readonly fund_id: string }>
  from(table: 'lp_accounts'): SelectQuery<{
    readonly id: string
    readonly status: 'active' | 'invited' | 'disabled'
  }>
}

interface BrowserIdentitySessionClient {
  rpc(name: 'resolve_my_lp_fund'): PromiseLike<QueryResult<string>>
}

type LinkedLpFundResolver = (
  client: Parameters<typeof resolveLpActivationFundId>[0],
  accountId: string,
) => Promise<string | null>

export interface BrowserFundIdentity {
  readonly matches: boolean
  readonly identityFundId: string | null
  readonly membershipFundId: string | null
  readonly lpStatus: 'active' | 'invited' | 'disabled' | null
}

/**
 * Resolve every browser identity shape before a newly issued session is used.
 *
 * Active LPs are intentionally resolved through the caller-scoped RPC. Any
 * linked account not returned by that RPC (invited, disabled, or an active
 * account during an RPC failure) is checked against the persisted direct or
 * delegated graph used by activation. Disabled access and resolution failures
 * fail closed; an unaffiliated user with a successful empty lookup may onboard.
 */
export async function resolveBrowserFundIdentity(options: {
  readonly admin: BrowserIdentityAdminClient
  readonly session: BrowserIdentitySessionClient
  readonly userId: string
  readonly tenantFundId: string | null
  readonly resolveLinkedLpFund?: LinkedLpFundResolver
}): Promise<BrowserFundIdentity> {
  const [membershipResult, activeLpResult] = await Promise.all([
    options.admin
      .from('fund_members')
      .select('fund_id')
      .eq('user_id', options.userId)
      .maybeSingle(),
    options.session.rpc('resolve_my_lp_fund'),
  ])
  const membershipFundId = membershipResult.error
    ? null
    : membershipResult.data?.fund_id ?? null
  let lpFundId = activeLpResult.error ? null : activeLpResult.data
  let lpStatus: BrowserFundIdentity['lpStatus'] = lpFundId ? 'active' : null
  let tenantResolutionFailed = Boolean(
    options.tenantFundId && !membershipFundId && (membershipResult.error || activeLpResult.error),
  )

  if (options.tenantFundId && !membershipFundId && !lpFundId) {
    const pendingResult = await options.admin
      .from('lp_accounts')
      .select('id, status')
      .eq('auth_user_id', options.userId)
      .maybeSingle()
    if (pendingResult.error) {
      tenantResolutionFailed = true
    } else if (pendingResult.data) {
      try {
        const resolver = options.resolveLinkedLpFund ?? resolveLpActivationFundId
        lpFundId = await resolver(
          options.admin as unknown as Parameters<typeof resolveLpActivationFundId>[0],
          pendingResult.data.id,
        )
        lpStatus = pendingResult.data.status
        tenantResolutionFailed ||= !lpFundId || lpStatus === 'disabled'
      } catch {
        tenantResolutionFailed = true
      }
    }
  }

  const identity = matchAuthenticatedIdentityToTenant(
    options.tenantFundId,
    membershipFundId,
    lpFundId,
  )
  return {
    matches: identity.matches && !tenantResolutionFailed,
    identityFundId: identity.identityFundId,
    membershipFundId,
    lpStatus,
  }
}
