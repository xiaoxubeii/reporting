import { describe, expect, it, vi } from 'vitest'

import {
  scheduleFeedDiscoveryJobs,
  type FeedDiscoverySchedulerDependencies,
} from './feed-discovery-scheduler'

const FUND_A = '2621143a-c9c3-4079-b52d-a9a935332ff5'
const FUND_B = 'f13aa191-56ac-4fb8-8eaa-bce047791467'

function dependencies(
  fundIds: readonly string[] = [FUND_A, FUND_B],
): FeedDiscoverySchedulerDependencies {
  return {
    claimEligibleFundIds: vi.fn(async limit => fundIds.slice(0, limit)),
    enqueue: vi.fn(async input => ({ id: `${input.fundId}:job`, status: 'pending' })),
  }
}

describe('Feed Discovery background-job scheduler', () => {
  it('enqueues one idempotent system job per server-selected fund', async () => {
    const deps = dependencies()

    await expect(scheduleFeedDiscoveryJobs(deps)).resolves.toEqual({ eligible: 2, scheduled: 2 })
    expect(deps.claimEligibleFundIds).toHaveBeenCalledWith(100)
    expect(deps.enqueue).toHaveBeenNthCalledWith(1, {
      kind: 'feed_discovery',
      payload: {},
      fundId: FUND_A,
      actor: { type: 'system' },
      dedupeKey: `feed_discovery:${FUND_A}`,
    })
    expect(deps.enqueue).toHaveBeenNthCalledWith(2, expect.objectContaining({
      fundId: FUND_B,
      dedupeKey: `feed_discovery:${FUND_B}`,
    }))
  })

  it('fails closed before enqueueing malformed or duplicate fund lists', async () => {
    for (const fundIds of [
      ['attacker-selected-fund'],
      [FUND_A, FUND_A],
    ]) {
      const deps = dependencies(fundIds)
      await expect(scheduleFeedDiscoveryJobs(deps)).rejects.toThrow('Feed Discovery scheduling failed')
      expect(deps.enqueue).not.toHaveBeenCalled()
    }
  })

  it('never performs unbounded work inside one Cron invocation', async () => {
    const fundIds = Array.from({ length: 101 }, (_, index) =>
      `2621143a-c9c3-4079-b52d-${String(index).padStart(12, '0')}`,
    )
    const deps = dependencies(fundIds)

    await expect(scheduleFeedDiscoveryJobs(deps)).resolves.toEqual({ eligible: 100, scheduled: 100 })
    expect(deps.claimEligibleFundIds).toHaveBeenCalledOnce()
    expect(deps.claimEligibleFundIds).toHaveBeenCalledWith(100)
    expect(deps.enqueue).toHaveBeenCalledTimes(100)
  })
})
