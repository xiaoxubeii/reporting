import { describe, expect, it, vi } from 'vitest'

import type { FeedEntry } from '../contracts'
import { DiscoveryRefreshService } from './refresh'

const NOW = new Date('2026-07-25T12:00:00.000Z')
const ENTRY = {
  upstreamId: 10,
  changedAt: '2026-07-25T11:00:00.000Z',
} as FeedEntry
const ENTRY_TWO = {
  upstreamId: 11,
  changedAt: '2026-07-25T11:01:00.000Z',
} as FeedEntry

function setup(overrides: Record<string, unknown> = {}) {
  const runtime = {
    claim: vi.fn(async (): Promise<{
      id: string
      expiresAt: string
      entryWatermark: number
      changedWatermark: string
      changedEntryId: number
      changedScanCutoff: string | null
      activeGenerationId: null
    } | null> => ({
      id: '00000000-0000-4000-8000-000000000001', expiresAt: '2026-07-25T12:15:00.000Z',
      entryWatermark: 9, changedWatermark: '2026-07-24T12:00:00.000Z', changedEntryId: 0, changedScanCutoff: null, activeGenerationId: null,
    })),
    finish: vi.fn(async () => true),
    loadMaterialization: vi.fn(async () => ({ enrichments: [], classifications: [], complete: true })),
    publish: vi.fn(async () => 2),
    cleanupExpired: vi.fn(async () => 1),
  }
  const collector = {
    listIncremental: vi.fn(async (input: { afterEntryId?: number; changedAfter?: Date }): Promise<{
      items: FeedEntry[]
      total: number
      nextOffset: number | null
      scanCursor: number | null
    }> => input.changedAfter === undefined
      ? { items: [ENTRY], total: 1, nextOffset: null, scanCursor: 10 }
      : { items: [], total: 0, nextOffset: null, scanCursor: null }),
  }
  const processEntry = vi.fn(async (): Promise<{
    semantic: 'created' | 'reused' | 'deferred' | 'failed' | 'skipped'
    classification: 'created' | 'reused' | 'deferred' | 'failed' | 'skipped'
    tokens: number
  }> => ({ semantic: 'created', classification: 'created', tokens: 100 }))
  const materialize = vi.fn(() => [{ kind: 'trending' as const } as never])
  const uuids = [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
  ]
  const deps = {
    runtime,
    collector,
    processEntry,
    materialize,
    clock: { now: () => new Date(NOW) },
    randomUUID: () => uuids.shift() ?? '00000000-0000-4000-8000-000000000099',
    logger: { info: vi.fn(), warn: vi.fn() },
    ...overrides,
  }
  return { service: new DiscoveryRefreshService(deps as never), runtime, collector, processEntry, materialize }
}

