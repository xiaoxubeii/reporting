import { describe, expect, it } from 'vitest'
import { calendarPartsInTimeZone } from '@/lib/date/calendar-parts'

describe('explicit timezone calendar parts', () => {
  it('derives different month and year at the same UTC instant near a boundary', () => {
    const instant = new Date('2026-12-31T16:30:00.000Z')

    expect(calendarPartsInTimeZone(instant, 'UTC')).toEqual({ year: 2026, month: 12, day: 31 })
    expect(calendarPartsInTimeZone(instant, 'Asia/Shanghai')).toEqual({ year: 2027, month: 1, day: 1 })
  })

  it('rejects invalid instants and unsupported timezones', () => {
    expect(() => calendarPartsInTimeZone(new Date('invalid'), 'UTC')).toThrow(/instant/i)
    expect(() => calendarPartsInTimeZone(new Date(), 'Not/A_Zone')).toThrow(/time zone/i)
  })
})
