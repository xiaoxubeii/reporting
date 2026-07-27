import { describe, expect, it } from 'vitest'
import { PATCH } from '@/app/api/settings/members/[id]/route'

describe('retired domain-based member approvals', () => {
  it.each(['approve', 'reject'])('fails closed for legacy %s mutations', async () => {
    const response = await PATCH()

    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toMatchObject({
      code: 'domain_join_retired',
    })
  })
})
