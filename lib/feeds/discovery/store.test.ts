import { describe, expect, it, vi } from 'vitest'

import type { FeedEntry } from '../contracts'
import type { DealClassifierResult } from './deal-signal'
import type { SemanticTagResult } from './semantic-tagger'
import {
  DiscoveryStore,
  type DiscoveryRepository,
  type StoredDealClassification,
  type StoredSemanticEnrichment,
} from './store'

const NOW = new Date('2026-07-25T12:00:00.000Z')
const HASH = 'a'.repeat(64)
const ARTICLE: FeedEntry = {
  externalId: 10, upstreamId: 10, feedId: 2, title: 'Acme raise', url: 'https://acme.example/news',
  commentsUrl: null, author: null, contentText: 'Acme is currently raising capital.', summary: 'Acme is currently raising capital.',
  imageUrl: null, publishedAt: '2026-07-25T00:00:00.000Z', createdAt: '2026-07-25T00:00:00.000Z',
  changedAt: '2026-07-25T01:00:00.000Z', readingTimeMinutes: 1, isRead: false, isSaved: false,
  source: { externalFeedId: 2, title: 'Source', siteUrl: 'https://source.example', feedUrl: 'https://source.example/feed', category: { externalCategoryId: 3, title: 'Tech' } },
}
const SEMANTIC_VALUE = { entities: [], concepts: [], events: [], confidence: 0.5 } as const
const CLASSIFICATION_VALUE = {
  companyName: 'Acme', companyDomain: 'acme.example', signalType: 'active_raise' as const,
  opportunityStatus: 'open' as const, stage: null, amount: null, eventDate: null,
  confidence: 0.9, evidence: ['currently raising capital'],
}

function semanticRecord(overrides: Partial<StoredSemanticEnrichment> = {}): StoredSemanticEnrichment {
  return {
    id: '00000000-0000-4000-8000-000000000010', collectorEntryId: 10, contentHash: HASH,
    semanticVersion: 'semantic-v1', status: 'enriched', payload: SEMANTIC_VALUE,
    provider: 'anthropic', model: 'model', inputTokens: 10, outputTokens: 5,
    retryCount: 0, retryAfter: null, expiresAt: '2026-08-25T12:00:00.000Z', ...overrides,
  }
}

function classificationRecord(overrides: Partial<StoredDealClassification> = {}): StoredDealClassification {
  return {
    id: '00000000-0000-4000-8000-000000000020', enrichmentId: semanticRecord().id,
    contentHash: HASH, classifierVersion: 'deal-signal-v1', status: 'classified', payload: CLASSIFICATION_VALUE,
    provider: 'anthropic', model: 'model', inputTokens: 10, outputTokens: 5,
    retryCount: 0, retryAfter: null, expiresAt: '2026-08-25T12:00:00.000Z', ...overrides,
  }
}

function repository(overrides: Partial<DiscoveryRepository> = {}): DiscoveryRepository {
  return {
    findSemanticForEntry: vi.fn(async () => null),
    findReusableSemantic: vi.fn(async () => null),
    saveSemanticSuccess: vi.fn(async input => semanticRecord({ collectorEntryId: input.article.upstreamId, payload: input.result.value })),
    saveSemanticFailure: vi.fn(async () => undefined),
    findClassificationForEnrichment: vi.fn(async () => null),
    findReusableClassification: vi.fn(async () => null),
    saveClassificationSuccess: vi.fn(async input => classificationRecord({ enrichmentId: input.enrichmentId, payload: input.result.value })),
    saveClassificationFailure: vi.fn(async () => undefined),
    ...overrides,
  }
}

function tagged(): SemanticTagResult {
  return { value: SEMANTIC_VALUE, provider: 'anthropic', model: 'model', version: 'semantic-v1', usage: { inputTokens: 10, outputTokens: 5 }, attemptCount: 1 }
}

function classified(): DealClassifierResult {
  return { value: CLASSIFICATION_VALUE, provider: 'anthropic', model: 'model', version: 'deal-signal-v1', usage: { inputTokens: 10, outputTokens: 5 }, attemptCount: 1 }
}

