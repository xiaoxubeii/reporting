import { describe, expect, it } from 'vitest'

import { calculateTrending } from './trending'

const NOW = new Date('2026-07-25T12:00:00.000Z')

function observation(input: {
  id: number
  hash?: string
  source?: string
  hoursAgo: number
  label?: string
  normalizedLabel?: string
}) {
  return {
    entryId: input.id,
    contentHash: input.hash ?? String(input.id).padStart(64, '0'),
    sourceRef: input.source ?? `source:${input.id}`,
    publishedAt: new Date(NOW.getTime() - input.hoursAgo * 60 * 60 * 1000).toISOString(),
    tags: [{
      kind: 'technology' as const,
      label: input.label ?? 'Agentic AI',
      normalizedLabel: input.normalizedLabel ?? 'agentic ai',
    }],
  }
}

describe('calculateTrending', () => {
  it('applies the exact 24-hour current and seven-day baseline formula', () => {
    const current = [
      observation({ id: 1, source: 'source:a', hoursAgo: 0 }),
      observation({ id: 2, source: 'source:b', hoursAgo: 4 }),
    ]
    const baseline = Array.from({ length: 7 }, (_, index) =>
      observation({ id: index + 10, source: `source:${index}`, hoursAgo: 24 + index * 12 }))

    const [trend] = calculateTrending([...current, ...baseline], NOW)

    expect(trend).toMatchObject({
      resultKey: 'technology:agentic ai',
      label: 'Agentic AI',
      score: 36,
      metrics: {
        articleCount: 2,
        sourceCount: 2,
        priorArticleCount: 7,
        growth: 1,
        freshness: 1,
        currentWindowHours: 24,
        baselineWindowDays: 7,
      },
    })
  })

  it('requires two unique current hashes and two distinct sources', () => {
    expect(calculateTrending([
      observation({ id: 1, hash: 'a'.repeat(64), source: 'source:a', hoursAgo: 1 }),
      observation({ id: 2, hash: 'a'.repeat(64), source: 'source:b', hoursAgo: 2 }),
    ], NOW)).toEqual([])

    expect(calculateTrending([
      observation({ id: 1, source: 'source:a', hoursAgo: 1 }),
      observation({ id: 2, source: 'source:a', hoursAgo: 2 }),
    ], NOW)).toEqual([])
  })

  it('keeps zero-baseline growth finite and ignores future or expired observations', () => {
    const result = calculateTrending([
      observation({ id: 1, source: 'source:a', hoursAgo: -1 }),
      observation({ id: 2, source: 'source:b', hoursAgo: 1 }),
      observation({ id: 3, source: 'source:c', hoursAgo: 2 }),
      observation({ id: 4, source: 'source:d', hoursAgo: 193 }),
    ], NOW)

    expect(result[0]?.metrics.growth).toBe(2)
    expect(Number.isFinite(result[0]?.score)).toBe(true)
    expect(result[0]?.metrics.articleCount).toBe(2)
  })

  it('normalizes Unicode/case/whitespace and is invariant to input order', () => {
    const left = observation({ id: 1, source: 'source:a', hoursAgo: 1, label: 'Ａgentic   AI', normalizedLabel: ' ＡGENTIC   AI ' })
    const right = observation({ id: 2, source: 'source:b', hoursAgo: 2, label: 'Agentic AI', normalizedLabel: 'agentic ai' })

    expect(calculateTrending([left, right], NOW)).toEqual(calculateTrending([right, left], NOW))
    expect(calculateTrending([left, right], NOW)[0]?.resultKey).toBe('technology:agentic ai')
  })

  it('uses normalized label as the final stable tie-break', () => {
    const beta = [
      observation({ id: 1, source: 'source:a', hoursAgo: 1, label: 'Beta', normalizedLabel: 'beta' }),
      observation({ id: 2, source: 'source:b', hoursAgo: 2, label: 'Beta', normalizedLabel: 'beta' }),
    ]
    const alpha = [
      observation({ id: 3, source: 'source:c', hoursAgo: 1, label: 'Alpha', normalizedLabel: 'alpha' }),
      observation({ id: 4, source: 'source:d', hoursAgo: 2, label: 'Alpha', normalizedLabel: 'alpha' }),
    ]

    expect(calculateTrending([...beta, ...alpha], NOW).map(item => item.label)).toEqual(['Alpha', 'Beta'])
  })
})
