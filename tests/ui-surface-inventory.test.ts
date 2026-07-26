import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  LOCALIZED_PAGE_FILES,
  NON_VISUAL_PAGE_FILES,
  SPECIAL_UI_FILES,
  UI_PAGE_FILES,
  namespaceForPage,
} from '../i18n/ui-surface-inventory'

describe('UI localization surface inventory', () => {
  it('registers every App Router page exactly once', () => {
    const discoveredPages = execFileSync('find', ['app', '-type', 'f', '-name', 'page.tsx', '-print'], {
      encoding: 'utf8',
    }).trim().split('\n').filter(Boolean).sort()

    expect([...UI_PAGE_FILES].sort()).toEqual(discoveredPages)
    expect(new Set(UI_PAGE_FILES).size).toBe(UI_PAGE_FILES.length)
    expect(UI_PAGE_FILES).toHaveLength(103)
  })

  it('classifies every visual page with a semantic namespace', () => {
    const nonVisual = new Set<string>(NON_VISUAL_PAGE_FILES)
    const localized = new Set<string>(LOCALIZED_PAGE_FILES)

    for (const file of UI_PAGE_FILES) {
      if (nonVisual.has(file)) {
        expect(namespaceForPage(file), file).toBeNull()
      } else {
        expect(namespaceForPage(file), file).toMatch(/^[A-Z][A-Za-z]+$/)
      }
    }

    expect(Array.from(localized).every(file => UI_PAGE_FILES.includes(file as never))).toBe(true)
    expect(Array.from(nonVisual).every(file => UI_PAGE_FILES.includes(file as never))).toBe(true)
    expect(Array.from(localized).some(file => nonVisual.has(file))).toBe(false)
    expect(Array.from(localized).sort()).toEqual(
      UI_PAGE_FILES.filter(file => !nonVisual.has(file)).sort(),
    )
  })

  it('keeps non-page user interfaces in the localization scope', () => {
    expect(SPECIAL_UI_FILES).toEqual([
      'app/not-found.tsx',
      'app/expert-response/route.ts',
    ])
  })
})
