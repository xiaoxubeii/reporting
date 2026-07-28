import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/api/compliance/route.ts', 'utf8')

describe('compliance date-only UTC contract', () => {
  it('takes one current-time snapshot and derives the query year in UTC', () => {
    expect(source.match(/const now = new Date\(\)/g)).toHaveLength(1)
    expect(source.match(/now\.getUTCFullYear\(\)/g)).toHaveLength(1)
    expect(source).not.toMatch(/new Date\(\)\.getFullYear\(\)/)
  })

  it('classifies date-only commitment months in UTC', () => {
    expect(source).toContain('new Date(row.flow_date).getUTCMonth() + 1')
    expect(source).not.toContain('new Date(row.flow_date).getMonth()')
  })

  it('keeps a UTC January 1 flow date in January west of UTC', () => {
    const flowDate = new Date('2027-01-01')
    const losAngelesMonth = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'numeric',
    }).format(flowDate)

    expect(losAngelesMonth).toBe('12')
    expect(flowDate.getUTCMonth() + 1).toBe(1)
    expect(flowDate.getUTCFullYear()).toBe(2027)
  })
})
