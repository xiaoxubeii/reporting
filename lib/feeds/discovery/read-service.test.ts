import { describe, expect, it, vi } from 'vitest'

import { DiscoveryReadService, mapDiscoveryRow } from './read-service'

const GENERATION_ID = '00000000-0000-4000-8000-000000000001'
const ITEM_ID = '00000000-0000-4000-8000-000000000002'
const DEAL_ID = '00000000-0000-4000-8000-000000000003'
const GENERATED_AT = '2026-07-25T10:00:00.000Z'
const SOURCE = {
  entryId: 42,
  title: 'Acme is raising',
  url: 'https://news.example/acme',
  sourceTitle: 'News',
  publishedAt: '2026-07-25T09:00:00.000Z',
}

describe('DiscoveryReadService', () => {
  it('returns an honest stale empty page before the first successful generation', async () => {
    const reader = {
      readState: vi.fn(async () => ({ activeGenerationId: null, generatedAt: null, lastAttemptAt: null, lastErrorCode: null })),
      readItems: vi.fn(),
    }
    const service = new DiscoveryReadService({} as never, reader, { now: () => new Date(GENERATED_AT) })

    const page = await service.list({ fundId: 'fund-1', kind: 'trending', limit: 20, offset: 0 })

    expect(page).toMatchObject({ items: [], generationId: null, generatedAt: null, isStale: true, total: 0 })
    expect(reader.readItems).not.toHaveBeenCalled()
  })

  it('maps only the requested active generation and reports stale metadata', async () => {
    const reader = {
      readState: vi.fn(async () => ({
        activeGenerationId: GENERATION_ID,
        generatedAt: GENERATED_AT,
        lastAttemptAt: GENERATED_AT,
        lastErrorCode: null,
      })),
      readItems: vi.fn(async () => ({
        total: 1,
        rows: [{
          id: ITEM_ID,
          kind: 'trending' as const,
          title: 'AI agents',
          summary: 'Three articles from two sources.',
          score: 72,
          sourceEntryRefs: [SOURCE],
          evidence: [],
          metadata: { metrics: { articleCount: 3, sourceCount: 2, priorArticleCount: 1, growth: 2, freshness: 0.8, currentWindowHours: 24, baselineWindowDays: 7 } },
          generatedAt: GENERATED_AT,
        }],
      })),
    }
    const service = new DiscoveryReadService({} as never, reader, {
      now: () => new Date('2026-07-25T17:00:01.000Z'),
    })

    const page = await service.list({ fundId: 'fund-1', kind: 'trending', limit: 10, offset: 5 })

    expect(page).toMatchObject({ generationId: GENERATION_ID, isStale: true, total: 1, limit: 10, offset: 5 })
    expect(page.items[0]).toMatchObject({ kind: 'trending', label: 'AI agents', metrics: { sourceCount: 2 } })
    expect(reader.readItems).toHaveBeenCalledWith({ generationId: GENERATION_ID, kind: 'trending', limit: 10, offset: 5 })
  })

  it('decorates a Deal Signal only from the requesting fund active deals', async () => {
    const limit = vi.fn(async () => ({
      data: [{ id: DEAL_ID, company_domain: 'acme.example', company_name: 'Acme' }],
      error: null,
    }))
    const chain = { select: vi.fn(), eq: vi.fn(), neq: vi.fn(), limit }
    chain.select.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    chain.neq.mockReturnValue(chain)
    const admin = { from: vi.fn(() => chain) }
    const reader = {
      readState: vi.fn(async () => ({
        activeGenerationId: GENERATION_ID,
        generatedAt: GENERATED_AT,
        lastAttemptAt: GENERATED_AT,
        lastErrorCode: null,
      })),
      readItems: vi.fn(async () => ({ total: 1, rows: [dealRow()] })),
    }
    const service = new DiscoveryReadService(admin as never, reader, { now: () => new Date(GENERATED_AT) })

    const page = await service.list({ fundId: 'fund-1', kind: 'deal_signal', limit: 20, offset: 0 })

    expect(chain.eq).toHaveBeenCalledWith('fund_id', 'fund-1')
    expect(chain.neq).toHaveBeenCalledWith('status', 'passed')
    expect(page.items[0]).toMatchObject({ kind: 'deal_signal', companyName: 'Acme', existingDealId: DEAL_ID })
  })
})

describe('mapDiscoveryRow', () => {
  it('does not expose classifier-only metadata in a Deal Signal DTO', () => {
    const item = mapDiscoveryRow({
      ...dealRow(),
      metadata: { ...dealRow().metadata as object, provider: 'secret-provider', prompt: 'hidden' },
    })

    expect(JSON.stringify(item)).not.toContain('secret-provider')
    expect(JSON.stringify(item)).not.toContain('hidden')
  })
})

function dealRow() {
  return {
    id: ITEM_ID,
    kind: 'deal_signal' as const,
    title: 'Acme — open fundraising signal',
    summary: 'Acme is raising a seed round.',
    score: 91,
    sourceEntryRefs: [SOURCE],
    evidence: ['Acme is raising a seed round.'],
    metadata: {
      companyName: 'Acme',
      companyDomain: 'acme.example',
      stage: 'Seed',
      amount: '$3m',
      eventDate: '2026-07-25T00:00:00.000Z',
      confidence: 0.91,
    },
    generatedAt: GENERATED_AT,
  }
}
