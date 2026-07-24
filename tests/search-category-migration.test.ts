import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync(
  new URL('../supabase/migrations/20260724000000_search_category_config.sql', import.meta.url),
  'utf8',
)

describe('Search category migration', () => {
  it('adds bounded fund-scoped data-only category configuration without changing historical migrations', () => {
    expect(SQL).toContain('alter table public.fund_settings')
    expect(SQL).toContain('search_category_config jsonb')
    expect(SQL).toContain('jsonb_array_length')
    expect(SQL).toContain('"adapterIds"')
    expect(SQL).not.toMatch(/"(?:endpoint|selector|credential|apiKey|engineList)"\s*:/i)
  })

  it('seeds feed, web, direct APIs, and reviewed website adapters as configurable categories', () => {
    for (const adapterId of ['feeds', 'web', 'pubmed', 'clinical_trials', 'fda', 'tctmd', 'massdevice']) {
      expect(SQL).toContain(`"${adapterId}"`)
    }
  })
})
