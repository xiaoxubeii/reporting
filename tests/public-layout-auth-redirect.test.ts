import { describe, expect, it, vi } from 'vitest'
import { startLegacyPublicAuthCheck } from '@/lib/platform-landing/public-auth-redirect'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

describe('legacy public auth redirect', () => {
  it('does not run the legacy auth redirect for the public platform landing', () => {
    const getUser = vi.fn(async () => ({ data: { user: { id: 'user-1' } } }))
    const replace = vi.fn()
    const revealPublicShell = vi.fn()

    startLegacyPublicAuthCheck({
      surface: 'platform-landing',
      getUser,
      replace,
      revealPublicShell,
    })

    expect(getUser).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(revealPublicShell).not.toHaveBeenCalled()
  })

  it('keeps redirecting authenticated visitors from legacy public-shell pages', async () => {
    const lookup = deferred<{ data: { user: { id: string } | null } }>()
    const replace = vi.fn()

    startLegacyPublicAuthCheck({
      surface: 'public-shell',
      getUser: () => lookup.promise,
      replace,
      revealPublicShell: vi.fn(),
    })

    lookup.resolve({ data: { user: { id: 'user-1' } } })
    await lookup.promise
    await Promise.resolve()

    expect(replace).toHaveBeenCalledWith('/dashboard')
  })

  it('reveals legacy public-shell pages to anonymous visitors', async () => {
    const revealPublicShell = vi.fn()

    startLegacyPublicAuthCheck({
      surface: 'public-shell',
      getUser: async () => ({ data: { user: null } }),
      replace: vi.fn(),
      revealPublicShell,
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(revealPublicShell).toHaveBeenCalledOnce()
  })

  it('ignores an authenticated result after the originating surface is cleaned up', async () => {
    const lookup = deferred<{ data: { user: { id: string } | null } }>()
    const replace = vi.fn()
    const cleanup = startLegacyPublicAuthCheck({
      surface: 'public-shell',
      getUser: () => lookup.promise,
      replace,
      revealPublicShell: vi.fn(),
    })

    cleanup()
    lookup.resolve({ data: { user: { id: 'user-1' } } })
    await lookup.promise
    await Promise.resolve()

    expect(replace).not.toHaveBeenCalled()
  })
})
