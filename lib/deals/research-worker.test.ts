import { describe, expect, it, vi } from 'vitest'

import type { BackgroundExecutionContext } from '@/lib/background-jobs/context'
import {
  executeDealResearchWorker,
  type DealResearchWorkerDependencies,
} from './research-worker'

const CONTEXT = Object.freeze({
  jobId: '842e532a-b848-457a-9b8e-4d6d8da10caf',
  attemptId: '1cd393ce-753b-4021-9848-f41d5205a4c8',
  tokenId: '1cd393ce-753b-4021-9848-f41d5205a4c8',
  audience: 'reporting-deal-research-worker' as const,
  scope: 'deal-research:execute' as const,
  kind: 'deal_research',
  fundId: '2621143a-c9c3-4079-b52d-a9a935332ff5',
  actor: Object.freeze({ type: 'system' as const }),
  payload: Object.freeze({ dealId: 'f13aa191-56ac-4fb8-8eaa-bce047791467' }),
  sourceMode: 'public' as const,
  leaseExpiresAt: new Date(Date.now() + 300_000).toISOString(),
  access: null,
}) satisfies BackgroundExecutionContext

const DEAL = {
  id: CONTEXT.payload.dealId,
  fundId: CONTEXT.fundId,
  companyName: 'Example',
  companyUrl: 'https://example.com',
  companyDomain: 'example.com',
  founderName: 'Ada Example',
  founderEmail: 'ada@example.com',
  industry: 'health',
  stage: 'seed',
  companySummary: 'Reference content',
}

function dependencies(overrides: Partial<DealResearchWorkerDependencies> = {}): DealResearchWorkerDependencies {
  return {
    restoreContext: vi.fn(async () => CONTEXT),
    claimExecution: vi.fn(async () => true),
    projectRunning: vi.fn(async () => true),
    loadDeal: vi.fn(async () => DEAL),
    runResearch: vi.fn(async () => ({ status: 'done' as const })),
    ...overrides,
  }
}

describe('Deal Research HTTP worker', () => {
  it('accepts an empty POST, restores the exact worker audience, fences running state, and executes', async () => {
    const deps = dependencies()
    const result = await executeDealResearchWorker(new Request('https://reporting.example/api/internal/background-jobs/deal-research/run', {
      method: 'POST',
      headers: { authorization: 'Bearer signed.token.value' },
    }), deps)

    expect(result).toEqual({ status: 200, body: { status: 'done' } })
    expect(deps.restoreContext).toHaveBeenCalledWith(
      'Bearer signed.token.value',
      'reporting-deal-research-worker',
      'deal-research:execute',
      'deal_research',
    )
    expect(deps.claimExecution).toHaveBeenCalledWith(CONTEXT)
    expect(deps.projectRunning).toHaveBeenCalledWith(CONTEXT)
    expect(deps.loadDeal).toHaveBeenCalledWith(CONTEXT.payload.dealId, CONTEXT.fundId)
    expect(deps.runResearch).toHaveBeenCalledWith(CONTEXT, DEAL)
  })

  it('rejects any caller-supplied body or actor fields before restoring authority', async () => {
    const deps = dependencies()
    const result = await executeDealResearchWorker(new Request('https://reporting.example/api/internal/background-jobs/deal-research/run', {
      method: 'POST',
      headers: { authorization: 'Bearer signed.token.value', 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'attacker', fundId: 'attacker' }),
    }), deps)
    expect(result.status).toBe(400)
    expect(deps.restoreContext).not.toHaveBeenCalled()
  })

  it('fails closed on stale fencing, missing resources, and authorization errors', async () => {
    for (const deps of [
      dependencies({ restoreContext: vi.fn(async () => { throw new Error('denied') }) }),
      dependencies({ claimExecution: vi.fn(async () => false) }),
      dependencies({ projectRunning: vi.fn(async () => false) }),
      dependencies({ loadDeal: vi.fn(async () => null) }),
    ]) {
      const result = await executeDealResearchWorker(new Request('https://reporting.example/api/internal/background-jobs/deal-research/run', {
        method: 'POST', headers: { authorization: 'Bearer signed.token.value' },
      }), deps)
      expect([401, 409]).toContain(result.status)
      expect(deps.runResearch).not.toHaveBeenCalled()
    }
  })

  it('rejects a concurrent replay before projecting or invoking the provider', async () => {
    const deps = dependencies({ claimExecution: vi.fn(async () => false) })
    const result = await executeDealResearchWorker(new Request('https://reporting.example/api/internal/background-jobs/deal-research/run', {
      method: 'POST', headers: { authorization: 'Bearer replayed.token.value' },
    }), deps)
    expect(result).toEqual({ status: 409, body: { error: 'Background attempt is already executing' } })
    expect(deps.projectRunning).not.toHaveBeenCalled()
    expect(deps.runResearch).not.toHaveBeenCalled()
  })

  it('reports a persisted domain failure as terminal instead of retrying the provider', async () => {
    const deps = dependencies({ runResearch: vi.fn(async () => ({ status: 'failed' as const, error: 'invalid grounded result', retryable: false })) })
    const result = await executeDealResearchWorker(new Request('https://reporting.example/api/internal/background-jobs/deal-research/run', {
      method: 'POST', headers: { authorization: 'Bearer signed.token.value' },
    }), deps)
    expect(result).toEqual({ status: 422, body: { status: 'failed' } })
  })

  it('returns a retryable HTTP status for transient provider failures', async () => {
    const deps = dependencies({ runResearch: vi.fn(async () => ({ status: 'failed' as const, error: 'provider unavailable', retryable: true })) })
    const result = await executeDealResearchWorker(new Request('https://reporting.example/api/internal/background-jobs/deal-research/run', {
      method: 'POST', headers: { authorization: 'Bearer signed.token.value' },
    }), deps)
    expect(result).toEqual({ status: 503, body: { status: 'failed' } })
  })
})
