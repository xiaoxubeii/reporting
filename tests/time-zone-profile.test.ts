import { describe, expect, it, vi } from 'vitest'

import * as profileRepository from '@/lib/identity/profile'

type SavePersonalTimeZone = (
  admin: never,
  input: { userId: string; timeZone: unknown },
) => Promise<{ timeZone: string | null }>

function getSavePersonalTimeZone(): SavePersonalTimeZone {
  const save = Reflect.get(profileRepository, 'savePersonalTimeZone')
  expect(save).toBeTypeOf('function')
  return save as SavePersonalTimeZone
}

function createProfileLoader(row: { full_name: string | null; time_zone?: string | null } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { admin: { from } as never, eq, from, select }
}

describe('personal timezone profile repository', () => {
  it('loads and maps a validated manual timezone with the existing full name', async () => {
    const { admin, eq, from, select } = createProfileLoader({
      full_name: 'Alice Zhang',
      time_zone: 'Asia/Shanghai',
    })

    await expect(profileRepository.loadPersonalProfile(admin, 'user-1')).resolves.toEqual({
      fullName: 'Alice Zhang',
      timeZone: 'Asia/Shanghai',
    })
    expect(from).toHaveBeenCalledWith('user_profiles')
    expect(select).toHaveBeenCalledWith('full_name, time_zone')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it.each([
    [null, null],
    [{ full_name: null, time_zone: null }, null],
    [{ full_name: null, time_zone: 'Not/A_Time_Zone' }, null],
  ])('maps absent, automatic, or stale profile timezone to Automatic', async (row, expected) => {
    const { admin } = createProfileLoader(row)

    await expect(profileRepository.loadPersonalProfile(admin, 'user-1')).resolves.toMatchObject({
      timeZone: expected,
    })
  })

  it('canonicalizes and saves a manual timezone through the service RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { time_zone: 'Asia/Shanghai' },
      error: null,
    })

    await expect(
      getSavePersonalTimeZone()({ rpc } as never, {
        userId: 'user-1',
        timeZone: 'Asia/Shanghai',
      }),
    ).resolves.toEqual({ timeZone: 'Asia/Shanghai' })
    expect(rpc).toHaveBeenCalledWith('update_user_time_zone', {
      p_user_id: 'user-1',
      p_time_zone: 'Asia/Shanghai',
    })
  })

  it('saves null through the service RPC to select Automatic mode', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { time_zone: null }, error: null })

    await expect(
      getSavePersonalTimeZone()({ rpc } as never, { userId: 'user-1', timeZone: null }),
    ).resolves.toEqual({ timeZone: null })
    expect(rpc).toHaveBeenCalledWith('update_user_time_zone', {
      p_user_id: 'user-1',
      p_time_zone: null,
    })
  })

  it.each([undefined, '', 'Not/A_Time_Zone', 'x'.repeat(129)])(
    'rejects invalid manual timezone %j before storage',
    async (timeZone) => {
      const rpc = vi.fn()

      await expect(
        getSavePersonalTimeZone()({ rpc } as never, { userId: 'user-1', timeZone }),
      ).rejects.toThrow('valid time zone')
      expect(rpc).not.toHaveBeenCalled()
    },
  )
})
