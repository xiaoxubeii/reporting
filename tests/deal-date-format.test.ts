import { describe, expect, it } from 'vitest'

import { formatDealDate } from '@/lib/deals/format-date'

describe('deal date formatting', () => {
  it('uses one deterministic server/client representation', () => {
    expect(formatDealDate('2026-07-23T18:30:00.000Z')).toBe('7/23/2026')
  })

  it('uses the UTC calendar date instead of the runtime timezone', () => {
    expect(formatDealDate('2026-07-23T23:30:00-07:00')).toBe('7/24/2026')
  })

  it('returns null for missing or invalid values', () => {
    expect(formatDealDate(null)).toBeNull()
    expect(formatDealDate('not-a-date')).toBeNull()
  })
})
