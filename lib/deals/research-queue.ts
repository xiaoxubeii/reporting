import type { SupabaseClient } from '@supabase/supabase-js'

import {
  enqueueBackgroundJob,
  type EnqueueBackgroundJobInput,
} from '@/lib/background-jobs/store'
import { createAdminClient } from '@/lib/supabase/admin'

export interface DealResearchQueueRepository {
  loadDeal(dealId: string): Promise<{
    readonly id: string
    readonly fundId: string
    readonly researchStatus: string | null
  } | null>
  isEnabled(fundId: string): Promise<boolean>
  loadActiveJob(dealId: string, fundId: string): Promise<{
    readonly id: string
    readonly status: string
  } | null>
  enqueue(input: EnqueueBackgroundJobInput): Promise<{ readonly id: string; readonly status: string }>
  projectPending(dealId: string, fundId: string): Promise<void>
}

interface QueueDealResearchInput {
  readonly dealId: string
  readonly fundId: string
  readonly actor: Readonly<{ type: 'user'; userId: string }> | Readonly<{ type: 'system' }>
}

export class DealResearchQueueError extends Error {
  constructor(readonly code: 'not_found' | 'disabled' | 'storage', message: string) {
    super(message)
  }
}

export async function queueDealResearch(
  input: QueueDealResearchInput,
  repository: DealResearchQueueRepository = createDealResearchQueueRepository(),
): Promise<{ readonly queued: true; readonly already: boolean; readonly jobId: string }> {
  const [deal, enabled] = await Promise.all([
    repository.loadDeal(input.dealId),
    repository.isEnabled(input.fundId),
  ])
  if (!deal || deal.fundId !== input.fundId) throw new DealResearchQueueError('not_found', 'Deal was not found')
  if (!enabled) throw new DealResearchQueueError('disabled', 'External deal research is disabled')

  const activeJob = await repository.loadActiveJob(input.dealId, input.fundId)
  if (activeJob) {
    return Object.freeze({ queued: true, already: true, jobId: activeJob.id })
  }
  let job: { readonly id: string; readonly status: string }
  try {
    job = await repository.enqueue({
      kind: 'deal_research',
      payload: Object.freeze({ dealId: input.dealId }),
      fundId: input.fundId,
      actor: input.actor,
      dedupeKey: `deal_research:${input.dealId}`,
    })
  } catch (error) {
    if (isActiveJobConflict(error)) {
      const racedJob = await repository.loadActiveJob(input.dealId, input.fundId)
      if (racedJob) return Object.freeze({ queued: true, already: true, jobId: racedJob.id })
    }
    throw error
  }
  await repository.projectPending(input.dealId, input.fundId)
  return Object.freeze({ queued: true, already: false, jobId: job.id })
}

function isActiveJobConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === '23505'
}

export function createDealResearchQueueRepository(
  admin: SupabaseClient = createAdminClient(),
): DealResearchQueueRepository {
  return {
    async loadDeal(dealId) {
      const { data, error } = await admin
        .from('inbound_deals')
        .select('id, fund_id, research_status' as never)
        .eq('id', dealId)
        .maybeSingle()
      if (error) throw new DealResearchQueueError('storage', 'Could not load Deal')
      const row = data as unknown as { id: string; fund_id: string; research_status: string | null } | null
      return row ? { id: row.id, fundId: row.fund_id, researchStatus: row.research_status } : null
    },
    async isEnabled(fundId) {
      const { data, error } = await admin
        .from('fund_settings')
        .select('deal_research_enabled' as never)
        .eq('fund_id', fundId)
        .maybeSingle()
      if (error) throw new DealResearchQueueError('storage', 'Could not load Research settings')
      return Boolean((data as unknown as { deal_research_enabled?: boolean } | null)?.deal_research_enabled)
    },
    async loadActiveJob(dealId, fundId) {
      const { data, error } = await admin
        .from('background_jobs')
        .select('id, status' as never)
        .eq('kind', 'deal_research')
        .eq('fund_id', fundId)
        .eq('dedupe_key', `deal_research:${dealId}`)
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new DealResearchQueueError('storage', 'Could not load active Research job')
      const row = data as unknown as { id: string; status: string } | null
      return row ? { id: row.id, status: row.status } : null
    },
    enqueue(input) {
      return enqueueBackgroundJob(input, admin)
    },
    async projectPending(dealId, fundId) {
      const { error } = await admin
        .from('inbound_deals')
        .update({ research_status: 'pending', research_error: null } as never)
        .eq('id', dealId)
        .eq('fund_id', fundId)
      if (error) throw new DealResearchQueueError('storage', 'Could not update Research status')
    },
  }
}
