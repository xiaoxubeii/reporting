import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseCookieOptions, resolveSupabaseCookieOptions } from './cookie-options'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveSupabaseCookieOptions', () => {
  it('returns a stable configured cookie name', () => {
    expect(resolveSupabaseCookieOptions('reporting-local-auth-token')).toEqual({
      name: 'reporting-local-auth-token',
    })
  })

  it('preserves the Supabase default when no override is configured', () => {
    expect(resolveSupabaseCookieOptions(undefined)).toBeUndefined()
  })

  it('fails fast when the browser proxy requires a stable cookie name', () => {
    expect(() => resolveSupabaseCookieOptions(undefined, true)).toThrow(
      'Supabase cookie name is required',
    )
  })

  it.each([
    'contains a space',
    'contains:semicolon',
    'contains.dot',
    'a'.repeat(65),
  ])('rejects an unsafe cookie name: %s', cookieName => {
    expect(() => resolveSupabaseCookieOptions(cookieName)).toThrow('Invalid Supabase cookie name')
  })

  it('marks the shared session cookie Secure in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_COOKIE_NAME', 'reporting-auth-token')

    expect(getSupabaseCookieOptions()).toEqual({
      name: 'reporting-auth-token',
      path: '/',
      sameSite: 'lax',
      secure: true,
    })
  })

  it('allows the shared session cookie over local development HTTP', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_COOKIE_NAME', 'reporting-local-auth-token')

    expect(getSupabaseCookieOptions()).toEqual({
      name: 'reporting-local-auth-token',
      path: '/',
      sameSite: 'lax',
      secure: false,
    })
  })
})
