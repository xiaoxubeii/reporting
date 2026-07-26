/* eslint-disable @typescript-eslint/no-explicit-any -- focused Supabase query doubles */
import { describe, expect, it, vi } from 'vitest'
import { insertInboundDealIdempotently } from './processDeal'

describe('processDeal inbound email idempotency', () => {
  it('loads the winning Deal after a concurrent email_id unique conflict', async () => {
    const insertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate email_id' },
    })
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'deal-existing', thesis_fit_score: 'out_of_thesis' },
      error: null,
    })
    const insertBuilder = { select: vi.fn(() => ({ single: insertSingle })) }
    const selectBuilder: any = {
      eq: vi.fn(() => selectBuilder),
      maybeSingle,
    }
    const from = vi.fn(() => ({
      insert: vi.fn(() => insertBuilder),
      select: vi.fn(() => selectBuilder),
    }))

    await expect(insertInboundDealIdempotently(
      { from } as never,
      {
        email_id: 'email-1',
        fund_id: 'fund-1',
        research_status: 'skipped',
        status: 'new',
      } as never,
    )).resolves.toEqual({
      id: 'deal-existing',
      thesisFitScore: 'out_of_thesis',
      reused: true,
    })

    expect(maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('does not hide non-unique insert failures behind an existing-row lookup', async () => {
    const maybeSingle = vi.fn()
    const insertBuilder = {
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '42501', message: 'denied' },
        }),
      })),
    }
    const from = vi.fn(() => ({
      insert: vi.fn(() => insertBuilder),
      select: vi.fn(() => ({ eq: vi.fn(), maybeSingle })),
    }))

    await expect(insertInboundDealIdempotently(
      { from } as never,
      { email_id: 'email-1', fund_id: 'fund-1' } as never,
    )).resolves.toBeNull()
    expect(maybeSingle).not.toHaveBeenCalled()
  })
})
