import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AGENT_TOOL_MANIFEST } from '@/lib/accounting/agent-tools-manifest'
import { DEALS_TOOL_MANIFEST } from '@/lib/agent/deals-tools-manifest'
import { DILIGENCE_TOOL_MANIFEST } from '@/lib/agent/diligence-tools-manifest'
import { LP_TOOL_MANIFEST } from '@/lib/agent/lp-tools-manifest'
import { PORTFOLIO_TOOL_MANIFEST } from '@/lib/agent/portfolio-tools-manifest'

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
}

function flattenedKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    flattenedKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function usedTranslationKeys(componentSource: string): string[] {
  return Array.from(
    new Set(Array.from(componentSource.matchAll(/\bt(?:\.rich)?\('([^']+)'/g), match => match[1])),
  ).sort()
}

describe('Settings shared component localization', () => {
  const english = JSON.parse(source('messages/en.json')).Settings
  const chinese = JSON.parse(source('messages/zh-CN.json')).Settings

  it.each([
    ['components/ledger-agent-access.tsx', 'ledgerAgent'],
    ['components/settings-access-grid.tsx', 'accessGrid'],
    ['components/vehicles-settings.tsx', 'vehicles'],
  ] as const)('fully routes %s through Settings.%s', (file, namespace) => {
    const componentSource = source(file)

    expect(componentSource).toContain(`useTranslations('Settings.${namespace}')`)
    expect(flattenedKeys(chinese[namespace]).sort()).toEqual(flattenedKeys(english[namespace]).sort())
    expect(usedTranslationKeys(componentSource)).toEqual(flattenedKeys(english[namespace]).sort())
  })

  it('covers every visible agent tool description without rendering the English manifest copy', () => {
    const componentSource = source('components/ledger-agent-access.tsx')
    const toolNames = [
      ...DEALS_TOOL_MANIFEST,
      ...DILIGENCE_TOOL_MANIFEST,
      ...PORTFOLIO_TOOL_MANIFEST,
      ...LP_TOOL_MANIFEST,
      ...AGENT_TOOL_MANIFEST,
    ].map(tool => tool.name).sort()

    expect(Object.keys(english.ledgerAgent.toolDescriptions).sort()).toEqual(toolNames)
    expect(Object.keys(chinese.ledgerAgent.toolDescriptions).sort()).toEqual(toolNames)
    expect(componentSource).not.toContain('tool.description')
  })

  it('removes the remaining hard-coded English UI copy from all three components', () => {
    const combined = [
      source('components/ledger-agent-access.tsx'),
      source('components/settings-access-grid.tsx'),
      source('components/vehicles-settings.tsx'),
    ].join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    for (const residue of [
      'Connect an AI agent',
      'Allow agents to reach this fund',
      'Copy this token now',
      'Key name (e.g. Claude agent)',
      'No active keys.',
      'Could not load access settings.',
      'Default for new members',
      'Following the default for new members',
      'Your fund&apos;s investment vehicles',
      'No vehicles yet. Add one below.',
      'New vehicle name (e.g. Fund IV, LP)',
      'The partner on the fund',
    ]) {
      expect(combined).not.toContain(residue)
    }
  })
})
