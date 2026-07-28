import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCALIZED_PAGE_FILES } from '../i18n/ui-surface-inventory'

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
}

function flattenedKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    flattenedKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

const settingsPages = [
  'app/(app)/settings/page.tsx',
  'app/(app)/settings/email-routing/page.tsx',
  'app/(app)/settings/memo-agent/defaults/page.tsx',
  'app/(app)/settings/memo-agent/schemas/page.tsx',
  'app/(app)/settings/memo-agent/schemas/[name]/page.tsx',
  'app/(app)/settings/memo-agent/style-anchors/page.tsx',
  'app/(app)/settings/memo-agent/style-anchors/[id]/page.tsx',
] as const

describe('settings localization', () => {
  const english = JSON.parse(source('messages/en.json'))
  const chinese = JSON.parse(source('messages/zh-CN.json'))

  it('keeps the complete Settings catalog structurally aligned', () => {
    expect(flattenedKeys(chinese.Settings).sort()).toEqual(flattenedKeys(english.Settings).sort())
  })

  it('keeps personal settings, including timezone preferences, structurally aligned', () => {
    expect(flattenedKeys(chinese.SettingsIdentity.personal).sort())
      .toEqual(flattenedKeys(english.SettingsIdentity.personal).sort())
  })

  it('marks every visual Settings page localized', () => {
    for (const page of settingsPages) expect(LOCALIZED_PAGE_FILES).toContain(page)
  })

  it('routes the main Settings surface through translations', () => {
    const page = source('app/(app)/settings/page.tsx')
    expect(page).toContain("useTranslations('Settings')")
    expect(page).toContain("useTranslations('Settings.page.aiProviders')")
    expect(page).toContain("useTranslations('Settings.page.inbound')")
    expect(page).toContain("useTranslations('Settings.page.storage')")
    expect(page).toContain("useTranslations('Settings.page.outbound')")
    expect(page).toContain("useTranslations('Settings.page.team')")
    expect(page).not.toContain('<Section title="AI Providers">')
    expect(page).not.toContain('<Section title="Inbound email">')
    expect(page).not.toContain('<Section title="Outbound email">')
    expect(page).not.toContain('<Section title="Storage">')
    expect(page).not.toContain('<Section title="Team">')
    expect(page).not.toContain('toLocaleDateString()')
  })
})
