import { describe, expect, it } from 'vitest'

import { parseBackgroundSearchRequest, sanitizeBackgroundSearchResponse } from './background-request'

describe('background Search projection', () => {
  it('accepts only query and toolCallId', () => {
    expect(parseBackgroundSearchRequest({ query: 'TAVR evidence', toolCallId: 'call_123' }))
      .toEqual({ query: 'TAVR evidence', toolCallId: 'call_123' })
    for (const value of [
      { query: 'x', toolCallId: 'bad id' },
      { query: 'x', toolCallId: 'call_1', categoryIds: ['web'] },
      { query: 'x', toolCallId: 'call_1', userId: 'attacker' },
      { query: 'x', toolCallId: 'call_1', endpoint: 'https://attacker.example' },
    ]) expect(() => parseBackgroundSearchRequest(value)).toThrow()
  })

  it('strips personal Feed state while retaining citable source evidence', () => {
    const response = sanitizeBackgroundSearchResponse({
      results: [{
        id: 'feed-1', primaryOrigin: 'feed', origins: ['feed'], title: 'Evidence',
        url: 'https://example.com/evidence', sources: [{ id: 'feeds', label: 'Personal feed' }],
        feedEntryId: 42, isRead: true, isSaved: true,
      }],
      sources: [{ id: 'feeds', status: 'ok', resultCount: 1 }],
      partial: false,
    })
    expect(response.results[0]).not.toHaveProperty('feedEntryId')
    expect(response.results[0]).not.toHaveProperty('isRead')
    expect(response.results[0]).not.toHaveProperty('isSaved')
    expect(response.results[0]?.id).toMatch(/^evidence_[a-f0-9]{24}$/)
    expect(response.results[0]?.id).not.toBe('feed-1')
    expect(response.results[0]?.sources).toEqual([{ id: 'feeds', label: 'Feed evidence' }])
    expect(JSON.stringify(response)).not.toContain('Personal feed')
    expect(response.results[0]).toMatchObject({ title: 'Evidence', url: 'https://example.com/evidence' })
  })

  it('caps result count and fields to a deterministic cache-safe projection', () => {
    const results = Array.from({ length: 30 }, (_, index) => ({
      id: `feed-${index}`,
      primaryOrigin: 'feed' as const,
      origins: ['feed'] as const,
      title: `Evidence ${index} ${'t'.repeat(800)}`,
      url: `https://example.com/${index}/${'u'.repeat(4_000)}`,
      snippet: 's'.repeat(20_000),
      sources: [{ id: 'feeds' as const, label: `Private ${index}` }],
      feedEntryId: index,
    }))
    const response = sanitizeBackgroundSearchResponse({
      results,
      sources: [{ id: 'feeds', status: 'ok', resultCount: 30, message: 'private source title' }],
      partial: false,
    })
    expect(response.results).toHaveLength(10)
    expect(response.results[0]?.title.length).toBeLessThanOrEqual(300)
    expect(response.results[0]?.url).toBeUndefined()
    expect(response.results[0]?.snippet?.length).toBeLessThanOrEqual(1_000)
    expect(JSON.stringify(response).length).toBeLessThan(64 * 1024)
    expect(JSON.stringify(response)).not.toContain('private source title')
  })
})
