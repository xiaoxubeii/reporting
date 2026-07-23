import { describe, expect, it } from 'vitest'
import {
  filterFeedEntries,
  groupFeedEntriesByCategory,
  mergeFeedEntryPages,
  shouldResetFeedPagination,
  type FeedEntryView,
} from './today-state'

const entry = (id: number, overrides: Partial<FeedEntryView> = {}): FeedEntryView => ({
  externalId: id,
  upstreamId: id,
  feedId: 42,
  title: `Entry ${id}`,
  url: `https://example.com/${id}`,
  commentsUrl: null,
  author: null,
  contentText: `Body ${id}`,
  summary: `Body ${id}`,
  imageUrl: null,
  publishedAt: `2026-07-${String(id).padStart(2, '0')}T10:00:00.000Z`,
  createdAt: `2026-07-${String(id).padStart(2, '0')}T10:00:00.000Z`,
  readingTimeMinutes: 1,
  source: { externalFeedId: 42, title: 'Example', siteUrl: 'https://example.com', feedUrl: 'https://example.com/feed.xml', category: null },
  isRead: false,
  isSaved: false,
  ...overrides,
})

describe('mergeFeedEntryPages', () => {
  it('deduplicates immutable pages and preserves upstream page ordering', () => {
    const first = [entry(3), entry(2)]
    const merged = mergeFeedEntryPages(first, [
      entry(2, { title: 'Updated', publishedAt: '2030-01-01T00:00:00.000Z' }),
      entry(1, { publishedAt: '2031-01-01T00:00:00.000Z' }),
    ])
    expect(merged.map(item => item.upstreamId)).toEqual([3, 2, 1])
    expect(merged[1].title).toBe('Updated')
    expect(merged).not.toBe(first)
  })
})

describe('filterFeedEntries', () => {
  const entries = [
    entry(3, { title: 'Climate funding', isSaved: true }),
    entry(2, { title: 'Healthcare update', isRead: true }),
  ]

  it('supports unread, saved, and local search without mutating the list', () => {
    expect(filterFeedEntries(entries, { filter: 'unread', query: '' }).map(x => x.upstreamId)).toEqual([3])
    expect(filterFeedEntries(entries, { filter: 'saved', query: '' }).map(x => x.upstreamId)).toEqual([3])
    expect(filterFeedEntries(entries, { filter: 'all', query: 'health' }).map(x => x.upstreamId)).toEqual([2])
    expect(entries).toHaveLength(2)
  })
})

describe('groupFeedEntriesByCategory', () => {
  it('groups by Miniflux category while preserving first-category and entry order', () => {
    const healthcare = { externalCategoryId: 7, title: 'Healthcare' }
    const technology = { externalCategoryId: 9, title: 'Technology' }
    const entries = [
      entry(5, { source: { ...entry(5).source, category: healthcare } }),
      entry(4, { source: { ...entry(4).source, category: technology } }),
      entry(3, { source: { ...entry(3).source, category: healthcare } }),
    ]

    const groups = groupFeedEntriesByCategory(entries)

    expect(groups.map(group => group.label)).toEqual(['Healthcare', 'Technology'])
    expect(groups[0]?.items.map(item => item.upstreamId)).toEqual([5, 3])
    expect(groups[1]?.items.map(item => item.upstreamId)).toEqual([4])
  })

  it('uses a stable fallback group for entries without category metadata', () => {
    expect(groupFeedEntriesByCategory([entry(2), entry(1)])[0]).toMatchObject({
      categoryId: null,
      label: 'Uncategorized',
    })
  })

  it('keeps equal category names with different Miniflux ids separate', () => {
    const groups = groupFeedEntriesByCategory([
      entry(2, { source: { ...entry(2).source, category: { externalCategoryId: 7, title: 'All' } } }),
      entry(1, { source: { ...entry(1).source, category: { externalCategoryId: 8, title: 'All' } } }),
    ])

    expect(groups.map(group => group.key)).toEqual(['category:7', 'category:8'])
  })
})

describe('shouldResetFeedPagination', () => {
  it('resets offset pagination when a mutation changes membership in the active upstream filter', () => {
    expect(shouldResetFeedPagination('unread', { isRead: true })).toBe(true)
    expect(shouldResetFeedPagination('saved', { isSaved: false })).toBe(true)
    expect(shouldResetFeedPagination('saved', { isSaved: true })).toBe(true)
    expect(shouldResetFeedPagination('all', { isRead: true })).toBe(false)
  })
})
