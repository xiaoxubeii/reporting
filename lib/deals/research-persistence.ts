import type { SupabaseClient } from '@supabase/supabase-js'

import type { BackgroundExecutionContext } from '@/lib/background-jobs/context'

export interface DealResearchWrite {
  readonly status: 'running' | 'done' | 'skipped' | 'failed'
  readonly summary?: string | null
  readonly findings?: object | null
  readonly sources?: readonly object[] | null
  readonly error?: string | null
}

/** Write a Deal projection only while this exact job attempt still owns its lease. */
export async function writeAttemptBoundDealResearch(
  admin: SupabaseClient,
  context: BackgroundExecutionContext,
  write: DealResearchWrite,
): Promise<boolean> {
  const { data, error } = await admin.rpc('background_job_write_deal_research' as never, {
    p_job_id: context.jobId,
    p_attempt_id: context.attemptId,
    p_deal_id: context.payload.dealId,
    p_status: write.status,
    p_summary: write.summary ?? null,
    p_findings: write.findings ?? null,
    p_sources: write.sources ?? null,
    p_error: write.error ?? null,
  } as never)
  if (error) throw error
  return data === true
}
