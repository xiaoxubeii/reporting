import { canonicalizeTimeZone } from '@/i18n/time-zone'

export type CalendarParts = Readonly<{ year: number; month: number; day: number }>

export function calendarPartsInTimeZone(instant: Date, timeZone: string): CalendarParts {
  if (Number.isNaN(instant.getTime())) throw new TypeError('Invalid instant')
  const canonical = canonicalizeTimeZone(timeZone)
  if (!canonical) throw new TypeError('Invalid time zone')
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: canonical, year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(instant).map(part => [part.type, part.value]))
  return Object.freeze({ year: Number(values.year), month: Number(values.month), day: Number(values.day) })
}
