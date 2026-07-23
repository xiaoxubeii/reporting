import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCALIZED_PAGE_FILES } from '../i18n/ui-surface-inventory'

function flattenedKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    flattenedKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('Support localization', () => {
  it('keeps the complete Support namespace in English and Chinese parity', () => {
    const english = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8'))
    const chinese = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/zh-CN.json'), 'utf8'))

    expect(flattenedKeys(chinese.Support).sort()).toEqual(flattenedKeys(english.Support).sort())
    expect(Object.keys(english.Support.sections)).toHaveLength(26)
  })

  it('binds every rendered support section to the Support catalog', () => {
    const english = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8'))
    const source = readFileSync(resolve(process.cwd(), 'app/(app)/support/page.tsx'), 'utf8')
    const configuredSections = Array.from(source.matchAll(/key: '([A-Za-z]+)'/g), match => match[1]).sort()

    expect(configuredSections).toEqual(Object.keys(english.Support.sections).sort())
    expect(source).toContain("getTranslations('Support')")
    expect(source).toContain("getTranslations('Support.metadata')")
    expect(source).toContain("t.rich(`sections.${section.key}.body`")
    expect(source).not.toContain('>Support<')
    expect(source).not.toContain('>Need help?<')
    expect(source).not.toContain('>Getting Started<')
  })

  it('registers Support as a localized visual page', () => {
    expect(LOCALIZED_PAGE_FILES).toContain('app/(app)/support/page.tsx')
  })
})
