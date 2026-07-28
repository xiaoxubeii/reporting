import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TIME_ZONE,
  TIME_ZONE_COOKIE_NAME,
  canonicalizeTimeZone,
  parseTimeZoneCookie,
  resolveTimeZone,
  serializeTimeZoneCookie,
} from '@/i18n/time-zone'

describe('timezone contract', () => {
  it('exposes stable UTC fallback and cookie constants', () => {
    expect(DEFAULT_TIME_ZONE).toBe('UTC')
    expect(TIME_ZONE_COOKIE_NAME).toBe('REPORTING_TIME_ZONE')
  })

  it.each([
    ['UTC', 'UTC'],
    ['Asia/Shanghai', 'Asia/Shanghai'],
  ])('canonicalizes supported timezone %s', (input, expected) => {
    expect(canonicalizeTimeZone(input)).toBe(expected)
  })

  it.each([
    [undefined],
    [null],
    [42],
    [''],
    ['Not/A_Time_Zone'],
    ['x'.repeat(129)],
  ])('rejects unsupported or unbounded timezone value %j', (input) => {
    expect(canonicalizeTimeZone(input)).toBeNull()
  })

  it.each(['auto', 'manual'] as const)(
    'round trips an encoded %s cookie with immutable parsed state',
    (mode) => {
      const serialized = serializeTimeZoneCookie(mode, 'Asia/Shanghai')

      expect(serialized).toBe(encodeURIComponent(`${mode}:Asia/Shanghai`))
      const parsed = parseTimeZoneCookie(serialized)
      expect(parsed).toEqual({ mode, timeZone: 'Asia/Shanghai' })
      expect(Object.isFrozen(parsed)).toBe(true)
    },
  )

  it.each([
    undefined,
    '',
    'manual%3ANot%2FA_Time_Zone',
    'unsupported%3AUTC',
    '%E0%A4%A',
    encodeURIComponent(`auto:${'x'.repeat(129)}`),
  ])('falls back to UTC for missing or invalid cookie %j', (cookieValue) => {
    const resolved = resolveTimeZone(cookieValue)

    expect(resolved).toEqual({ timeZone: 'UTC', source: 'fallback' })
    expect(Object.isFrozen(resolved)).toBe(true)
  })

  it.each(['auto', 'manual'] as const)('reports the %s cookie as its source', (mode) => {
    expect(resolveTimeZone(serializeTimeZoneCookie(mode, 'Asia/Shanghai'))).toEqual({
      timeZone: 'Asia/Shanghai',
      source: mode,
    })
  })

  it('formats a boundary instant on the following calendar date in Asia/Shanghai', () => {
    const instant = new Date('2026-07-25T18:00:00Z')
    const { timeZone } = resolveTimeZone(serializeTimeZoneCookie('auto', 'Asia/Shanghai'))

    const dateParts = Object.fromEntries(
      new Intl.DateTimeFormat('en', {
        day: '2-digit',
        month: '2-digit',
        timeZone,
        year: 'numeric',
      })
        .formatToParts(instant)
        .map(({ type, value }) => [type, value]),
    )

    expect(dateParts).toMatchObject({ day: '26', month: '07', year: '2026' })
    expect(instant.toISOString()).toBe('2026-07-25T18:00:00.000Z')
  })
})
