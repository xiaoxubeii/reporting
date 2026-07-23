import { describe, expect, it } from 'vitest'
import type { SearchCandidate } from './provider-contracts'
import { mergeSearchCandidates } from './merge'

function candidate(
  id: string,
  origin: SearchCandidate['origin'],
  sourceId: SearchCandidate['source']['id'],
  overrides: Partial<SearchCandidate> = {},
): SearchCandidate {
  return {
    id,
    origin,
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    source: { id: sourceId, label: sourceId },
    ...(origin === 'feed' ? { feedEntryId: Number(id.match(/\d+/)?.[0] ?? 1) } : {}),
    ...overrides,
  }
}

describe('mergeSearchCandidates', () => {
  it('groups exact canonical URLs and keeps Feed primary with all provenance', () => {
    const result = mergeSearchCandidates([
      candidate('web-1', 'web', 'web', { url: 'https://EXAMPLE.com/story?b=2&a=1#top' }),
      candidate('pm-1', 'specialized', 'pubmed', {
        url: 'https://example.com/story?a=1&b=2',
        identifiers: { doi: '10.1000/ABC' },
      }),
      candidate('feed-1', 'feed', 'feeds', {
        url: 'https://example.com/story?a=1&b=2',
        feedEntryId: 44,
        isRead: false,
        isSaved: true,
      }),
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'feed-1',
      primaryOrigin: 'feed',
      origins: ['feed', 'specialized', 'web'],
      url: 'https://example.com/story?a=1&b=2',
      identifiers: { doi: '10.1000/abc' },
      feedEntryId: 44,
      isSaved: true,
    })
    expect(result[0].sources.map(source => source.id)).toEqual(['web', 'pubmed', 'feeds'])
  })

  it('groups exact stable identifiers but never fuzzy-matches titles', () => {
    const result = mergeSearchCandidates([
      candidate('trial-a', 'specialized', 'clinical_trials', {
        title: 'A Trial!',
        url: 'https://clinicaltrials.gov/study/NCT01234567',
        identifiers: { nct: 'nct01234567' },
      }),
      candidate('trial-b', 'specialized', 'pubmed', {
        title: 'Completely different title',
        url: 'https://pubmed.ncbi.nlm.nih.gov/123/',
        identifiers: { nct: 'NCT01234567' },
      }),
      candidate('similar-title', 'web', 'web', {
        title: 'A Trial',
        url: 'https://example.com/not-the-same',
      }),
    ])
    expect(result).toHaveLength(2)
    expect(result[0].sources.map(source => source.id)).toEqual(['clinical_trials', 'pubmed'])
    expect(result[1].id).toBe('similar-title')
  })

  it('round-robins the fixed source buckets while preserving native order', () => {
    const result = mergeSearchCandidates([
      candidate('feed-1', 'feed', 'feeds'),
      candidate('feed-2', 'feed', 'feeds'),
      candidate('pubmed-1', 'specialized', 'pubmed'),
      candidate('pubmed-2', 'specialized', 'pubmed'),
      candidate('fda-1', 'specialized', 'fda'),
      candidate('web-1', 'web', 'web'),
      candidate('web-2', 'web', 'web'),
    ])
    expect(result.map(hit => hit.id)).toEqual([
      'feed-1', 'pubmed-1', 'fda-1', 'web-1',
      'feed-2', 'pubmed-2', 'web-2',
    ])
  })

  it('keeps safe URL-less Feed reader hits and drops unsafe external hits', () => {
    const result = mergeSearchCandidates([
      candidate('feed-only', 'feed', 'feeds', { url: undefined, feedEntryId: 77 }),
      candidate('private', 'web', 'web', { url: 'http://127.0.0.1/admin' }),
      candidate('credentials', 'specialized', 'fda', { url: 'https://user:pass@example.com/a' }),
      candidate('html', 'web', 'web', {
        title: '<script>alert(1)</script><b>Safe title</b>',
        snippet: '<p>Safe snippet</p>',
      }),
    ])
    expect(result.map(hit => hit.id)).toEqual(['feed-only', 'html'])
    expect(result[0]).not.toHaveProperty('url')
    expect(result[1]).toMatchObject({ title: 'Safe title', snippet: 'Safe snippet' })
  })

  it('enforces the immutable 30-result final window', () => {
    const candidates = Array.from({ length: 45 }, (_, index) => candidate(
      `web-${index}`,
      'web',
      'web',
    ))
    expect(mergeSearchCandidates(candidates)).toHaveLength(30)
  })
})
