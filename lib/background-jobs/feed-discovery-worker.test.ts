import { describe, expect, it, vi } from 'vitest'

import type { BackgroundExecutionContext } from './context'
import {
  executeFeedDiscoveryWorker,
  type FeedDiscoveryWorkerDependencies,
} from './feed-discovery-worker'

const FUND_ID = '2621143a-c9c3-4079-b52d-a9a935332ff5'
const CONTEXT = Object.freeze({
  jobId: '842e532a-b848-457a-9b8e-4d6d8da10caf',
  attemptId: '1cd393ce-753b-4021-9848-f41d5205a4c8',
  tokenId: '1cd393ce-753b-4021-9848-f41d5205a4c8',
  audience: 'reporting-feed-discovery-worker' as const,
  scope: 'feed-discovery:execute' as const,
  kind: 'feed_discovery',
  fundId: FUND_ID,
  actor: Object.freeze({ type: 'system' as const }),
  payload: Object.freeze({}),
  sourceMode: 'public' as const,
  leaseExpiresAt: '2026-07-26T12:05:00.000Z',
  access: null,
} satisfies BackgroundExecutionContext)

function dependencies(
  overrides: Partial<FeedDiscoveryWorkerDependencies> = {},
): FeedDiscoveryWorkerDependencies {
  return {
    restoreContext: vi.fn(async () => CONTEXT),
    claimExecution: vi.fn(async () => true),
    runRefresh: vi.fn(async () => ({
      state: 'published' as const,
      summary: { scanned: 1, reused: 0, enriched: 1, classified: 1, published: 1, skipped: 0, failed: 0, expired: 0 },
    })),
    ...overrides,
  }
}

function request(body?: string) {
  return new Request('https://reporting.example/api/internal/background-jobs/feed-discovery/run?fundId=attacker', {
    method: 'POST',
    headers: { authorization: 'Bearer signed.token.value' },
    body,
  })
}

describe('Feed Discovery HTTP worker', () => {
  it('restores exact signed authority and runs only the persisted context fund', async () => {
    const deps = dependencies()
    const result = await executeFeedDiscoveryWorker(request(), deps)

    expect(result).toEqual({ status: 200, body: { status: 'done' } })
    expect(deps.restoreContext).toHaveBeenCalledWith(
      'Bearer signed.token.value',
      'reporting-feed-discovery-worker',
      'feed-discovery:execute',
      'feed_discovery',
    )
    expect(deps.claimExecution).toHaveBeenCalledWith(CONTEXT)
    expect(deps.runRefresh).toHaveBeenCalledWith(FUND_ID)
  })

  it('rejects caller-supplied body authority before restoring context', async () => {
    const deps = dependencies()
    const result = await executeFeedDiscoveryWorker(request(JSON.stringify({ fundId: 'attacker' })), deps)
    expect(result.status).toBe(400)
    expect(deps.restoreContext).not.toHaveBeenCalled()
    expect(deps.runRefresh).not.toHaveBeenCalled()
  })

  it('fails closed for unauthorized, non-system, replayed, and failed refreshes', async () => {
    const cases: Array<[FeedDiscoveryWorkerDependencies, number]> = [
      [dependencies({ restoreContext: vi.fn(async () => { throw new Error('denied') }) }), 401],
      [dependencies({ restoreContext: vi.fn(async (): Promise<BackgroundExecutionContext> => ({
        ...CONTEXT,
        actor: Object.freeze({ type: 'user', userId: 'attacker' }),
      })) }), 401],
      [dependencies({ claimExecution: vi.fn(async () => false) }), 409],
      [dependencies({ runRefresh: vi.fn(async () => ({ state: 'failed' as const, summary: { scanned: 0, reused: 0, enriched: 0, classified: 0, published: 0, skipped: 0, failed: 1, expired: 0 } })) }), 503],
    ]
    for (const [deps, status] of cases) {
      const result = await executeFeedDiscoveryWorker(request(), deps)
      expect(result.status).toBe(status)
    }
  })

  it('completes bounded partial work and reports a held refresh lease as skipped', async () => {
    for (const [state, expected] of [['partial', 200], ['skipped', 422]] as const) {
      const deps = dependencies({
        runRefresh: vi.fn(async () => ({ state, summary: { scanned: 1, reused: 0, enriched: 0, classified: 0, published: 0, skipped: 1, failed: 0, expired: 0 } })),
      })
      expect((await executeFeedDiscoveryWorker(request(), deps)).status).toBe(expected)
    }
  })
})
