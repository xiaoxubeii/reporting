import { describe, expect, it } from 'vitest'
import type { ExploreEntryResult } from '@/components/feeds/api'
import { groupExploreEntriesByCategory, mergeExploreEntryPages } from './explore-state'

describe('Explore client state', () => {
  it('merges pages without duplicating entries', () => {
    expect(mergeExploreEntryPages([entry('explore-entry:1', 'A')], [
      entry('explore-entry:1', 'A updated'), entry('explore-entry:2', 'B'),
    ]).map(item => item.title)).toEqual(['A updated', 'B'])
  })

  it('groups latest articles by curated category', () => {
    const groups = groupExploreEntriesByCategory([
      entry('explore-entry:1', 'A', 'explore-category:8', 'Healthcare AI'),
      entry('explore-entry:2', 'B', 'explore-category:9', 'Drug Discovery'),
      entry('explore-entry:3', 'C', 'explore-category:8', 'Healthcare AI'),
    ])
    expect(groups.map(group => [group.key, group.items.length])).toEqual([
      ['explore-category:8', 2], ['explore-category:9', 1],
    ])
  })
})

function entry(
  id: string,
  title: string,
  categoryId = 'explore-category:8',
  categoryTitle = 'Healthcare AI',
): ExploreEntryResult {
  return {
    id, title, summary: '', contentText: '', imageUrl: null, publishedAt: null,
    originalUrl: null, author: null, readingTimeMinutes: null,
    source: { id: 'explore-source:42', title: 'Source', siteUrl: null },
    category: { id: categoryId, title: categoryTitle },
  }
}
