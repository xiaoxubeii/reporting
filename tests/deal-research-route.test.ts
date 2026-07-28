import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const getUser = vi.hoisted(() => vi.fn())
const assertRouteAccess = vi.hoisted(() => vi.fn())
const hasAccess = vi.hoisted(() => vi.fn(() => true))
const queueDealResearch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ admin: true }) }))
vi.mock('@/lib/access/gate', () => ({ assertRouteAccess }))
vi.mock('@/lib/access/effective', () => ({ hasAccess }))
vi.mock('@/lib/deals/research-queue', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/deals/research-queue')>(),
  queueDealResearch,
}))

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  assertRouteAccess.mockResolvedValue({ fundId: 'fund-1', userId: 'user-1', role: 'member', access: {} })
  queueDealResearch.mockResolvedValue({ queued: true, already: false, jobId: 'job-1' })
})

describe('POST /api/deals/[id]/research', () => {
  it('derives the durable actor only from Session and the live route gate', async () => {
    const { POST } = await import('@/app/api/deals/[id]/research/route')
    const response = await POST(request(), { params: { id: 'deal-1' } })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ job_id: 'job-1', already: false })
    expect(assertRouteAccess).toHaveBeenCalledWith(expect.anything(), 'user-1', 'api/deals/[id]/research', 'POST')
    expect(queueDealResearch).toHaveBeenCalledWith({
      dealId: 'deal-1', fundId: 'fund-1', actor: { type: 'user', userId: 'user-1' },
    })
  })

  it('never enqueues for an absent Session or denied/foreign fund gate', async () => {
    const { POST } = await import('@/app/api/deals/[id]/research/route')
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await POST(request(), { params: { id: 'deal-1' } })).status).toBe(401)

    assertRouteAccess.mockResolvedValueOnce(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await POST(request(), { params: { id: 'deal-1' } })).status).toBe(403)
    expect(queueDealResearch).not.toHaveBeenCalled()
  })

  it('does not enqueue when live Search read access is unavailable', async () => {
    const { POST } = await import('@/app/api/deals/[id]/research/route')
    hasAccess.mockReturnValueOnce(false)
    const response = await POST(request(), { params: { id: 'deal-1' } })
    expect(response.status).toBe(403)
    expect(queueDealResearch).not.toHaveBeenCalled()
  })
})

function request() {
  return new NextRequest('https://reporting.example/api/deals/deal-1/research', { method: 'POST' })
}
