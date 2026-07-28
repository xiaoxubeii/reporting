import type { BackgroundExecutionContext } from '@/lib/background-jobs/context'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/types/database'

type Admin = ReturnType<typeof createAdminClient>

export interface EnqueuedMemoResearch {
  readonly id: string
  readonly backgroundJobId: string
  readonly status: string
  readonly enqueuedAt: string
}

export async function enqueueMemoResearchBackground(
  input: Readonly<{ fundId: string; dealId: string; draftId: string; actorUserId: string }>,
  admin: Admin = createAdminClient(),
): Promise<EnqueuedMemoResearch> {
  const { data, error } = await admin.rpc('memo_agent_enqueue_research_background', {
    p_fund_id: input.fundId,
    p_deal_id: input.dealId,
    p_draft_id: input.draftId,
    p_actor_user_id: input.actorUserId,
  })
  if (error) throw error
  const row = data as unknown as Record<string, unknown> | null
  if (
    !row
    || typeof row.id !== 'string'
    || typeof row.background_job_id !== 'string'
    || typeof row.status !== 'string'
    || typeof row.enqueued_at !== 'string'
  ) {
    throw new Error('Memo Research enqueue returned no linked job')
  }
  return Object.freeze({
    id: row.id,
    backgroundJobId: row.background_job_id,
    status: row.status,
    enqueuedAt: row.enqueued_at,
  })
}

export async function updateAttemptBoundMemoResearchProgress(
  admin: Admin,
  context: BackgroundExecutionContext,
  memoJobId: string,
  message: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc('memo_research_update_progress', {
    p_job_id: context.jobId,
    p_attempt_id: context.attemptId,
    p_memo_job_id: memoJobId,
    p_message: message,
  })
  if (error) throw error
  return data === true
}

export async function writeAttemptBoundMemoResearchResult(
  admin: Admin,
  context: BackgroundExecutionContext,
  memoJobId: string,
  researchOutput: Json,
  result: Json,
): Promise<boolean> {
  const { data, error } = await admin.rpc('memo_research_write_result', {
    p_job_id: context.jobId,
    p_attempt_id: context.attemptId,
    p_memo_job_id: memoJobId,
    p_research_output: researchOutput,
    p_result: result,
  })
  if (error) throw error
  return data === true
}
