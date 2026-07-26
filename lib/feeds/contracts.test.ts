import { describe, expect, it } from 'vitest'
import { normalizeMinifluxEntry, normalizeMinifluxEntryPage } from './contracts'

const rawEntry = {
  id: 888,
  feed_id: 42,
  title: '  A useful update  ',
  url: 'https://example.com/article',
  comments_url: 'https://example.com/article#comments',
  author: 'Jane Doe',
  content: '<p>First <b>paragraph</b>.</p><script>alert(1)</script><p>Second &amp; final.</p>',
  published_at: '2026-07-22T10:00:00Z',
  created_at: '2026-07-22T10:02:00Z',
  reading_time: 3,
  status: 'read',
  starred: true,
  enclosures: [{ url: 'https://cdn.example.com/hero.jpg', mime_type: 'image/jpeg' }],
  feed: {
    id: 42,
    title: 'Example News',
    site_url: 'https://example.com',
    feed_url: 'https://example.com/feed.xml',
    category: { id: 7, title: 'Healthcare AI' },
  },
}

describe('normalizeMinifluxEntry', () => {
  it('returns an immutable, safe application contract', () => {
    const entry = normalizeMinifluxEntry(rawEntry)

    expect(entry).toEqual({
      externalId: 888,
      upstreamId: 888,
      feedId: 42,
      title: 'A useful update',
      url: 'https://example.com/article',
      commentsUrl: 'https://example.com/article#comments',
      author: 'Jane Doe',
      contentText: 'First paragraph.\nSecond & final.',
      summary: 'First paragraph. Second & final.',
      imageUrl: 'https://cdn.example.com/hero.jpg',
      publishedAt: '2026-07-22T10:00:00.000Z',
      createdAt: '2026-07-22T10:02:00.000Z',
      changedAt: null,
      readingTimeMinutes: 3,
      isRead: true,
      isSaved: true,
      source: {
        externalFeedId: 42,
        title: 'Example News',
        siteUrl: 'https://example.com',
        feedUrl: 'https://example.com/feed.xml',
        category: { externalCategoryId: 7, title: 'Healthcare AI' },
      },
    })
    expect(Object.isFrozen(entry)).toBe(true)
    expect(Object.isFrozen(entry.source.category)).toBe(true)
    expect(entry.contentText).not.toContain('alert')
    expect(entry.contentText).not.toContain('<')
  })

  it('bounds untrusted Miniflux category titles at the normalization boundary', () => {
    const entry = normalizeMinifluxEntry({
      ...rawEntry,
      feed: {
        ...rawEntry.feed,
        category: { id: 7, title: ` Healthcare ${'x'.repeat(400)} ` },
      },
    })

    expect(entry.source.category?.title).toHaveLength(200)
    expect(entry.source.category?.title.startsWith('Healthcare ')).toBe(true)

    const blank = normalizeMinifluxEntry({
      ...rawEntry,
      feed: { ...rawEntry.feed, category: { id: 7, title: '\u0000\n\t' } },
    })
    expect(blank.source.category?.title).toBe('Uncategorized')
  })

  it('uses safe fallbacks and rejects entries without a stable id', () => {
    const minimal = normalizeMinifluxEntry({ id: 9, feed_id: 2, title: '', url: 'javascript:bad', status: 'unread', starred: false })
    expect(minimal.title).toBe('Untitled')
    expect(minimal.url).toBeNull()
    expect(minimal.contentText).toBe('')
    expect(minimal).toMatchObject({ externalId: 9, upstreamId: 9, feedId: 2, isRead: false, isSaved: false })
    expect(minimal.source.category).toBeNull()
    expect(() => normalizeMinifluxEntry({ title: 'orphan' })).toThrow(/id/i)
    expect(() => normalizeMinifluxEntry({ id: '9', feed_id: 2 })).toThrow(/numeric/i)
    expect(() => normalizeMinifluxEntry({ id: 9, feed_id: '2' })).toThrow(/numeric/i)
  })
})

describe('normalizeMinifluxEntryPage', () => {
  it('normalizes the documented result envelope and pagination metadata', () => {
    const page = normalizeMinifluxEntryPage({ total: 3, entries: [rawEntry] }, { limit: 1, offset: 0 })
    expect(page.items).toHaveLength(1)
    expect(page.total).toBe(3)
    expect(page.nextOffset).toBe(1)
  })

  it('advances by entries actually consumed when Miniflux returns a short page', () => {
    const page = normalizeMinifluxEntryPage({ total: 10, entries: [rawEntry] }, { limit: 20, offset: 4 })
    expect(page.nextOffset).toBe(5)
  })

  it('drops malformed rows instead of failing the whole feed', () => {
    const page = normalizeMinifluxEntryPage({ total: 2, entries: [{ title: 'bad' }, rawEntry] }, { limit: 20, offset: 0 })
    expect(page.items.map(item => item.upstreamId)).toEqual([888])
    expect(page.nextOffset).toBeNull()
  })
})
