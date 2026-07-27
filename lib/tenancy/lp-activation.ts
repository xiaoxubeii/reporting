interface QueryResult<T> {
  readonly data: readonly T[] | null
  readonly error: { readonly message?: string } | null
}

interface LpActivationFundClient {
  from(table: 'lp_account_links'): {
    select(columns: 'fund_id'): {
      eq(column: 'lp_account_id', value: string): PromiseLike<QueryResult<{ readonly fund_id: string }>>
    }
  }
  from(table: 'lp_authorized_users'): {
    select(columns: 'lp_investor_id'): {
      eq(column: 'authorized_user_account_id', value: string): PromiseLike<QueryResult<{ readonly lp_investor_id: string }>>
    }
  }
  from(table: 'lp_investors'): {
    select(columns: 'id, fund_id'): {
      in(column: 'id', values: readonly string[]): PromiseLike<QueryResult<{
        readonly id: string
        readonly fund_id: string
      }>>
    }
  }
}

/**
 * Resolve an invited LP account's persisted Fund before activation.
 *
 * Active LPs use resolve_my_lp_fund() from their authenticated identity. An
 * invited account is not active yet, so the central middleware deliberately
 * lets only /api/portal/activate reach this service-role boundary. The account
 * links remain authoritative and ambiguity fails closed.
 */
export async function resolveLpActivationFundId(
  client: LpActivationFundClient,
  accountId: string,
): Promise<string | null> {
  const [directResult, delegatedResult] = await Promise.all([
    client.from('lp_account_links').select('fund_id').eq('lp_account_id', accountId),
    client
      .from('lp_authorized_users')
      .select('lp_investor_id')
      .eq('authorized_user_account_id', accountId),
  ])
  if (directResult.error || delegatedResult.error) {
    throw new Error('Unable to resolve LP activation Fund')
  }

  const delegatedInvestorIds = Array.from(new Set(
    (delegatedResult.data ?? []).map(row => row.lp_investor_id),
  ))
  const delegatedFunds = delegatedInvestorIds.length === 0
    ? []
    : await loadDelegatedFunds(client, delegatedInvestorIds)
  const fundIds = new Set([
    ...(directResult.data ?? []).map(row => row.fund_id),
    ...delegatedFunds,
  ].filter(Boolean))

  return fundIds.size === 1 ? Array.from(fundIds)[0] : null
}

async function loadDelegatedFunds(
  client: LpActivationFundClient,
  investorIds: readonly string[],
): Promise<readonly string[]> {
  const result = await client.from('lp_investors').select('id, fund_id').in('id', investorIds)
  if (result.error) throw new Error('Unable to resolve delegated LP activation Fund')
  return (result.data ?? []).map(row => row.fund_id)
}
