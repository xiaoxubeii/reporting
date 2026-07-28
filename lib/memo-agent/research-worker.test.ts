import { describe, expect, it, vi } from 'vitest'

import type { BackgroundExecutionContext } from '@/lib/background-jobs/context'
import {
  executeMemoResearchWorker,
  type MemoResearchWorkerDependencies,
} from './research-worker'

const CONTEXT = Object.freeze({
  jobId: '842e532a-b848-457a-9b8e-4d6d8da10caf',
  attemptId: '1cd393ce-753b-4021-9848-f41d5205a4c8',
  tokenId: '1cd393ce-753b-4021-9848-f41d5205a4c8',
  audience: 'reporting-memo-research-worker' as const,
  scope: 'memo-research:execute' as const,
  kind: 'memo_research',
  fundId: '2621143a-c9c3-4079-b52d-a9a935332ff5',
  actor: Object.freeze({ type: 'user' as const, userId: '5b0ee23f-2a2f-4a4d-9d6f-098d89904d89' }),
  payload: Object.freeze({
    memoJobId: 'b898d919-d79f-482d-9faf-c59d3994be1f',
    dealId: 'f13aa191-56ac-4fb8-8eaa-bce047791467',
    draftId: '77630c6e-6229-4203-8db4-f4be1c3046c7',
  }),
  sourceMode: 'public' as const,
  leaseExpiresAt: new Date(Date.now() + 300_000).toISOString(),
  access: {} as never,
}) satisfies BackgroundExecutionContext

const PROJECTION = Object.freeze({
  id: CONTEXT.payload.memoJobId,
  backgroundJobId: CONTEXT.jobId,
  fundId: CONTEXT.fundId,
  dealId: CONTEXT.payload.dealId,
  draftId: CONTEXT.payload.draftId,
  kind: 'research' as const,
  status: 'pending' as const,
})

const RESULT = Object.freeze({
  researchOutput: Object.freeze({ findings: [], search_backend: 'reporting' }),
  summary: Object.freeze({ draft_id: CONTEXT.payload.draftId, findings: 2, warnings: [] as string[] }),
})

function dependencies(overrides: Partial<MemoResearchWorkerDependencies> = {}): MemoResearchWorkerDependencies {
  return {
    restoreContext: vi.fn(async () => CONTEXT),
    claimExecution: vi.fn(async () => true),
    loadProjection: vi.fn(async () => PROJECTION),
    updateProgress: vi.fn(async () => true),
    runResearch: vi.fn(async (_context, _projection, progress) => {
      await progress('Searching public evidence')
      return RESULT
    }),
    revalidate: vi.fn(async () => CONTEXT),
    writeResult: vi.fn(async () => true),
    ...overrides,
  }
}

function request(body?: string) {
  return new Request('https://reporting.example/api/internal/background-jobs/memo-research/run?fundId=attacker', {
    method: 'POST',
    headers: { authorization: 'Bearer signed.token.value' },
    body,
  })
}

describe('Memo Research HTTP worker', () => {
  it('restores exact authority, checks the linked projection, reports progress, and atomically writes success', async () => {
    const deps = dependencies()
    const result = await executeMemoResearchWorker(request(), deps)

    expect(result).toEqual({ status: 200, body: { status: 'done' } })
    expect(deps.restoreContext).toHaveBeenCalledWith(
      'Bearer signed.token.value',
      'reporting-memo-research-worker',
      'memo-research:execute',
      'memo_research',
    )
    expect(deps.claimExecution).toHaveBeenCalledWith(CONTEXT)
    expect(deps.loadProjection).toHaveBeenCalledWith(CONTEXT)
    expect(deps.updateProgress).toHaveBeenCalledWith(CONTEXT, PROJECTION.id, 'Searching public evidence')
    expect(deps.revalidate).toHaveBeenCalledWith(CONTEXT)
    expect(deps.writeResult).toHaveBeenCalledWith(CONTEXT, PROJECTION.id, RESULT)
  })

  it('rejects caller body authority before token restoration', async () => {
    const deps = dependencies()
    const result = await executeMemoResearchWorker(request(JSON.stringify({ fundId: 'attacker' })), deps)
    expect(result.status).toBe(400)
    expect(deps.restoreContext).not.toHaveBeenCalled()
  })

  it('fails closed for stale attempts and cross-resource projections', async () => {
    for (const deps of [
      dependencies({ restoreContext: vi.fn(async () => { throw new Error('denied') }) }),
      dependencies({ claimExecution: vi.fn(async () => false) }),
      dependencies({ loadProjection: vi.fn(async () => null) }),
      dependencies({ updateProgress: vi.fn(async () => false) }),
      dependencies({ revalidate: vi.fn(async () => { throw new Error('revoked') }) }),
      dependencies({ writeResult: vi.fn(async () => false) }),
    ]) {
      const result = await executeMemoResearchWorker(request(), deps)
      expect([401, 409]).toContain(result.status)
      if (result.status !== 200) expect(result.body).toHaveProperty('error')
    }
  })

  it('rejects a mismatched projection before invoking research', async () => {
    const deps = dependencies({
      loadProjection: vi.fn(async () => ({ ...PROJECTION, draftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })),
    })
    expect((await executeMemoResearchWorker(request(), deps)).status).toBe(409)
    expect(deps.runResearch).not.toHaveBeenCalled()
  })

  it('returns a retryable failure when the provider attempt fails', async () => {
    const deps = dependencies({ runResearch: vi.fn(async () => { throw new Error('provider timeout') }) })
    expect(await executeMemoResearchWorker(request(), deps)).toEqual({
      status: 503,
      body: { error: 'Memo Research attempt failed' },
    })
    expect(deps.writeResult).not.toHaveBeenCalled()
  })
})
