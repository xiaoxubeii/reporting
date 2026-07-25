import { describe, expect, it } from 'vitest'
import type { FeedSourceResult, FeedTopicResult } from '@/components/feeds/api'
import { filterFollowingSources, groupFollowingSources } from '@/components/feeds/following-groups'

describe('groupFollowingSources', () => {
  it('uses non-empty personal categories and keeps Uncategorized last', () => {
    const groups = groupFollowingSources([
      source('health', ['Healthcare']),
      source('uncategorized', []),
      source('business', ['Business']),
    ], [
      topic(8, 'Healthcare'),
      topic(9, 'Business'),
    ], 'Uncategorized')

    expect(groups.map(group => [group.label, group.sources.map(item => item.id)])).toEqual([
      ['Healthcare', ['health']],
      ['Business', ['business']],
      ['Uncategorized', ['uncategorized']],
    ])
  })

  it('omits empty groups after source filtering without dropping unknown categories', () => {
    const groups = groupFollowingSources([
      source('business', ['Business']),
      source('new-category', ['New category']),
    ], [
      topic(8, 'Healthcare'),
      topic(9, 'Business'),
    ], 'Uncategorized')

    expect(groups.map(group => group.label)).toEqual(['Business', 'New category'])
  })

  it('assigns a malformed multi-category source only to its first category', () => {
    const item = source('one', ['Healthcare', 'Business'])
    const groups = groupFollowingSources([item], [
      topic(8, 'Healthcare'),
      topic(9, 'Business'),
    ], 'Uncategorized')

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ label: 'Healthcare', sources: [item] })
  })
})

describe('filterFollowingSources', () => {
  const item: FeedSourceResult = {
    id: 'nature',
    name: 'Nature Reviews Cardiology',
    siteUrl: 'https://www.nature.com/cardiology',
    description: 'Clinical reviews',
    logoUrl: null,
    topics: ['Cardiology'],
    endpoints: [{
      id: 'endpoint:7',
      feedUrl: 'https://www.nature.com/cardiology.rss',
      title: 'Nature Cardiology RSS',
      format: 'rss',
      health: 'healthy',
      isFollowing: true,
      subscriptionId: 7,
    }],
  }

  it.each(['nature', 'clinical', 'cardiology', 'nature.com', 'cardiology.rss', 'rss'])(
    'matches personal source and endpoint metadata for %s',
    query => expect(filterFollowingSources([item], query)).toEqual([item]),
  )

  it('filters URL-shaped queries instead of treating them as discovery commands', () => {
    expect(filterFollowingSources([item], 'https://example.com/feed.xml')).toEqual([])
  })
})

function source(id: string, topics: string[]): FeedSourceResult {
  return {
    id,
    name: id,
    siteUrl: null,
    description: null,
    logoUrl: null,
    topics,
    endpoints: [],
  }
}

function topic(id: number, name: string): FeedTopicResult {
  return { id, name, count: 1, unreadCount: 0 }
}
