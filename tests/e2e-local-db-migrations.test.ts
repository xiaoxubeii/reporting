import { describe, expect, it } from 'vitest'

import {
  assertLocalMigrationTarget,
  REQUIRED_E2E_MIGRATIONS,
  validateDatabaseContainer,
} from '../scripts/e2e/local-db-migrations.mjs'

describe('comprehensive E2E local migration boundary', () => {
  it('accepts only loopback Supabase targets', () => {
    expect(assertLocalMigrationTarget('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000')
    expect(assertLocalMigrationTarget('http://localhost:8000')).toBe('http://localhost:8000')
    expect(() => assertLocalMigrationTarget('https://db.example.com')).toThrow(/only target local Supabase/)
    expect(() => assertLocalMigrationTarget('not-a-url')).toThrow(/valid Supabase URL/)
  })

  it('uses an injection-safe container name and a fixed migration allowlist', () => {
    expect(validateDatabaseContainer('supabase-db')).toBe('supabase-db')
    expect(() => validateDatabaseContainer('supabase-db; echo unsafe')).toThrow(/container name is invalid/)
    expect(REQUIRED_E2E_MIGRATIONS).toEqual([
      '20260727010000_atomic_deal_promotion.sql',
      '20260727020000_diligence_decision_integrity.sql',
      '20260727030000_feed_discovery_ollama_scheduler.sql',
    ])
    expect(Object.isFrozen(REQUIRED_E2E_MIGRATIONS)).toBe(true)
  })
})
