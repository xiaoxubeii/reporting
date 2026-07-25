import { describe, expect, it, vi } from 'vitest'

import { queueDealResearch, type DealResearchQueueRepository } from './research-queue'

const DEAL_ID = 'f13aa191-56ac-4fb8-8eaa-bce047791467'
const FUND_ID = '2621143a-c9c3-4079-b52d-a9a935332ff5'
const USER_ID = 'd5d51b4e-c84d-42d5-9aee-7eb69a062907'

function repository(overrides: Partial<DealResearchQueueRepository> = {}): DealResearchQueueRepository {
  return {
    loadDeal: vi.fn(async () => ({ id: DEAL_ID, fundId: FUND_ID, researchStatus: 'skipped' })),
    isEnabled: vi.fn(async () => true),
    loadActiveJob: vi.fn(async () => null),
    enqueue: vi.fn(async () => ({ id: '842e532a-b848-457a-9b8e-4d6d8da10caf', status: 'pending' })),
    projectPending: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('queueDealResearch', () => {
  it('persists the Session-derived user actor and deterministic active dedupe key', async () => {
    const repo = repository()
    const result = await queueDealResearch({
      dealId: DEAL_ID,
      fundId: FUND_ID,
      actor: { type: 'user', userId: USER_ID },
    }, repo)

    expect(result).toMatchObject({ queued: true, already: false })
    expect(repo.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'deal_research',
      fundId: FUND_ID,
      payload: { dealId: DEAL_ID },
      actor: { type: 'user', userId: USER_ID },
      dedupeKey: `deal_research:${DEAL_ID}`,
    }))
    expect(repo.projectPending).toHaveBeenCalledWith(DEAL_ID, FUND_ID)
  })

  it('returns an existing system job before a user enqueue can conflict with its authority', async () => {
    const repo = repository({
      loadDeal: vi.fn(async () => ({ id: DEAL_ID, fundId: FUND_ID, researchStatus: 'pending' })),
      loadActiveJob: vi.fn(async () => ({ id: '842e532a-b848-457a-9b8e-4d6d8da10caf', status: 'running' })),
    })
    const result = await queueDealResearch({
      dealId: DEAL_ID,
      fundId: FUND_ID,
      actor: { type: 'user', userId: USER_ID },
    }, repo)
    expect(result).toEqual({ queued: true, already: true, jobId: '842e532a-b848-457a-9b8e-4d6d8da10caf' })
    expect(repo.enqueue).not.toHaveBeenCalled()
    expect(repo.projectPending).not.toHaveBeenCalled()
  })

  it('resolves the winning active job when concurrent user enqueues race', async () => {
    const activeJob = { id: '842e532a-b848-457a-9b8e-4d6d8da10caf', status: 'pending' }
    const loadActiveJob = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(activeJob)
    const repo = repository({
      loadActiveJob,
      enqueue: vi.fn(async () => { throw { code: '23505' } }),
    })

    const result = await queueDealResearch({
      dealId: DEAL_ID,
      fundId: FUND_ID,
      actor: { type: 'user', userId: USER_ID },
    }, repo)

    expect(result).toEqual({ queued: true, already: true, jobId: activeJob.id })
    expect(loadActiveJob).toHaveBeenCalledTimes(2)
    expect(repo.projectPending).not.toHaveBeenCalled()
  })

  it('denies missing/foreign deals and disabled Research before enqueue', async () => {
    for (const repo of [
      repository({ loadDeal: vi.fn(async () => null) }),
      repository({ loadDeal: vi.fn(async () => ({ id: DEAL_ID, fundId: '8ae39994-a5f0-4e69-9a04-ff5360fac782', researchStatus: null })) }),
      repository({ isEnabled: vi.fn(async () => false) }),
    ]) {
      await expect(queueDealResearch({ dealId: DEAL_ID, fundId: FUND_ID, actor: { type: 'system' } }, repo))
        .rejects.toMatchObject({ code: expect.stringMatching(/not_found|disabled/) })
      expect(repo.enqueue).not.toHaveBeenCalled()
    }
  })
})
