import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { internalContext, readExpertEmailThread } = vi.hoisted(() => ({
  internalContext: vi.fn(),
  readExpertEmailThread: vi.fn(),
}))

vi.mock('./api', () => ({ internalContext }))
vi.mock('@/lib/email/fund-thread-read', () => ({ readExpertEmailThread }))

import { GET } from '@/app/api/diligence/[id]/expert-validations/[requestId]/email-thread/route'

const context = {
  admin: { marker: 'service-role-client' },
  gate: { fundId: 'fund-1', userId: 'user-1' },
}
const params = { id: 'deal-1', requestId: 'request-1' }

beforeEach(() => {
  internalContext.mockReset()
  readExpertEmailThread.mockReset()
  internalContext.mockResolvedValue(context)
})

describe('expert email thread GET route', () => {
  it('derives the current member and Fund through the read gate and disables caching', async () => {
    readExpertEmailThread.mockResolvedValue({
      id: 'thread-1', subject: 'Subject', status: 'open', participantAddress: null,
      renderingPolicy: 'plain_text_only', createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z', messages: [],
    })

    const response = await GET(request(), { params })

    expect(response.status).toBe(200)
    expect(internalContext).toHaveBeenCalledWith('read')
    expect(readExpertEmailThread).toHaveBeenCalledWith(context.admin, {
      fundId: 'fund-1', dealId: 'deal-1', requestId: 'request-1',
    })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('cdn-cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('preserves the session denial and still disables caching', async () => {
    internalContext.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const response = await GET(request(), { params })

    expect(response.status).toBe(401)
    expect(readExpertEmailThread).not.toHaveBeenCalled()
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('returns the same generic 404 for a missing or cross-Fund context', async () => {
    readExpertEmailThread.mockResolvedValue(null)

    const response = await GET(request(), { params })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('does not expose database errors', async () => {
    readExpertEmailThread.mockRejectedValue(new Error('private subject and address'))

    const response = await GET(request(), { params })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal error' })
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})

function request() {
  return new NextRequest('http://localhost/api/diligence/deal-1/expert-validations/request-1/email-thread')
}
