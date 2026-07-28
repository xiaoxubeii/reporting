import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(file, 'utf8')
const clientFiles = execFileSync('rg', [
  '-l', '--glob', '*.ts', '--glob', '*.tsx',
  "^('use client'|\"use client\")", 'app', 'components',
], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).sort()

const browserZoneDetection = Object.freeze({
  'components/settings/time-zone-preference.tsx':
    'detects the local IANA zone only after hydration',
  'components/time-zone-bootstrap.tsx':
    'detects the local IANA zone only inside the synchronization effect',
})

const numericLocaleString = Object.freeze({
  'app/(app)/dashboard/dashboard-companies.tsx': 2,
  'app/(app)/dashboard/dashboard-table.tsx': 1,
  'components/analyst-pending-actions.tsx': 1,
  'components/currency-context.tsx': 3,
})

const businessCalendarUtc = Object.freeze([
  'app/(app)/compliance/page.tsx',
  'app/(app)/dashboard/dashboard-companies.tsx',
  'app/(app)/settings/memo-agent/defaults/editor.tsx',
  'app/(app)/usage/usage-dashboard.tsx',
  'app/(app)/lps/preview/page.tsx',
  'components/lp-documents-settings.tsx',
])

const requiredInstantFields = Object.freeze({
  'app/(app)/pending-actions/page.tsx': 'row.created_at',
  'app/(app)/letters/[id]/page.tsx': 'n.updated_at',
  'app/(app)/lp-activity/lp-activity-dashboard.tsx': 'new Date(iso)',
  'app/(app)/settings/memo-agent/schemas/[name]/schema-editor.tsx': 'entry.edited_at',
  'app/(app)/settings/memo-agent/style-anchors/[id]/editor.tsx': 'a.extracted_at',
  'components/lp-messages-section.tsx': 'm.created_at',
  'components/settings/fund-email-settings.tsx': 'status.lastVerifiedAt',
})

describe('hydrated timestamp formatter inventory', () => {
  it('scans every client module and permits native DateTimeFormat only for browser-zone detection', () => {
    expect(clientFiles.length).toBeGreaterThan(200)

    for (const file of clientFiles) {
      const source = read(file)
      const nativeDateFormat = source.match(/Intl\.DateTimeFormat/g) ?? []
      const nativePresentation = [
        ...(source.match(/\.toLocaleDateString\s*\(/g) ?? []),
        ...(source.match(/\.toLocaleTimeString\s*\(/g) ?? []),
      ]
      const localeStringCalls = source.match(/\.toLocaleString\s*\(/g) ?? []

      if (file in browserZoneDetection) {
        expect(nativeDateFormat, file).toHaveLength(1)
        expect(source, file).toContain('Intl.DateTimeFormat().resolvedOptions().timeZone')
      } else {
        expect(nativeDateFormat, file).toHaveLength(0)
      }
      expect(nativePresentation, file).toHaveLength(0)
      expect(localeStringCalls, `${file}: every toLocaleString call must be explicitly classified as numeric`)
        .toHaveLength(numericLocaleString[file as keyof typeof numericLocaleString] ?? 0)
    }
  })

  it.each(Object.entries(requiredInstantFields))('%s formats %s through the request timezone', (file, field) => {
    const source = read(file)
    expect(source).toContain('useFormatter')
    expect(source).toContain(field)
    expect(source).toContain('format.dateTime(')
  })

  it.each(businessCalendarUtc)('%s classifies calendar-only values with explicit UTC semantics', (file) => {
    const source = read(file)
    expect(source).toContain('format.dateTime(')
    expect(source).toMatch(/timeZone:\s*'UTC'/)
  })

  it('does not pin hydrated deal instants to UTC', () => {
    const source = read('app/(app)/deals/[id]/deal-detail.tsx')
    const start = source.indexOf('const formatDealDate')
    const formatter = source.slice(start, source.indexOf('\n\n  return (', start))

    expect(formatter).toContain('format.dateTime(')
    expect(formatter).not.toContain("timeZone: 'UTC'")
  })

  it('formats every LP Activity absolute instant at its exact use site', () => {
    const source = read('app/(app)/lp-activity/lp-activity-dashboard.tsx')

    expect(source).not.toContain('formatDateTime(')
    expect(source).toContain('title={format.dateTime(new Date(p.lastSeen)')
    expect(source).toContain('title={format.dateTime(new Date(e.createdAt)')
  })
})
