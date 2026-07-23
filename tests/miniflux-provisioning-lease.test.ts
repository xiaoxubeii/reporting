import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  claimMinifluxProvisioningLease,
  releaseMinifluxProvisioningLease,
} from '@/lib/feeds/provisioning-lease'

const rpc = vi.fn()
const admin = { rpc } as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Miniflux provisioning lease', () => {
  it('claims enough time for the complete serial provisioning sequence', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null })

    await expect(claimMinifluxProvisioningLease(admin, {
      userId: 'user-1', ownerId: 'owner-1',
    })).resolves.toBe(true)

    expect(rpc).toHaveBeenCalledWith('try_claim_miniflux_provisioning_lease', {
      p_user_id: 'user-1',
      p_owner_id: 'owner-1',
      p_ttl_seconds: 120,
    })
  })

  it('releases only the matching owner lease', async () => {
    rpc.mockResolvedValueOnce({ error: null })

    await expect(releaseMinifluxProvisioningLease(admin, {
      userId: 'user-1', ownerId: 'owner-1',
    })).resolves.toBeUndefined()

    expect(rpc).toHaveBeenCalledWith('release_miniflux_provisioning_lease', {
      p_user_id: 'user-1',
      p_owner_id: 'owner-1',
    })
  })
})
