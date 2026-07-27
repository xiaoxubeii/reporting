import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendPlatformEmail = vi.hoisted(() => vi.fn())

vi.mock('@/lib/email/system', () => ({ sendPlatformEmail }))
vi.mock('@/lib/tenancy/links', () => ({
  canonicalFundOriginForId: vi.fn().mockResolvedValue('https://cci.fundworkspace.com'),
}))

import { createFundInvitation } from './invitations'

const invitationRow = {
  id: 'invite-1',
  fund_id: 'fund-1',
  email_normalized: 'alice@example.com',
  role: 'member',
  token_hash: 'a'.repeat(64),
  invited_by: 'user-1',
  expires_at: '2030-01-01T00:00:00.000Z',
  delivery_confirmed_at: null,
  accepted_at: null,
  accepted_by: null,
  revoked_at: null,
  replaced_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

describe('invitation delivery activation', () => {
  beforeEach(() => sendPlatformEmail.mockReset())

  it('activates the capability only after the provider accepts the email', async () => {
    sendPlatformEmail.mockResolvedValue(undefined)
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: invitationRow, error: null })
      .mockResolvedValueOnce({ data: { ...invitationRow, delivery_confirmed_at: '2026-01-01T00:00:01.000Z' }, error: null })

    await expect(createFundInvitation({ rpc } as never, {
      fundId: 'fund-1',
      actorUserId: 'user-1',
      email: 'alice@example.com',
      role: 'member',
    })).resolves.toMatchObject({ id: 'invite-1', status: 'pending' })

    expect(rpc.mock.calls.map(call => call[0])).toEqual([
      'create_fund_member_invitation',
      'confirm_fund_member_invitation_delivery',
    ])
  })

  it('leaves the capability inert when activation and cleanup both fail', async () => {
    sendPlatformEmail.mockResolvedValue(undefined)
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: invitationRow, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '08006' } })
      .mockResolvedValueOnce({ data: false, error: { code: '08006' } })

    let failure: unknown
    try {
      await createFundInvitation({ rpc } as never, {
        fundId: 'fund-1',
        actorUserId: 'user-1',
        email: 'alice@example.com',
        role: 'member',
      })
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe('Identity service is temporarily unavailable.')

    expect(rpc.mock.calls.map(call => call[0])).toEqual([
      'create_fund_member_invitation',
      'confirm_fund_member_invitation_delivery',
      'revoke_fund_member_invitation',
    ])
  })
})
