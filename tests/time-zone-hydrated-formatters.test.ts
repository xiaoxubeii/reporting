import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(file, 'utf8')

describe('hydrated timestamp formatters', () => {
  it.each([
    'app/(app)/interactions/relationships-list.tsx',
    'app/(app)/settings/email-routing/email-audit-list.tsx',
    'app/(app)/settings/memo-agent/style-anchors/[id]/editor.tsx',
  ])('%s delegates timestamp presentation to the request timezone', (file) => {
    const source = read(file)

    expect(source).toContain('useFormatter')
    expect(source).toContain('format.dateTime(')
    expect(source).not.toContain('new Intl.DateTimeFormat(')
    expect(source).not.toContain('.toLocaleDateString(')
  })

  it('does not pin hydrated deal timestamps to UTC', () => {
    const source = read('app/(app)/deals/[id]/deal-detail.tsx')
    const start = source.indexOf('const formatDealDate')
    const formatter = source.slice(start, source.indexOf('\n\n  return (', start))

    expect(formatter).toContain('format.dateTime(')
    expect(formatter).not.toContain("timeZone: 'UTC'")
  })

  it('keeps calendar dates timezone-neutral instead of applying user-zone conversion', () => {
    const dashboard = read('app/(app)/dashboard/dashboard-companies.tsx')
    const usage = read('app/(app)/usage/usage-dashboard.tsx')

    expect(dashboard).toContain("`${c.firstInvestmentDate}T00:00:00Z`")
    expect(dashboard).toContain("timeZone: 'UTC'")
    expect(usage).toContain("new Date(`${row.date}T00:00:00Z`)")
    expect(usage).toContain("new Date(Date.UTC(parseInt(y), parseInt(m) - 1))")
  })
})
