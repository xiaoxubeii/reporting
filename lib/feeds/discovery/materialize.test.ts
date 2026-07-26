import { describe, expect, it } from 'vitest'

import {
  boundPublishItems,
  materializeDiscovery,
  type MaterializationEnrichment,
  type PublishItem,
} from './materialize'

const NOW = new Date('2026-07-25T12:00:00.000Z')

describe('materializeDiscovery', () => {
  it('bounds and deterministically orders source references before atomic publication', () => {
    const enrichments = Array.from({ length: 140 }, (_, index) => enrichment(index + 1))

    const items = materializeDiscovery({ enrichments, classifications: [], now: NOW })
    const trending = items.find(item => item.kind === 'trending')

    expect(trending).toBeDefined()
    expect(trending!.source_entry_refs.length).toBeLessThanOrEqual(100)
    const compactBytes = new TextEncoder().encode(JSON.stringify(trending!.source_entry_refs)).byteLength
    const postgresSeparatorBytes = trending!.source_entry_refs.reduce((total, source) => {
      const keyCount = Object.keys(source).length
      return total + keyCount + Math.max(0, keyCount - 1)
    }, Math.max(0, trending!.source_entry_refs.length - 1))
    expect(compactBytes).toBeLessThanOrEqual(60_000)
    expect(compactBytes + postgresSeparatorBytes).toBeLessThanOrEqual(65_536)
    expect(trending!.source_entry_refs[0]).toMatchObject({ entryId: 140 })
  })

  it('deterministically bounds the complete generation below RPC item and byte limits', () => {
    const items = Array.from({ length: 600 }, (_, index): PublishItem => ({
      kind: index % 2 === 0 ? 'trending' : 'deal_signal',
      result_key: `candidate-${String(index).padStart(4, '0')}`,
      title: `Candidate ${index}`,
      summary: 'Summary',
      score: 100 - (index % 100),
      source_entry_refs: [{ entryId: index + 1, padding: 'x'.repeat(50_000) }],
      evidence_json: [],
      metadata_json: {},
      strategy_version: 'test-v1',
    }))

    const first = boundPublishItems(items)
    const second = boundPublishItems([...items].reverse())
    const compactBytes = new TextEncoder().encode(JSON.stringify(first)).byteLength

    expect(first).toEqual(second)
    expect(first.length).toBeLessThanOrEqual(500)
    expect(first.some(item => item.kind === 'trending')).toBe(true)
    expect(first.some(item => item.kind === 'deal_signal')).toBe(true)
    expect(compactBytes).toBeLessThanOrEqual(900_000)
    expect(compactBytes + 100_000).toBeLessThanOrEqual(1_048_576)
  })

  it('never joins a stale Deal classification to changed article content', () => {
    const current = {
      ...enrichment(1),
      title: 'Acme is currently raising a seed round.',
      contentHash: 'current-content-hash',
      semanticPayload: {
        entities: [{ kind: 'company', name: 'Acme', normalizedName: 'acme', domain: 'acme.example' }],
        concepts: [],
        events: [{
          type: 'funding', status: 'active', companyName: 'Acme', stage: 'Seed',
          amount: null, eventDate: null, evidence: ['currently raising a seed round'],
        }],
        confidence: 0.9,
      },
    }
    const staleClassification = {
      enrichmentId: current.id,
      contentHash: 'previous-content-hash',
      classificationPayload: {
        companyName: 'Acme', companyDomain: 'acme.example', signalType: 'active_raise',
        opportunityStatus: 'open', stage: 'seed', amount: null, eventDate: '2026-07-25',
        confidence: 0.95, evidence: ['currently raising a seed round'],
      },
    }

    const currentItems = materializeDiscovery({
      enrichments: [current],
      classifications: [{ ...staleClassification, contentHash: current.contentHash }],
      now: NOW,
    })
    const items = materializeDiscovery({ enrichments: [current], classifications: [staleClassification], now: NOW })

    expect(currentItems.some(item => item.kind === 'deal_signal')).toBe(true)
    expect(items.some(item => item.kind === 'deal_signal')).toBe(false)
  })
})

function enrichment(entryId: number): MaterializationEnrichment {
  return {
    id: `00000000-0000-4000-8000-${String(entryId).padStart(12, '0')}`,
    entryId,
    entryRef: `explore:entry:${entryId}`,
    contentHash: `hash-${entryId}`,
    title: `${'A'.repeat(900)} ${entryId}`,
    url: `https://source-${entryId}.example/article`,
    sourceRef: `explore:source:${entryId}`,
    sourceTitle: `Source ${entryId}`,
    publishedAt: new Date(NOW.getTime() - (140 - entryId) * 1_000).toISOString(),
    semanticPayload: {
      entities: [],
      concepts: [{ kind: 'technology', name: 'Agentic AI', normalizedName: 'agentic ai' }],
      events: [],
      confidence: 0.9,
    },
  }
}
