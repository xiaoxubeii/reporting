import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { createDefaultFundPublicSiteContent } from '@/lib/fund-public-site/content'

const requireAdmin = vi.hoisted(() => vi.fn())
const getOrCreate = vi.hoisted(() => vi.fn())
const saveDraft = vi.hoisted(() => vi.fn())
const publishSite = vi.hoisted(() => vi.fn())
const unpublishSite = vi.hoisted(() => vi.fn())

vi.mock('@/lib/fund-public-site/admin', () => ({ requireFundPublicSiteAdmin: requireAdmin }))
vi.mock('@/lib/fund-public-site/store', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/fund-public-site/store')>()
  return {
    ...original,
    getOrCreateFundPublicSiteDraft: getOrCreate,
    saveFundPublicSiteDraft: saveDraft,
    publishFundPublicSite: publishSite,
    unpublishFundPublicSite: unpublishSite,
  }
})

import { GET, PATCH } from '@/app/api/settings/public-site/route'
import { POST as publish } from '@/app/api/settings/public-site/publish/route'
import { POST as unpublish } from '@/app/api/settings/public-site/unpublish/route'
import { FundPublicSiteConflictError } from '@/lib/fund-public-site/store'

const content = createDefaultFundPublicSiteContent('Alpha Ventures')
const site = {
  templateKey: 'focus' as const,
  content,
  draftRevision: 4,
  lifecycleRevision: 7,
  publishedVersion: 2,
  publishedFromDraftRevision: 3,
  isPublished: true,
  publishedAt: '2026-07-26T00:00:00Z',
  hasUnpublishedChanges: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAdmin.mockResolvedValue({ admin: {}, fundId: 'fund-alpha', fundName: 'Alpha Ventures', tenantSlug: 'alpha', userId: 'user-alpha' })
  getOrCreate.mockResolvedValue(site)
  saveDraft.mockResolvedValue({ ...site, draftRevision: 5 })
  publishSite.mockResolvedValue({ ...site, publishedVersion: 3, publishedFromDraftRevision: 4, hasUnpublishedChanges: false })
  unpublishSite.mockResolvedValue({ ...site, isPublished: false })
})

function request(path: string, method: string, body?: unknown) {
  const origin = 'http://alpha.localhost'
  return new NextRequest(`http://alpha.localhost${path}`, {
    method,
    headers: method === 'GET' ? undefined : {
      'Content-Type': 'application/json',
      Origin: origin,
      'Sec-Fetch-Site': 'same-origin',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('Fund public site settings API', () => {
  it('passes authentication/authorization denial through and disables caching', async () => {
    requireAdmin.mockResolvedValue(NextResponse.json({ error: 'Authentication required' }, { status: 401 }))
    const response = await GET(request('/api/settings/public-site', 'GET'))
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(getOrCreate).not.toHaveBeenCalled()
  })

  it('loads only the guard-derived Fund', async () => {
    const response = await GET(request('/api/settings/public-site', 'GET'))
    expect(response.status).toBe(200)
    expect(getOrCreate).toHaveBeenCalledWith({}, 'fund-alpha', 'Alpha Ventures', 'user-alpha')
    expect(await response.json()).toMatchObject({ fund: { name: 'Alpha Ventures', slug: 'alpha' }, site: { draftRevision: 4 } })
  })

  it('rejects Fund identifiers and unknown fields instead of silently ignoring them', async () => {
    const response = await PATCH(request('/api/settings/public-site', 'PATCH', {
      expectedRevision: 4,
      templateKey: 'focus',
      content,
      fundId: 'fund-beta',
    }))
    expect(response.status).toBe(400)
    expect(saveDraft).not.toHaveBeenCalled()
  })

  it('validates and saves with optimistic revision and server-derived scope', async () => {
    const response = await PATCH(request('/api/settings/public-site', 'PATCH', {
      expectedRevision: 4,
      templateKey: 'institutional',
      content,
    }))
    expect(response.status).toBe(200)
    expect(saveDraft).toHaveBeenCalledWith({}, {
      fundId: 'fund-alpha',
      userId: 'user-alpha',
      expectedRevision: 4,
      templateKey: 'institutional',
      content,
    })
  })

  it('returns 409 for stale saves and publishes', async () => {
    saveDraft.mockRejectedValueOnce(new FundPublicSiteConflictError('stale'))
    const saveResponse = await PATCH(request('/api/settings/public-site', 'PATCH', { expectedRevision: 4, templateKey: 'focus', content }))
    expect(saveResponse.status).toBe(409)

    publishSite.mockRejectedValueOnce(new FundPublicSiteConflictError('stale'))
    const publishResponse = await publish(request('/api/settings/public-site/publish', 'POST', { expectedDraftRevision: 4, expectedLifecycleRevision: 7 }))
    expect(publishResponse.status).toBe(409)

    unpublishSite.mockRejectedValueOnce(new FundPublicSiteConflictError('stale'))
    const unpublishResponse = await unpublish(request('/api/settings/public-site/unpublish', 'POST', { expectedLifecycleRevision: 7 }))
    expect(unpublishResponse.status).toBe(409)
  })

  it('returns bounded JSON errors from unpublish instead of a generic 500', async () => {
    const invalid = new NextRequest('http://alpha.localhost/api/settings/public-site/unpublish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://alpha.localhost',
        'Sec-Fetch-Site': 'same-origin',
      },
      body: '{',
    })
    expect((await unpublish(invalid)).status).toBe(400)

    const oversized = new NextRequest('http://alpha.localhost/api/settings/public-site/unpublish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://alpha.localhost',
        'Sec-Fetch-Site': 'same-origin',
      },
      body: JSON.stringify({ padding: 'x'.repeat(65 * 1024) }),
    })
    expect((await unpublish(oversized)).status).toBe(413)
  })

  it('publishes and unpublishes only the guard-derived Fund', async () => {
    expect((await publish(request('/api/settings/public-site/publish', 'POST', { expectedDraftRevision: 4, expectedLifecycleRevision: 7 }))).status).toBe(200)
    expect(publishSite).toHaveBeenCalledWith({}, 'fund-alpha', 'user-alpha', 4, 7)
    expect((await unpublish(request('/api/settings/public-site/unpublish', 'POST', { expectedLifecycleRevision: 7 }))).status).toBe(200)
    expect(unpublishSite).toHaveBeenCalledWith({}, 'fund-alpha', 'user-alpha', 7)
  })

  it('rejects sibling-Fund origins and non-JSON mutations before authorization', async () => {
    const siblingRequest = new NextRequest('http://alpha.localhost/api/settings/public-site/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://beta.localhost',
        'Sec-Fetch-Site': 'same-site',
      },
      body: JSON.stringify({ expectedDraftRevision: 4, expectedLifecycleRevision: 7 }),
    })
    expect((await publish(siblingRequest)).status).toBe(403)

    const formRequest = new NextRequest('http://alpha.localhost/api/settings/public-site/unpublish', {
      method: 'POST',
      headers: { Origin: 'http://alpha.localhost', 'Sec-Fetch-Site': 'same-origin' },
      body: '{}',
    })
    expect((await unpublish(formRequest)).status).toBe(415)
    expect(requireAdmin).not.toHaveBeenCalled()
    expect(publishSite).not.toHaveBeenCalled()
    expect(unpublishSite).not.toHaveBeenCalled()
  })
})
