import { describe, expect, it, vi } from 'vitest'

import { kickBackgroundJobDispatcher } from './kick'

const CRON_SECRET = 'cron-secret-value-that-is-long-enough-0123456789'

describe('kickBackgroundJobDispatcher', () => {
  it('uses only the validated internal origin, refuses redirects, and carries the cron secret', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))

    await kickBackgroundJobDispatcher({
      CRON_SECRET,
      BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://reporting.example',
      NEXT_PUBLIC_SITE_URL: 'https://attacker.example',
      VERCEL_URL: 'attacker.example',
    }, fetchImpl)

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://reporting.example/api/cron/background-jobs',
      expect.objectContaining({
        headers: { authorization: `Bearer ${CRON_SECRET}` },
        redirect: 'error',
      }),
    )
  })

  it('is a no-op when the cron secret or a valid internal origin is unavailable', async () => {
    const fetchImpl = vi.fn()

    await kickBackgroundJobDispatcher({ BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://reporting.example' }, fetchImpl)
    await kickBackgroundJobDispatcher({ CRON_SECRET }, fetchImpl)
    await kickBackgroundJobDispatcher({
      CRON_SECRET,
      BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://attacker.example/path',
    }, fetchImpl)

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('swallows redirect and transport failures because the scheduler is the recovery path', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('redirect blocked') })

    await expect(kickBackgroundJobDispatcher({
      CRON_SECRET,
      BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://reporting.example',
    }, fetchImpl)).resolves.toBeUndefined()
  })
})
