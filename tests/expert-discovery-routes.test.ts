import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const internalContext = vi.hoisted(() => vi.fn())
const discoverExperts = vi.hoisted(() => vi.fn())
const listCandidates = vi.hoisted(() => vi.fn())
const rateLimit = vi.hoisted(() => vi.fn())
const loadSearchSourcePolicy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/expert-validation/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/expert-validation/api')>('@/lib/expert-validation/api')
  return { ...actual, internalContext }
})
vi.mock('@/lib/expert-discovery/service', () => ({ discoverExperts, listCandidates }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit }))
vi.mock('@/lib/search/source-policy', () => ({ loadSearchSourcePolicy }))

import { GET } from '@/app/api/experts/discovery/route'
import { POST } from '@/app/api/experts/discovery/search/route'

beforeEach(() => {
  vi.clearAllMocks()
  rateLimit.mockResolvedValue(null)
  loadSearchSourcePolicy.mockResolvedValue({ specialized: { pubmed: true, clinical_trials: true } })
  discoverExperts.mockResolvedValue({ candidates: [], sources: [] })
  listCandidates.mockResolvedValue([])
})

describe('expert discovery routes', () => {
  it('hides the candidate queue from non-admin members', async () => {
    internalContext.mockResolvedValue(context('member'))
    const response = await GET(new NextRequest('http://localhost/api/experts/discovery'))

    expect(response.status).toBe(403)
    expect(listCandidates).not.toHaveBeenCalled()
  })

  it('rejects discovery by a non-admin before external source calls', async () => {
    internalContext.mockResolvedValue(context('member'))
    const response = await POST(request({ query: 'cardiac AI', sourceIds: ['pubmed'] }))

    expect(response.status).toBe(403)
    expect(discoverExperts).not.toHaveBeenCalled()
  })

  it('uses only the authenticated fund and filters sources through policy', async () => {
    internalContext.mockResolvedValue(context('admin'))
    loadSearchSourcePolicy.mockResolvedValue({ specialized: { pubmed: true, clinical_trials: false } })
    const response = await POST(request({ query: 'cardiac AI', sourceIds: ['pubmed', 'clinical_trials'], fundId: 'attacker-fund' }))

    expect(response.status).toBe(200)
    expect(discoverExperts).toHaveBeenCalledWith(expect.objectContaining({
      fundId: 'fund-1',
      userId: 'user-1',
      query: 'cardiac AI',
      sourceIds: ['pubmed'],
    }))
  })
})

function context(role: 'admin' | 'member') {
  return { admin: {}, gate: { role, fundId: 'fund-1', userId: 'user-1' } }
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/experts/discovery/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'Sec-Fetch-Site': 'same-origin' },
    body: JSON.stringify(body),
  })
}
