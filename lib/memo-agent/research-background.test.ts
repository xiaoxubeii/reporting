import { describe, expect, it, vi } from 'vitest'

import type { BackgroundExecutionContext } from '@/lib/background-jobs/context'
import {
  enqueueMemoResearchBackground,
  updateAttemptBoundMemoResearchProgress,
  writeAttemptBoundMemoResearchResult,
} from './research-background'

const IDS = {
  fundId: '2621143a-c9c3-4079-b52d-a9a935332ff5',
  dealId: 'f13aa191-56ac-4fb8-8eaa-bce047791467',
  draftId: '77630c6e-6229-4203-8db4-f4be1c3046c7',
  actorUserId: '5b0ee23f-2a2f-4a4d-9d6f-098d89904d89',
  memoJobId: 'b898d919-d79f-482d-9faf-c59d3994be1f',
  backgroundJobId: '842e532a-b848-457a-9b8e-4d6d8da10caf',
  attemptId: '1cd393ce-753b-4021-9848-f41d5205a4c8',
}

const CONTEXT = {
  jobId: IDS.backgroundJobId,
  attemptId: IDS.attemptId,
} as BackgroundExecutionContext

describe('Memo Research background persistence adapter', () => {
  it('uses one atomic RPC and requires the linked generalized job receipt', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        id: IDS.memoJobId,
        background_job_id: IDS.backgroundJobId,
        status: 'pending',
        enqueued_at: '2026-07-28T10:00:00.000Z',
      },
      error: null,
    }))
    await expect(enqueueMemoResearchBackground(IDS, { rpc } as never)).resolves.toEqual({
      id: IDS.memoJobId,
      backgroundJobId: IDS.backgroundJobId,
      status: 'pending',
      enqueuedAt: '2026-07-28T10:00:00.000Z',
    })
    expect(rpc).toHaveBeenCalledWith('memo_agent_enqueue_research_background', {
      p_fund_id: IDS.fundId,
      p_deal_id: IDS.dealId,
      p_draft_id: IDS.draftId,
      p_actor_user_id: IDS.actorUserId,
    })
  })

  it('binds progress and the full terminal receipt to the same attempt', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }))
    const admin = { rpc } as never
    await updateAttemptBoundMemoResearchProgress(admin, CONTEXT, IDS.memoJobId, 'Searching')
    await writeAttemptBoundMemoResearchResult(
      admin,
      CONTEXT,
      IDS.memoJobId,
      { findings: [], search_backend: 'reporting' },
      { findings: 0 },
    )
    expect(rpc).toHaveBeenNthCalledWith(1, 'memo_research_update_progress', {
      p_job_id: IDS.backgroundJobId,
      p_attempt_id: IDS.attemptId,
      p_memo_job_id: IDS.memoJobId,
      p_message: 'Searching',
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'memo_research_write_result', {
      p_job_id: IDS.backgroundJobId,
      p_attempt_id: IDS.attemptId,
      p_memo_job_id: IDS.memoJobId,
      p_research_output: { findings: [], search_backend: 'reporting' },
      p_result: { findings: 0 },
    })
  })
})
