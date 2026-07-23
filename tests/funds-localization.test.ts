import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { FUND_LOCALIZED_FILES, FUND_TEXT_FREE_FILES, FUND_UI_FILES } from '../i18n/funds-surface-inventory'

describe('Funds localization coverage', () => {
  it('inventories every Funds React surface exactly once', () => {
    const discovered = execFileSync(
      'find',
      ['app/(app)/funds', '-type', 'f', '-name', '*.tsx', '-print'],
      { encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean).sort()

    expect([...FUND_UI_FILES].sort()).toEqual(discovered)
    expect(new Set(FUND_UI_FILES).size).toBe(FUND_UI_FILES.length)
    expect([...FUND_LOCALIZED_FILES, ...FUND_TEXT_FREE_FILES].sort()).toEqual([...FUND_UI_FILES].sort())
  })

  it('wires every authored Funds surface to next-intl', () => {
    for (const file of FUND_LOCALIZED_FILES) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).toMatch(/(?:useTranslations|getTranslations)\(/)
      expect(source, `${file} still uses the locale-blind legacy formatter`).not.toContain('formatCurrencyPrice(')
    }
  })

  it('has no untranslated authored JSX copy in Funds surfaces', () => {
    const allowedAbbreviations = new Set(['GP', 'LP'])
    const failures: string[] = []

    for (const file of FUND_LOCALIZED_FILES) {
      const source = readFileSync(file, 'utf8')
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

      const visit = (node: ts.Node) => {
        if (ts.isJsxText(node)) {
          const text = node.getText(ast).replace(/&[a-z]+;/gi, '').replace(/\s+/g, ' ').trim()
          if (/[A-Za-z]/.test(text) && !allowedAbbreviations.has(text)) {
            failures.push(`${file}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}: ${text}`)
          }
        }

        if (ts.isJsxAttribute(node) && ['title', 'placeholder', 'aria-label'].includes(node.name.getText(ast))) {
          const value = node.initializer
          if (value && ts.isStringLiteral(value) && /[A-Za-z]/.test(value.text)) {
            failures.push(`${file}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}: ${node.name.getText(ast)}=${value.text}`)
          }
        }

        ts.forEachChild(node, visit)
      }
      visit(ast)
    }

    expect(failures).toEqual([])
  })
})
