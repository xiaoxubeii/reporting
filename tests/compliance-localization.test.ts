import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOCALIZED_PAGE_FILES, namespaceForPage } from '../i18n/ui-surface-inventory'

const root = process.cwd()
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8')
const english = JSON.parse(read('messages/en.json'))
const chinese = JSON.parse(read('messages/zh-CN.json'))

function flattenedKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => flattenedKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort()
}

describe('Compliance localization', () => {
  it('keeps the complete Compliance namespace in catalog parity', () => {
    expect(english.Compliance).toBeTypeOf('object')
    expect(chinese.Compliance).toBeTypeOf('object')
    expect(flattenedKeys(chinese.Compliance)).toEqual(flattenedKeys(english.Compliance))
  })

  it('binds both Compliance routes and their shared navigation to next-intl', () => {
    const mainPage = read('app/(app)/compliance/page.tsx')
    const linksPage = read('app/(app)/compliance/links/page.tsx')
    const navigation = read('app/(app)/compliance/compliance-nav.tsx')

    expect(mainPage).toContain("useTranslations('Compliance')")
    expect(mainPage).toContain('useLocale()')
    expect(linksPage).toContain("useTranslations('Compliance.links')")
    expect(navigation).toContain("useTranslations('Compliance.nav')")
  })

  it('registers both visual routes under the Compliance namespace', () => {
    const pages = [
      'app/(app)/compliance/page.tsx',
      'app/(app)/compliance/links/page.tsx',
    ] as const

    for (const page of pages) {
      expect(LOCALIZED_PAGE_FILES).toContain(page)
      expect(namespaceForPage(page)).toBe('Compliance')
    }
  })

  it('localizes metadata for the main and filing-links routes', () => {
    expect(read('app/(app)/compliance/layout.tsx')).toContain("getTranslations('Compliance')")
    expect(read('app/(app)/compliance/links/layout.tsx')).toContain("getTranslations('Compliance.links')")
  })
})
