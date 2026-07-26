import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const internalContext = vi.hoisted(() => vi.fn())
const listExperts = vi.hoisted(() => vi.fn())
const saveExpert = vi.hoisted(() => vi.fn())
const rateLimit = vi.hoisted(() => vi.fn())

vi.mock('@/lib/expert-validation/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/expert-validation/api')>('@/lib/expert-validation/api')
  return { ...actual, internalContext }
})
vi.mock('@/lib/expert-validation/service', () => ({ listExperts, saveExpert }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit }))

import { POST } from '@/app/api/experts/route'

beforeEach(() => {
  vi.clearAllMocks()
  rateLimit.mockResolvedValue(null)
  saveExpert.mockResolvedValue({ expert: { id: 'expert-1' } })
})

afterEach(() => vi.unstubAllEnvs())

describe('expert directory write route', () => {
  it('rejects a non-admin fund member before persistence', async () => {
    internalContext.mockResolvedValue(context('member', 'fund-1'))
    const response = await POST(request(expertBody('fund')))

    expect(response.status).toBe(403)
    expect(saveExpert).not.toHaveBeenCalled()
  })

  it('rejects a platform write outside the configured operations fund', async () => {
    vi.stubEnv('EXPERT_GLOBAL_ADMIN_FUND_ID', 'fund-ops')
    internalContext.mockResolvedValue(context('admin', 'fund-1'))
    const response = await POST(request(expertBody('global')))

    expect(response.status).toBe(400)
    expect(saveExpert).not.toHaveBeenCalled()
  })

  it('allows only the configured operations-fund admin to certify a platform expert', async () => {
    vi.stubEnv('EXPERT_GLOBAL_ADMIN_FUND_ID', 'fund-ops')
    internalContext.mockResolvedValue(context('admin', 'fund-ops'))
    const response = await POST(request(expertBody('global')))

    expect(response.status).toBe(201)
    expect(saveExpert).toHaveBeenCalledWith(expect.objectContaining({
      fundId: 'fund-ops',
      userId: 'user-1',
      allowGlobalWrite: true,
      input: expect.objectContaining({ scope: 'global' }),
    }))
  })

  it('keeps normal admin creation fund-scoped', async () => {
    internalContext.mockResolvedValue(context('admin', 'fund-1'))
    const response = await POST(request(expertBody('fund')))

    expect(response.status).toBe(201)
    expect(saveExpert).toHaveBeenCalledWith(expect.objectContaining({
      fundId: 'fund-1',
      allowGlobalWrite: false,
      input: expect.objectContaining({ scope: 'fund' }),
    }))
  })
})

function context(role: 'admin' | 'member', fundId: string) {
  return { admin: {}, gate: { role, fundId, userId: 'user-1' } }
}

function expertBody(scope: 'global' | 'fund') {
  return { scope, name: 'Ada', email: 'ada@example.test', profileText: 'Clinical AI', status: 'active' }
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/experts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'Sec-Fetch-Site': 'same-origin' },
    body: JSON.stringify(body),
  })
}
