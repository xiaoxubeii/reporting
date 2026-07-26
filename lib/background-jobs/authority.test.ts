import { describe, expect, it, vi } from 'vitest'

import { createSupabaseBackgroundJobResourceValidator } from './authority'

const FUND_ID = '2621143a-c9c3-4079-b52d-a9a935332ff5'

function admin(result: Readonly<{ data: { fund_id: string } | null; error: Error | null }>) {
  const maybeSingle = vi.fn(async () => result)
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { client: { from } as never, from, select, eq }
}

describe('background job resource authority', () => {
  it('authorizes Feed Discovery only for the persisted job fund that still exists', async () => {
    const database = admin({ data: { fund_id: FUND_ID }, error: null })
    const validate = createSupabaseBackgroundJobResourceValidator(database.client)

    await expect(validate({ kind: 'feed_discovery', payload: {}, fundId: FUND_ID })).resolves.toBeUndefined()
    expect(database.from).toHaveBeenCalledWith('fund_settings')
    expect(database.select).toHaveBeenCalledWith('fund_id')
    expect(database.eq).toHaveBeenCalledWith('fund_id', FUND_ID)
  })

  it('fails closed when the persisted Feed Discovery fund is unavailable', async () => {
    const database = admin({ data: null, error: null })
    const validate = createSupabaseBackgroundJobResourceValidator(database.client)
    await expect(validate({ kind: 'feed_discovery', payload: {}, fundId: FUND_ID }))
      .rejects.toThrow('Feed Discovery fund is unavailable')
  })
})
