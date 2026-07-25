import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  assertAdminAccess: vi.fn(),
  selectMaybeSingle: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  updateSelect: vi.fn(),
  updateMaybeSingle: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.selectMaybeSingle }) }),
      update: mocks.update,
    }),
  }),
}))
vi.mock('@/lib/api-helpers', () => ({ assertAdminAccess: mocks.assertAdminAccess }))

import { GET, PUT } from '@/app/api/settings/search-categories/route'

const CONFIG = {
  version: 1,
  categories: [{
    id: 'internet',
    label: { en: 'Internet', 'zh-CN': '互联网' },
    description: { en: '', 'zh-CN': '' },
    enabled: true,
    defaultSelected: true,
    adapterIds: ['web'],
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mocks.assertAdminAccess.mockResolvedValue({ fundId: 'fund-1', role: 'admin' })
  mocks.selectMaybeSingle.mockResolvedValue({ data: { search_category_config: CONFIG }, error: null })
  mocks.updateMaybeSingle.mockResolvedValue({ data: { fund_id: 'fund-1' }, error: null })
  mocks.updateSelect.mockReturnValue({ maybeSingle: mocks.updateMaybeSingle })
  mocks.updateEq.mockReturnValue({ select: mocks.updateSelect })
  mocks.update.mockReturnValue({ eq: mocks.updateEq })
})

describe('Search category settings route', () => {
  it('returns fund categories and the code-owned adapter catalog to an admin', async () => {
    const response = await GET()
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.config).toEqual(CONFIG)
    expect(body.adapters.map((adapter: { id: string }) => adapter.id)).toContain('web')
  })

  it('atomically updates only the authenticated admin fund', async () => {
    const response = await PUT(new Request('http://localhost/api/settings/search-categories', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost',
        'Sec-Fetch-Site': 'same-origin',
      },
      body: JSON.stringify(CONFIG),
    }))
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ search_category_config: CONFIG })
    expect(mocks.updateEq).toHaveBeenCalledWith('fund_id', 'fund-1')
    expect(mocks.updateSelect).toHaveBeenCalledWith('fund_id')
  })

  it('denies non-admins and rejects adapter IDs that are not code registered', async () => {
    mocks.assertAdminAccess.mockResolvedValueOnce(NextResponse.json({ error: 'Admin access required' }, { status: 403 }))
    expect((await GET()).status).toBe(403)

    const invalid = { ...CONFIG, categories: [{ ...CONFIG.categories[0], adapterIds: ['retired_adapter'] }] }
    const response = await PUT(new Request('http://localhost/api/settings/search-categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify(invalid),
    }))
    expect(response.status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('accepts a valid category catalog larger than the Search query body limit', async () => {
    const largeConfig = {
      version: 1,
      categories: Array.from({ length: 20 }, (_, index) => ({
        id: `category-${index}`,
        label: { en: `Category ${index}`, 'zh-CN': `分类 ${index}` },
        description: { en: 'a'.repeat(240), 'zh-CN': '中'.repeat(240) },
        enabled: true,
        defaultSelected: false,
        adapterIds: ['feeds', 'web', 'pubmed', 'clinical_trials', 'fda', 'tctmd', 'massdevice'],
      })),
    }
    const body = JSON.stringify(largeConfig)
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(16 * 1024)
    const response = await PUT(new Request('http://localhost/api/settings/search-categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body,
    }))
    expect(response.status).toBe(200)
  })

  it('does not report success when the fund settings row is missing', async () => {
    mocks.updateMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const response = await PUT(new Request('http://localhost/api/settings/search-categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify(CONFIG),
    }))
    expect(response.status).toBe(500)
  })
})
