import { describe, expect, it } from 'vitest'
import { config } from '../middleware'

describe('Supabase browser proxy middleware boundary', () => {
  it('excludes proxy requests from application authentication middleware', () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`)

    expect(matcher.test('/_supabase/auth/v1/token')).toBe(false)
    expect(matcher.test('/_supabase/rest/v1/funds')).toBe(false)
    expect(matcher.test('/feeds')).toBe(true)
  })
})
