import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { internalContext } from './api'

const { createClient, createAdminClient, getUser, assertDomainAccess } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getUser: vi.fn(),
  assertDomainAccess: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/access/gate', () => ({ assertDomainAccess }))

beforeEach(() => {
  getUser.mockReset()
  createClient.mockReset()
  createAdminClient.mockReset()
  assertDomainAccess.mockReset()
  createClient.mockReturnValue({ auth: { getUser } })
  createAdminClient.mockReturnValue({ marker: 'service-role-client' })
})

describe('expert validation internal context', () => {
  it('derives user and Fund access from auth.getUser rather than request input', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    assertDomainAccess.mockResolvedValue({ userId: 'user-1', fundId: 'fund-1', access: 'read' })

    const result = await internalContext('read')

    expect(getUser).toHaveBeenCalledOnce()
    expect(assertDomainAccess).toHaveBeenCalledWith(
      { marker: 'service-role-client' }, 'user-1', 'diligence', 'read',
    )
    expect(result).toMatchObject({ gate: { userId: 'user-1', fundId: 'fund-1' } })
  })

  it('rejects a missing session before creating a service-role client', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const result = await internalContext('read')

    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(assertDomainAccess).not.toHaveBeenCalled()
  })
})
