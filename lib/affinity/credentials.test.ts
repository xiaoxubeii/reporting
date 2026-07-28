/* eslint-disable @typescript-eslint/no-explicit-any -- minimal fluent Supabase boundary mock */
import { describe, expect, it } from 'vitest'
import { getAffinityKey } from './credentials'

describe('getAffinityKey fund boundary', () => {
  it('requires the credential to belong to the current Fund before decrypting it', async () => {
    const filters: Array<[string, unknown]> = []
    const query: any = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push([column, value])
        return query
      },
      maybeSingle: async () => ({ data: null, error: null }),
    }
    const admin = { from: () => query } as any

    await expect(getAffinityKey(admin, 'user-1', 'fund-current')).resolves.toBeNull()
    expect(filters).toEqual([
      ['user_id', 'user-1'],
      ['fund_id', 'fund-current'],
    ])
  })
})
