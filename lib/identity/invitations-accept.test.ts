import { describe, expect, it, vi } from 'vitest'

const ensureMinifluxConnection = vi.hoisted(() => vi.fn().mockResolvedValue({
  externalUserId: 42,
  username: 'managed-user',
}))

vi.mock('@/lib/feeds/config', () => ({
  automaticMinifluxProvisioningEnabled: () => true,
}))
vi.mock('@/lib/feeds/provisioning', () => ({ ensureMinifluxConnection }))

import { acceptFundInvitation } from './invitations'

describe('accepted invitation provisioning', () => {
  it('provisions the same user after the idempotent membership RPC succeeds', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ invitation_id: 'invite-1', fund_id: 'fund-1', role: 'member' }],
      error: null,
    })
    const admin = { rpc }

    await expect(acceptFundInvitation(admin as never, {
      rawToken: 'a'.repeat(43),
      userId: 'user-1',
    })).resolves.toEqual({ fundId: 'fund-1', role: 'member' })

    expect(rpc).toHaveBeenCalledWith('accept_fund_member_invitation', {
      p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_user_id: 'user-1',
    })
    expect(ensureMinifluxConnection).toHaveBeenCalledWith(admin, 'user-1')
  })
})
