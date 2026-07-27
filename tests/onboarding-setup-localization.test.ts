import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { LOCALIZED_PAGE_FILES, namespaceForPage } from '../i18n/ui-surface-inventory'

function flattenedKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [prefix]
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flattenedKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function translationKeys(source: string): string[] {
  return Array.from(
    new Set(
      Array.from(
        source.matchAll(/(?:\bt(?:\.rich)?\(|\bkey:\s*)'([^']+)'/g),
        match => match[1],
      ),
    ),
  ).sort()
}

describe('onboarding and setup localization', () => {
  const english = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8'))
  const chinese = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/zh-CN.json'), 'utf8'))

  it('keeps complete onboarding, invitation, and scoped setup namespaces in catalog parity', () => {
    expect(flattenedKeys(chinese.Onboarding).sort()).toEqual(flattenedKeys(english.Onboarding).sort())
    expect(flattenedKeys(chinese.Setup).sort()).toEqual(flattenedKeys(english.Setup).sort())
    expect(flattenedKeys(chinese.FundInvitation).sort()).toEqual(flattenedKeys(english.FundInvitation).sort())
    expect(flattenedKeys(chinese.FundSetup).sort()).toEqual(flattenedKeys(english.FundSetup).sort())
    expect(flattenedKeys(chinese.SettingsIdentity).sort()).toEqual(flattenedKeys(english.SettingsIdentity).sort())
  })

  it('routes every onboarding message and metadata value through Onboarding', () => {
    const page = readFileSync(resolve(process.cwd(), 'app/onboarding/onboarding-client.tsx'), 'utf8')
    const layout = readFileSync(resolve(process.cwd(), 'app/onboarding/layout.tsx'), 'utf8')
    const source = `${page}\n${layout}`

    expect(page).toContain("useTranslations('Onboarding.identity')")
    expect(layout).toContain("getTranslations('Onboarding')")
    const available = new Set(flattenedKeys(english.Onboarding.identity))
    expect(translationKeys(page).every(key => available.has(key))).toBe(true)

    for (const productCopy of [
      '>Set up your fund<',
      '>Request to join<',
      '>Inbound email integration<',
      '>Authorized senders<',
      '>Connect Google Drive<',
      "setError('Both fields are required.')",
      "setError('Network error')",
    ]) {
      expect(source).not.toContain(productCopy)
    }
  })

  it('routes every setup message and metadata value through Setup', () => {
    const page = readFileSync(resolve(process.cwd(), 'app/setup/page.tsx'), 'utf8')
    const layout = readFileSync(resolve(process.cwd(), 'app/setup/layout.tsx'), 'utf8')
    const source = `${page}\n${layout}`

    expect(page).toContain("useTranslations('Setup')")
    expect(layout).toContain("getTranslations('Setup')")
    expect(translationKeys(source)).toEqual(flattenedKeys(english.Setup).sort())

    for (const productCopy of [
      '>Setup Checklist<',
      '>Refresh<',
      'All required checks passed!',
      'Database connection',
      "new Error('Failed to fetch setup status')",
    ]) {
      expect(source).not.toContain(productCopy)
    }
  })

  it('classifies onboarding and setup as localized visual pages', () => {
    expect(LOCALIZED_PAGE_FILES).toContain('app/onboarding/page.tsx')
    expect(LOCALIZED_PAGE_FILES).toContain('app/setup/page.tsx')
    expect(namespaceForPage('app/onboarding/page.tsx')).toBe('Onboarding')
    expect(namespaceForPage('app/setup/page.tsx')).toBe('Setup')
    expect(LOCALIZED_PAGE_FILES).toContain('app/invite/page.tsx')
    expect(LOCALIZED_PAGE_FILES).toContain('app/(app)/funds/setup/page.tsx')
    expect(LOCALIZED_PAGE_FILES).toContain('app/(app)/settings/personal/page.tsx')
    expect(namespaceForPage('app/invite/page.tsx')).toBe('FundInvitation')
    expect(namespaceForPage('app/(app)/funds/setup/page.tsx')).toBe('FundSetup')
    expect(namespaceForPage('app/(app)/settings/personal/page.tsx')).toBe('SettingsIdentity')
  })
})
