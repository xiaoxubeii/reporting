import { describe, expect, it, vi } from 'vitest'

import { DiscoveryRuntimeStore } from './runtime-store'
import { SupabaseDiscoveryRepository } from './supabase-repository'

const FUND_A = '7b2d62d7-58cf-4684-8c31-7e4c43b9949e'
const FUND_B = '61e60ee7-2679-4ec4-81f6-bc5790879acd'

function queryResult(data: unknown = null) {
  const eq = vi.fn(() => query)
  const query = {
    select: vi.fn(() => query),
    eq,
    gt: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    single: vi.fn(async () => ({ data, error: null })),
    range: vi.fn(async () => ({ data: [], error: null, count: 0 })),
  }
  return query
}

describe('Discovery fund isolation', () => {
  it('binds semantic cache lookup to the repository fund', async () => {
    const queryA = queryResult()
    const queryB = queryResult()
    const repositoryA = new SupabaseDiscoveryRepository(FUND_A, {
      from: vi.fn(() => queryA),
    } as never)
    const repositoryB = new SupabaseDiscoveryRepository(FUND_B, {
      from: vi.fn(() => queryB),
    } as never)

    await repositoryA.findReusableSemantic('a'.repeat(64), 'semantic-v1', new Date())
    await repositoryB.findReusableSemantic('a'.repeat(64), 'semantic-v1', new Date())

    expect(queryA.eq).toHaveBeenCalledWith('fund_id', FUND_A)
    expect(queryB.eq).toHaveBeenCalledWith('fund_id', FUND_B)
  })

  it('passes the bound fund to every lease RPC', async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'claim_explore_discovery_refresh' ? [] : true,
      error: null,
    }))
    const runtime = new DiscoveryRuntimeStore(FUND_A, { rpc } as never)

    await runtime.claim({ leaseId: crypto.randomUUID(), leaseSeconds: 60, semanticVersion: 's', classifierVersion: 'c' })
    await runtime.finish({
      leaseId: crypto.randomUUID(), entryWatermark: 0, changedWatermark: null,
      changedEntryId: 0, changedScanCutoff: null, errorCode: null,
    })

    expect(rpc).toHaveBeenNthCalledWith(1, 'claim_explore_discovery_refresh', expect.objectContaining({ p_fund_id: FUND_A }))
    expect(rpc).toHaveBeenNthCalledWith(2, 'finish_explore_discovery_refresh', expect.objectContaining({ p_fund_id: FUND_A }))
  })

  it('binds state and result reads to the runtime fund', async () => {
    const stateQuery = queryResult({
      active_generation_id: null, last_success_at: null, last_attempt_at: null, last_error_code: null,
    })
    const itemQuery = queryResult([])
    const from = vi.fn((table: string) => table === 'explore_discovery_refresh_state' ? stateQuery : itemQuery)
    const runtime = new DiscoveryRuntimeStore(FUND_B, { from } as never)

    await runtime.readState()
    await runtime.readItems({ generationId: crypto.randomUUID(), kind: 'trending', limit: 10, offset: 0 })

    expect(stateQuery.eq).toHaveBeenCalledWith('fund_id', FUND_B)
    expect(itemQuery.eq).toHaveBeenCalledWith('fund_id', FUND_B)
  })

  it('returns an empty state before a fund has run its first refresh', async () => {
    const stateQuery = queryResult(null)
    const runtime = new DiscoveryRuntimeStore(FUND_A, { from: vi.fn(() => stateQuery) } as never)

    await expect(runtime.readState()).resolves.toEqual({
      activeGenerationId: null,
      generatedAt: null,
      lastAttemptAt: null,
      lastErrorCode: null,
    })
  })
})
