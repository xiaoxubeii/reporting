import { describe, expect, it, vi } from 'vitest'

import { createSupabaseBackgroundJobResourceValidator } from './authority'

const FUND_ID = '2621143a-c9c3-4079-b52d-a9a935332ff5'
const JOB_ID = '842e532a-b848-457a-9b8e-4d6d8da10caf'

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

    await expect(validate({ jobId: JOB_ID, kind: 'feed_discovery', payload: {}, fundId: FUND_ID })).resolves.toBeUndefined()
    expect(database.from).toHaveBeenCalledWith('fund_settings')
    expect(database.select).toHaveBeenCalledWith('fund_id')
    expect(database.eq).toHaveBeenCalledWith('fund_id', FUND_ID)
  })

  it('fails closed when the persisted Feed Discovery fund is unavailable', async () => {
    const database = admin({ data: null, error: null })
    const validate = createSupabaseBackgroundJobResourceValidator(database.client)
    await expect(validate({ jobId: JOB_ID, kind: 'feed_discovery', payload: {}, fundId: FUND_ID }))
      .rejects.toThrow('Feed Discovery fund is unavailable')
  })

  it('authorizes Memo Research only for the exact linked job, deal, draft, fund, and ingestion output', async () => {
    const memoJobId = 'b898d919-d79f-482d-9faf-c59d3994be1f'
    const dealId = 'f13aa191-56ac-4fb8-8eaa-bce047791467'
    const draftId = '77630c6e-6229-4203-8db4-f4be1c3046c7'
    const database = memoAdmin({
      memo: { id: memoJobId, background_job_id: JOB_ID, fund_id: FUND_ID, deal_id: dealId, draft_id: draftId, kind: 'research', status: 'pending' },
      draft: { id: draftId, fund_id: FUND_ID, deal_id: dealId, is_draft: true, ingestion_output: { documents: [] } },
    })
    const validate = createSupabaseBackgroundJobResourceValidator(database as never)
    await expect(validate({
      jobId: JOB_ID,
      kind: 'memo_research',
      payload: { memoJobId, dealId, draftId },
      fundId: FUND_ID,
    })).resolves.toBeUndefined()
  })

  it('rejects a cross-job Memo projection before execution', async () => {
    const memoJobId = 'b898d919-d79f-482d-9faf-c59d3994be1f'
    const dealId = 'f13aa191-56ac-4fb8-8eaa-bce047791467'
    const draftId = '77630c6e-6229-4203-8db4-f4be1c3046c7'
    const database = memoAdmin({
      memo: { id: memoJobId, background_job_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fund_id: FUND_ID, deal_id: dealId, draft_id: draftId, kind: 'research', status: 'pending' },
      draft: { id: draftId, fund_id: FUND_ID, deal_id: dealId, is_draft: true, ingestion_output: { documents: [] } },
    })
    const validate = createSupabaseBackgroundJobResourceValidator(database as never)
    await expect(validate({ jobId: JOB_ID, kind: 'memo_research', payload: { memoJobId, dealId, draftId }, fundId: FUND_ID }))
      .rejects.toThrow('resource mismatch')
  })
})

function memoAdmin(rows: Readonly<{ memo: Record<string, unknown> | null; draft: Record<string, unknown> | null }>) {
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: table === 'memo_agent_jobs' ? rows.memo : rows.draft,
          error: null,
        }),
      }
      return builder
    },
  }
}