describe('DiscoveryRefreshService', () => {
  it('claims and materializes with the resolved provider configuration versions', async () => {
    const { service, runtime } = setup({
      semanticVersion: 'semantic-v1-provider-fingerprint',
      classifierVersion: 'deal-signal-v1-provider-fingerprint',
    })

    await service.run()

    expect(runtime.claim).toHaveBeenCalledWith(expect.objectContaining({
      semanticVersion: 'semantic-v1-provider-fingerprint',
      classifierVersion: 'deal-signal-v1-provider-fingerprint',
    }))
    expect(runtime.loadMaterialization).toHaveBeenCalledWith(
      NOW,
      'semantic-v1-provider-fingerprint',
      'deal-signal-v1-provider-fingerprint',
    )
  })

  it('returns a successful skip without collector or AI work when the lease is held', async () => {
    const { service, runtime, collector, processEntry } = setup()
    runtime.claim.mockResolvedValueOnce(null)

    const outcome = await service.run()

    expect(outcome.state).toBe('skipped')
    expect(collector.listIncremental).not.toHaveBeenCalled()
    expect(processEntry).not.toHaveBeenCalled()
    expect(runtime.publish).not.toHaveBeenCalled()
  })

  it('processes bounded new/changed entries and atomically publishes one complete generation', async () => {
    const { service, runtime, processEntry } = setup()

    const outcome = await service.run()

    expect(outcome).toMatchObject({
      state: 'published',
      summary: { scanned: 1, enriched: 1, classified: 1, published: 2, expired: 1, failed: 0 },
    })
    expect(processEntry).toHaveBeenCalledOnce()
    expect(runtime.publish).toHaveBeenCalledWith(expect.objectContaining({
      leaseId: '00000000-0000-4000-8000-000000000001',
      generationId: '00000000-0000-4000-8000-000000000002',
      entryWatermark: 10,
      semanticVersion: 'semantic-v1',
      classifierVersion: 'deal-signal-v1',
    }))
  })

  it('preserves the active generation when a per-run limit leaves another page', async () => {
    const { service, runtime, collector } = setup()
    collector.listIncremental.mockImplementationOnce(async () => ({ items: [ENTRY], total: 2, nextOffset: 1, scanCursor: 10 }))

    const outcome = await service.run()

    expect(outcome.state).toBe('partial')
    expect(runtime.publish).not.toHaveBeenCalled()
    expect(runtime.finish).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'work_limit' }))
  })

  it('preserves last-known-good results when any AI item fails', async () => {
    const { service, runtime, processEntry } = setup()
    processEntry.mockResolvedValueOnce({ semantic: 'failed', classification: 'skipped', tokens: 0 })

    const outcome = await service.run()

    expect(outcome.state).toBe('partial')
    expect(outcome.summary.failed).toBe(1)
    expect(runtime.publish).not.toHaveBeenCalled()
    expect(runtime.finish).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'partial_failure' }))
  })

  it.each(['failed', 'deferred'] as const)('does not advance past a %s entry that must be retried', async state => {
    const { service, runtime, collector, processEntry } = setup()
    collector.listIncremental.mockImplementation(async input => input.changedAfter === undefined
      ? { items: [ENTRY, ENTRY_TWO], total: 2, nextOffset: null, scanCursor: 11 }
      : { items: [], total: 0, nextOffset: null, scanCursor: null })
    processEntry
      .mockResolvedValueOnce({ semantic: state, classification: 'skipped', tokens: 0 })
      .mockResolvedValueOnce({ semantic: 'created', classification: 'created', tokens: 100 })

    const outcome = await service.run()

    expect(outcome.state).toBe('partial')
    expect(processEntry).toHaveBeenCalledTimes(2)
    expect(runtime.finish).toHaveBeenCalledWith(expect.objectContaining({
      entryWatermark: 9,
      changedWatermark: '2026-07-24T12:00:00.000Z',
      changedEntryId: 0,
      changedScanCutoff: null,
      errorCode: 'partial_failure',
    }))
    expect(runtime.publish).not.toHaveBeenCalled()
  })

  it('persists a changed-scan ID cursor without advancing a non-monotonic changed timestamp', async () => {
    const olderChange = { ...ENTRY_TWO, changedAt: '2026-07-24T12:30:00.000Z' } as FeedEntry
    const newerChange = { ...ENTRY, changedAt: '2026-07-25T11:00:00.000Z' } as FeedEntry
    const { service, runtime, collector } = setup()
    collector.listIncremental.mockImplementation(async input => input.changedAfter === undefined
      ? { items: [], total: 0, nextOffset: null, scanCursor: null }
      : { items: [newerChange, olderChange], total: 3, nextOffset: 2, scanCursor: 11 })

    const outcome = await service.run()

    expect(outcome.state).toBe('partial')
    expect(runtime.finish).toHaveBeenCalledWith(expect.objectContaining({
      changedWatermark: '2026-07-24T12:00:00.000Z',
      changedEntryId: 11,
      changedScanCutoff: NOW.toISOString(),
      errorCode: 'work_limit',
    }))
  })

  it('resumes a changed scan from a stable ID cursor and resets it after completion', async () => {
    const { service, runtime, collector } = setup()
    runtime.claim.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000001',
      expiresAt: '2026-07-25T12:15:00.000Z',
      entryWatermark: 9,
      changedWatermark: '2026-07-24T12:00:00.000Z',
      changedEntryId: 11,
      changedScanCutoff: '2026-07-25T11:30:00.000Z',
      activeGenerationId: null,
    })
    collector.listIncremental.mockResolvedValue({ items: [], total: 0, nextOffset: null, scanCursor: null })

    const outcome = await service.run()

    expect(outcome.state).toBe('published')
    expect(collector.listIncremental).toHaveBeenCalledWith(expect.objectContaining({
      changedAfter: new Date('2026-07-24T12:00:00.000Z'),
      afterEntryId: 11,
    }))
    expect(runtime.publish).toHaveBeenCalledWith(expect.objectContaining({
      changedWatermark: '2026-07-25T11:30:00.000Z',
      changedEntryId: 0,
      changedScanCutoff: null,
    }))
  })

  it('keeps the first scan cutoff across runs so a lower ID changed mid-scan is collected next', async () => {
    const scanStartedAt = new Date('2026-07-25T12:00:00.000Z')
    const laterRun = new Date('2026-07-25T12:10:00.000Z')
    const finalRun = new Date('2026-07-25T12:20:00.000Z')
    const lowerIdChange = { ...ENTRY, upstreamId: 5, changedAt: '2026-07-25T12:05:00.000Z' } as FeedEntry
    let currentTime = scanStartedAt
    const { service, runtime, collector, processEntry } = setup({ clock: { now: () => new Date(currentTime) } })
    runtime.claim
      .mockResolvedValueOnce({
        id: '00000000-0000-4000-8000-000000000001', expiresAt: '2026-07-25T12:15:00.000Z',
        entryWatermark: 100, changedWatermark: '2026-07-24T12:00:00.000Z',
        changedEntryId: 0, changedScanCutoff: null, activeGenerationId: null,
      })
      .mockResolvedValueOnce({
        id: '00000000-0000-4000-8000-000000000002', expiresAt: '2026-07-25T12:25:00.000Z',
        entryWatermark: 100, changedWatermark: '2026-07-24T12:00:00.000Z',
        changedEntryId: 50, changedScanCutoff: scanStartedAt.toISOString(), activeGenerationId: null,
      })
      .mockResolvedValueOnce({
        id: '00000000-0000-4000-8000-000000000003', expiresAt: '2026-07-25T12:35:00.000Z',
        entryWatermark: 100, changedWatermark: scanStartedAt.toISOString(),
        changedEntryId: 0, changedScanCutoff: null, activeGenerationId: null,
      })
    collector.listIncremental
      .mockResolvedValueOnce({ items: [], total: 0, nextOffset: null, scanCursor: null })
      .mockResolvedValueOnce({ items: [ENTRY], total: 2, nextOffset: 1, scanCursor: 50 })
      .mockResolvedValueOnce({ items: [], total: 0, nextOffset: null, scanCursor: null })
      .mockResolvedValueOnce({ items: [ENTRY_TWO], total: 1, nextOffset: null, scanCursor: 100 })
      .mockResolvedValueOnce({ items: [], total: 0, nextOffset: null, scanCursor: null })
      .mockResolvedValueOnce({ items: [lowerIdChange], total: 1, nextOffset: null, scanCursor: 5 })

    expect((await service.run()).state).toBe('partial')
    currentTime = laterRun
    expect((await service.run()).state).toBe('published')
    currentTime = finalRun
    expect((await service.run()).state).toBe('published')

    const changedCalls = collector.listIncremental.mock.calls
      .map(([input]) => input)
      .filter(input => input.changedAfter !== undefined)
    expect(changedCalls).toEqual([
      expect.objectContaining({ afterEntryId: 0, changedAfter: new Date('2026-07-24T12:00:00.000Z') }),
      expect.objectContaining({ afterEntryId: 50, changedAfter: new Date('2026-07-24T12:00:00.000Z') }),
      expect.objectContaining({ afterEntryId: 0, changedAfter: scanStartedAt }),
    ])
    expect(runtime.publish).toHaveBeenNthCalledWith(1, expect.objectContaining({
      changedWatermark: scanStartedAt.toISOString(),
      changedEntryId: 0,
      changedScanCutoff: null,
    }))
    expect(processEntry).toHaveBeenCalledWith(
      lowerIdChange,
      finalRun,
      new Date(finalRun.getTime() + 235_000),
    )
  })

  it('stops at the deployment token budget and advances only the processed ID watermark', async () => {
    const { service, runtime, collector, processEntry } = setup()
    collector.listIncremental.mockImplementation(async input => input.changedAfter === undefined
      ? { items: [ENTRY, ENTRY_TWO], total: 2, nextOffset: null, scanCursor: 11 }
      : { items: [], total: 0, nextOffset: null, scanCursor: null })
    processEntry.mockResolvedValue({ semantic: 'created', classification: 'created', tokens: 500_000 })

    const outcome = await service.run()

    expect(outcome.state).toBe('partial')
    expect(processEntry).toHaveBeenCalledOnce()
    expect(runtime.finish).toHaveBeenCalledWith(expect.objectContaining({ entryWatermark: 10, errorCode: 'work_limit' }))
    expect(runtime.publish).not.toHaveBeenCalled()
  })
})
