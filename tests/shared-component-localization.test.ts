import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function flattenedKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    flattenedKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function usedTranslationKeys(source: string): string[] {
  return Array.from(
    new Set(Array.from(source.matchAll(/\bt(?:\.rich)?\('([^']+)'/g), match => match[1])),
  ).sort()
}

describe('shared component localization', () => {
  const english = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8'))
  const chinese = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/zh-CN.json'), 'utf8'))

  it('localizes portfolio notes with locale-aware dates and complete catalogs', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/portfolio-notes.tsx'), 'utf8')

    expect(flattenedKeys(chinese.PortfolioNotes).sort()).toEqual(
      flattenedKeys(english.PortfolioNotes).sort(),
    )
    expect(source).toContain("useTranslations('PortfolioNotes')")
    expect(source).toContain('format.dateTime(date')
    expect(usedTranslationKeys(source)).toEqual(flattenedKeys(english.PortfolioNotes).sort())
    expect(source).not.toContain("toLocaleDateString('en-US'")
    expect(source).not.toContain('>Team Notes<')
    expect(source).not.toContain('placeholder="Write a note...')
  })

  it('localizes the shared subscription inquiry dialog and fallback email', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/subscription-inquiry-modal.tsx'), 'utf8')

    expect(flattenedKeys(chinese.SubscriptionInquiry).sort()).toEqual(
      flattenedKeys(english.SubscriptionInquiry).sort(),
    )
    expect(source).toContain("useTranslations('SubscriptionInquiry')")
    expect(source).toContain("t.rich('description'")
    expect(usedTranslationKeys(source)).toEqual(flattenedKeys(english.SubscriptionInquiry).sort())
    expect(source).not.toContain('>Request Access<')
    expect(source).not.toContain('>Thanks for your interest!<')
    expect(source).not.toContain("placeholder=\"Anything else you'd like us to know\"")
  })
})