describe('DiscoveryStore reusable AI lifecycle', () => {
  it('reuses the exact successful entry/hash/version without persistence or AI', async () => {
    const repo = repository({ findSemanticForEntry: vi.fn(async () => semanticRecord()) })
    const compute = vi.fn(async () => tagged())

    const result = await new DiscoveryStore(repo).resolveSemantic({ article: ARTICLE, contentHash: HASH, now: NOW, compute })

    expect(result.state).toBe('reused')
    expect(compute).not.toHaveBeenCalled()
    expect(repo.saveSemanticSuccess).not.toHaveBeenCalled()
  })

  it('copies reusable same-content output to a syndicated entry without another AI call', async () => {
    const reusable = semanticRecord({ collectorEntryId: 9 })
    const repo = repository({ findReusableSemantic: vi.fn(async () => reusable) })
    const compute = vi.fn(async () => tagged())

    const result = await new DiscoveryStore(repo).resolveSemantic({ article: ARTICLE, contentHash: HASH, now: NOW, compute })

    expect(result.state).toBe('reused')
    expect(compute).not.toHaveBeenCalled()
    expect(repo.saveSemanticSuccess).toHaveBeenCalledWith(expect.objectContaining({ copiedFrom: reusable }))
  })

  it('recomputes when the content hash or semantic version changed', async () => {
    const repo = repository({ findSemanticForEntry: vi.fn(async () => semanticRecord({ contentHash: 'b'.repeat(64) })) })
    const compute = vi.fn(async () => tagged())

    const result = await new DiscoveryStore(repo).resolveSemantic({ article: ARTICLE, contentHash: HASH, now: NOW, compute })

    expect(result.state).toBe('created')
    expect(compute).toHaveBeenCalledOnce()
  })

  it('defers an exact failed entry until retry_after', async () => {
    const repo = repository({
      findSemanticForEntry: vi.fn(async () => semanticRecord({ status: 'failed', payload: null, retryAfter: '2026-07-25T13:00:00.000Z' })),
    })
    const compute = vi.fn(async () => tagged())

    const result = await new DiscoveryStore(repo).resolveSemantic({ article: ARTICLE, contentHash: HASH, now: NOW, compute })

    expect(result.state).toBe('deferred')
    expect(compute).not.toHaveBeenCalled()
  })

  it('does not defer or reuse an entry from a previous provider configuration version', async () => {
    const repo = repository({
      findSemanticForEntry: vi.fn(async () => semanticRecord({
        semanticVersion: 'semantic-v1-old-provider',
        status: 'failed',
        payload: null,
        retryAfter: '2026-07-25T13:00:00.000Z',
      })),
    })
    const compute = vi.fn(async () => ({ ...tagged(), version: 'semantic-v1-new-provider' }))

    const result = await new DiscoveryStore(repo, {
      semantic: 'semantic-v1-new-provider',
      classifier: 'deal-signal-v1-new-provider',
    }).resolveSemantic({ article: ARTICLE, contentHash: HASH, now: NOW, compute })

    expect(result.state).toBe('created')
    expect(compute).toHaveBeenCalledOnce()
    expect(repo.findReusableSemantic).toHaveBeenCalledWith(HASH, 'semantic-v1-new-provider', NOW)
  })

  it('reuses Deal classification only for the independent exact classifier version', async () => {
    const reusable = classificationRecord({ enrichmentId: '00000000-0000-4000-8000-000000000099' })
    const repo = repository({ findReusableClassification: vi.fn(async () => reusable) })
    const compute = vi.fn(async () => classified())

    const result = await new DiscoveryStore(repo).resolveClassification({
      enrichment: semanticRecord(), sourceText: ARTICLE.contentText, now: NOW, compute,
    })

    expect(result.state).toBe('reused')
    expect(compute).not.toHaveBeenCalled()
    expect(repo.saveClassificationSuccess).toHaveBeenCalledWith(expect.objectContaining({ copiedFrom: reusable }))
  })
})
