import { describe, expect, it, vi } from 'vitest'
import { resolveLpActivationFundId } from './lp-activation'

const FUND_ALPHA = '82000000-0000-4000-8000-000000000001'
const FUND_BETA = '82000000-0000-4000-8000-000000000002'

function client(options: {
  readonly direct?: readonly string[]
  readonly delegatedInvestorIds?: readonly string[]
  readonly investorFunds?: Readonly<Record<string, string>>
}) {
  const from = vi.fn((table: string) => {
    if (table === 'lp_account_links') {
      return {
        select: () => ({
          eq: async () => ({ data: (options.direct ?? []).map(fund_id => ({ fund_id })), error: null }),
        }),
      }
    }
    if (table === 'lp_authorized_users') {
      return {
        select: () => ({
          eq: async () => ({
            data: (options.delegatedInvestorIds ?? []).map(lp_investor_id => ({ lp_investor_id })),
            error: null,
          }),
        }),
      }
    }
    if (table === 'lp_investors') {
      return {
        select: () => ({
          in: async (_column: string, ids: readonly string[]) => ({
            data: ids.map(id => ({ id, fund_id: options.investorFunds?.[id] })),
            error: null,
          }),
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
  return { from }
}

describe('resolveLpActivationFundId', () => {
  it('resolves a direct invited LP to exactly one Fund', async () => {
    await expect(resolveLpActivationFundId(client({ direct: [FUND_ALPHA] }) as never, 'account-1'))
      .resolves.toBe(FUND_ALPHA)
  })

  it('resolves an invited delegated user through the authorized investor', async () => {
    await expect(resolveLpActivationFundId(client({
      delegatedInvestorIds: ['investor-1'],
      investorFunds: { 'investor-1': FUND_ALPHA },
    }) as never, 'account-1')).resolves.toBe(FUND_ALPHA)
  })

  it('fails closed for missing or ambiguous Fund links', async () => {
    await expect(resolveLpActivationFundId(client({}) as never, 'account-1')).resolves.toBeNull()
    await expect(resolveLpActivationFundId(client({ direct: [FUND_ALPHA, FUND_BETA] }) as never, 'account-1'))
      .resolves.toBeNull()
  })
})
