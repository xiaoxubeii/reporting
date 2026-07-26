import type { SupabaseClient } from '@supabase/supabase-js'

import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueBackgroundJob, type EnqueueBackgroundJobInput } from './store'

const FUND_PAGE_SIZE = 100
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface FeedDiscoverySchedulerDependencies {
  claimEligibleFundIds(limit: number): Promise<readonly string[]>
  enqueue(input: EnqueueBackgroundJobInput): Promise<{ readonly id: string; readonly status: string }>
}

export interface FeedDiscoverySchedulingResult {
  readonly eligible: number
  readonly scheduled: number
}

export async function scheduleFeedDiscoveryJobs(
  dependencies: FeedDiscoverySchedulerDependencies = createDependencies(),
): Promise<FeedDiscoverySchedulingResult> {
  try {
    const fundIds = await dependencies.claimEligibleFundIds(FUND_PAGE_SIZE)
    validateFundIds(fundIds)
    await Promise.all(fundIds.map(fundId => dependencies.enqueue({
      kind: 'feed_discovery',
      payload: Object.freeze({}),
      fundId,
      actor: Object.freeze({ type: 'system' }),
      dedupeKey: `feed_discovery:${fundId}`,
    })))
    return Object.freeze({ eligible: fundIds.length, scheduled: fundIds.length })
  } catch {
    throw new Error('Feed Discovery scheduling failed')
  }
}

function createDependencies(
  admin: SupabaseClient = createAdminClient(),
): FeedDiscoverySchedulerDependencies {
  return {
    async claimEligibleFundIds(limit) {
      const { data, error } = await admin.rpc('next_feed_discovery_funds', { p_limit: limit })
      if (error) throw error
      return Object.freeze((data ?? []).map((row: { fund_id: string }) => row.fund_id))
    },
    enqueue(input) {
      return enqueueBackgroundJob(input, admin)
    },
  }
}

function validateFundIds(fundIds: readonly string[]): void {
  if (fundIds.length > FUND_PAGE_SIZE || new Set(fundIds).size !== fundIds.length) {
    throw new Error('Invalid eligible Feed Discovery funds')
  }
  if (fundIds.some(fundId => typeof fundId !== 'string' || !UUID_PATTERN.test(fundId))) {
    throw new Error('Invalid eligible Feed Discovery fund')
  }
}
