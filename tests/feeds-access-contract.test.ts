import { describe, expect, it } from 'vitest'
import { domainForFeature, domainGrantableToMembers } from '@/lib/access/domains'
import { effectiveAccess } from '@/lib/access/effective'
import { ROUTE_DOMAINS } from '@/lib/access/route-domains'
import { DEFAULT_FEATURE_VISIBILITY } from '@/lib/types/features'
import { isFeedMutationAllowed } from '@/lib/feeds/route-context'

describe('Feeds access contract', () => {
  it('is independently switchable inside the existing dealflow domain', () => {
    expect(domainForFeature('feeds')).toBe('dealflow')
    expect((DEFAULT_FEATURE_VISIBILITY as Record<string, string>).feeds).toBe('admin')
  })

  it('lets admins grant Dealflow when Feeds is open even if Deals remains admin-only', () => {
    const features = {
      ...DEFAULT_FEATURE_VISIBILITY,
      deals: 'admin' as const,
      feeds: 'everyone' as const,
    }

    expect(domainGrantableToMembers('dealflow', features)).toBe(true)
    expect(effectiveAccess({
      fundId: 'fund-1',
      userId: 'member-1',
      role: 'member',
      features,
      grants: { dealflow: 'read' },
      defaults: {},
    }, 'dealflow', 'feeds')).toBe('read')
    expect(effectiveAccess({
      fundId: 'fund-1',
      userId: 'member-1',
      role: 'member',
      features,
      grants: { dealflow: 'read' },
      defaults: {},
    }, 'dealflow', 'deals')).toBe('none')
  })

  it('maps every Feeds API to feature=feeds instead of inheriting deals', () => {
    const expected = [
      'api/feeds/connection',
      'api/feeds/sources',
      'api/feeds/discover',
      'api/feeds/subscriptions',
      'api/feeds/subscriptions/[id]',
      'api/feeds/entries',
      'api/feeds/entries/[id]',
      'api/feeds/entries/[id]/state',
      'api/feeds/explore/categories',
      'api/feeds/explore/discovery',
      'api/feeds/explore/discovery/refresh',
      'api/feeds/explore/entries',
      'api/feeds/explore/entries/[id]',
      'api/feeds/explore/following',
      'api/feeds/explore/sources',
      'api/feeds/explore/sources/[id]/follow',
    ]
    for (const key of expected) {
      expect(ROUTE_DOMAINS[key], key).toMatchObject({ domain: 'dealflow', feature: 'feeds' })
    }
  })

  it('treats personal Miniflux mutations as reader actions', () => {
    expect(ROUTE_DOMAINS['api/feeds/connection'].level).toMatchObject({ POST: 'read', DELETE: 'read' })
    expect(ROUTE_DOMAINS['api/feeds/subscriptions'].level).toMatchObject({ POST: 'read' })
    expect(ROUTE_DOMAINS['api/feeds/subscriptions/[id]'].level).toMatchObject({ DELETE: 'read' })
    expect(ROUTE_DOMAINS['api/feeds/entries/[id]/state'].level).toMatchObject({ PATCH: 'read' })
    expect(ROUTE_DOMAINS['api/feeds/explore/sources/[id]/follow'].level).toMatchObject({ POST: 'read' })
  })

  it('keeps collector records read-only while allowing bounded personal Follow and Fund refresh orchestration', () => {
    const exploreRoutes = Object.keys(ROUTE_DOMAINS).filter(key => key.startsWith('api/feeds/explore/'))
    expect(exploreRoutes.sort()).toEqual([
      'api/feeds/explore/categories',
      'api/feeds/explore/discovery',
      'api/feeds/explore/discovery/refresh',
      'api/feeds/explore/entries',
      'api/feeds/explore/entries/[id]',
      'api/feeds/explore/following',
      'api/feeds/explore/sources',
      'api/feeds/explore/sources/[id]/follow',
    ])
    expect(exploreRoutes.some(key => /state|saved|read|subscriptions|categories\//.test(key))).toBe(false)
  })

  it('keeps the read-only demo viewer unable to mutate personal feeds', () => {
    expect(isFeedMutationAllowed('viewer', 'POST')).toBe(false)
    expect(isFeedMutationAllowed('viewer', 'PATCH')).toBe(false)
    expect(isFeedMutationAllowed('member', 'POST')).toBe(true)
    expect(isFeedMutationAllowed('viewer', 'GET')).toBe(true)
  })
})
