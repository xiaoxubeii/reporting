import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function leaves(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key))
}

describe('Letters localization', () => {
  const english = JSON.parse(readFileSync(resolve('messages/en.json'), 'utf8')).Letters
  const chinese = JSON.parse(readFileSync(resolve('messages/zh-CN.json'), 'utf8')).Letters
  const files = [
    'app/(app)/letters/page.tsx',
    'app/(app)/letters/new/page.tsx',
    'app/(app)/letters/[id]/page.tsx',
  ]
  const source = files.map(file => readFileSync(resolve(file), 'utf8')).join('\n')

  it('keeps English and Chinese catalogs in exact parity', () => {
    expect(leaves(chinese).sort()).toEqual(leaves(english).sort())
  })

  it('localizes every Letters page and locale-sensitive formatter', () => {
    expect(source).toContain("useTranslations('Letters.index')")
    expect(source).toContain("useTranslations('Letters.new')")
    expect(source).toContain("useTranslations('Letters.editor')")
    expect(source).toContain('useFormatter()')
    expect(source).toContain('format.dateTime(')
    expect(source).toContain('useTimeZone()')
    expect(source).toContain("calendarPartsInTimeZone(new Date(), timeZone ?? 'UTC')")
    expect(source).not.toContain('new Intl.DateTimeFormat(locale')
    expect(source).toContain('new Intl.NumberFormat(locale')
    expect(source).not.toContain('>Edit Company Summaries<')
    expect(source).not.toContain('>No letters yet.')
    expect(source).not.toContain('placeholder="Paste')
    expect(source).not.toContain("alert('Export failed')")
  })
})
