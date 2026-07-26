import { describe, expect, it, vi } from 'vitest'

import type { AIProvider, AIResult } from '@/lib/ai/types'
import type { SemanticEnrichment } from './contracts'
import {
  DealSignalClassifier,
  dedupeDealSignals,
  isPublishableDealSignal,
  shouldClassifyDealSignal,
} from './deal-signal'

const NOW = new Date('2026-07-25T12:00:00.000Z')
const SOURCE = 'Acme Health is currently raising a $5 million seed round and is looking for investors.'
const OPEN = {
  companyName: 'Acme Health',
  companyDomain: 'acme.example',
  signalType: 'active_raise' as const,
  opportunityStatus: 'open' as const,
  stage: 'Seed',
  amount: '$5 million',
  eventDate: '2026-07-25T00:00:00.000Z',
  confidence: 0.9,
  evidence: ['currently raising a $5 million seed round'],
}

function aiResult(value: unknown): AIResult {
  return { text: typeof value === 'string' ? value : JSON.stringify(value), usage: { inputTokens: 80, outputTokens: 40 }, truncated: false }
}

function provider(...responses: AIResult[]) {
  const createMessage = vi.fn(async () => responses.shift() ?? aiResult(OPEN))
  return { createMessage, createChat: vi.fn(), testConnection: vi.fn(), listModels: vi.fn() } as unknown as AIProvider
}

const EMPTY_SEMANTIC: SemanticEnrichment = { entities: [], concepts: [], events: [], confidence: 0.5 }

describe('Deal Signal strategy', () => {
  it('prefilters active opportunity language but rejects negated and completed financing language', () => {
    expect(shouldClassifyDealSignal(EMPTY_SEMANTIC, 'Acme is currently raising a seed round.')).toBe(true)
    expect(shouldClassifyDealSignal(EMPTY_SEMANTIC, 'Acme is not raising a seed round.')).toBe(false)
    expect(shouldClassifyDealSignal(EMPTY_SEMANTIC, 'Acme denied it is raising capital.')).toBe(false)
    expect(shouldClassifyDealSignal(EMPTY_SEMANTIC, 'Acme raised and closed a seed round led by Example VC.')).toBe(false)
  })

  it('uses the independent strict classifier with one bounded retry and no web search', async () => {
    const ai = provider(aiResult('not json'), aiResult(OPEN))
    const classifier = new DealSignalClassifier({ provider: ai, providerType: 'openai', model: 'test-model' })

    const classified = await classifier.classify({ title: 'Acme raise', summary: SOURCE, contentText: SOURCE })

    expect(classified.value).toMatchObject({ signalType: 'active_raise', opportunityStatus: 'open' })
    expect(classified.attemptCount).toBe(2)
    expect(ai.createMessage).toHaveBeenCalledTimes(2)
    expect(vi.mocked(ai.createMessage).mock.calls[0][0].enableWebSearch).not.toBe(true)
  })

  it('publishes only fresh, confident, grounded active open raises', () => {
    expect(isPublishableDealSignal(OPEN, '2026-07-25T00:00:00Z', NOW)).toBe(true)
    expect(isPublishableDealSignal({ ...OPEN, confidence: 0.79 }, '2026-07-25T00:00:00Z', NOW)).toBe(false)
    expect(isPublishableDealSignal({ ...OPEN, signalType: 'completed_financing' }, '2026-07-25T00:00:00Z', NOW)).toBe(false)
    expect(isPublishableDealSignal({ ...OPEN, opportunityStatus: 'unknown' }, '2026-07-25T00:00:00Z', NOW)).toBe(false)
    expect(isPublishableDealSignal({ ...OPEN, evidence: ['strong revenue growth'] }, '2026-07-25T00:00:00Z', NOW)).toBe(false)
  })

  it('uses an inclusive 14-day freshness boundary', () => {
    expect(isPublishableDealSignal(OPEN, '2026-07-11T12:00:00.001Z', NOW)).toBe(true)
    expect(isPublishableDealSignal(OPEN, '2026-07-11T12:00:00.000Z', NOW)).toBe(true)
    expect(isPublishableDealSignal(OPEN, '2026-07-11T11:59:59.999Z', NOW)).toBe(false)
  })

  it('deduplicates the same company and round inside one event window while preserving sources', () => {
    const grouped = dedupeDealSignals([
      { entryId: 1, sourceRef: 'source:a', publishedAt: '2026-07-25T00:00:00Z', classification: OPEN },
      { entryId: 2, sourceRef: 'source:b', publishedAt: '2026-07-20T00:00:00Z', classification: { ...OPEN, companyName: 'ACME HEALTH', confidence: 0.92 } },
    ])

    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({ entryIds: [1, 2], sourceRefs: ['source:a', 'source:b'] })
    expect(grouped[0]?.classification.confidence).toBe(0.92)
  })

  it('keeps different rounds or event windows separate', () => {
    const grouped = dedupeDealSignals([
      { entryId: 1, sourceRef: 'source:a', publishedAt: '2026-07-25T00:00:00Z', classification: OPEN },
      { entryId: 2, sourceRef: 'source:b', publishedAt: '2026-07-20T00:00:00Z', classification: { ...OPEN, stage: 'Series A' } },
      { entryId: 3, sourceRef: 'source:c', publishedAt: '2026-05-01T00:00:00Z', classification: { ...OPEN, eventDate: '2026-05-01T00:00:00.000Z' } },
    ])
    expect(grouped).toHaveLength(3)
  })

  it('uses a fixed-length stable key for maximum valid company and stage values', () => {
    const maximumDomain = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`
    const classification = { ...OPEN, companyDomain: maximumDomain, stage: 'S'.repeat(100) }

    const first = dedupeDealSignals([
      { entryId: 1, sourceRef: 'source:a', publishedAt: '2026-07-25T00:00:00Z', classification },
    ])[0]?.resultKey
    const second = dedupeDealSignals([
      { entryId: 1, sourceRef: 'source:a', publishedAt: '2026-07-25T00:00:00Z', classification },
    ])[0]?.resultKey

    expect(first).toMatch(/^deal:[a-f0-9]{64}$/)
    expect(first).toBe(second)
    expect(first!.length).toBeLessThanOrEqual(300)
  })
})
