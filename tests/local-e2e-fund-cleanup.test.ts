import { describe, expect, it } from 'vitest'
import {
  buildLocalFundCleanupSql,
  validateLocalDatabaseContainer,
} from '@/scripts/e2e/local-fund-cleanup'

describe('local E2E Fund cleanup guard', () => {
  it('builds a transaction that disables only the immutable identity trigger', () => {
    const sql = buildLocalFundCleanupSql(
      'a1000000-0000-4000-8000-000000000001',
      'Investment E2E 1753600000000-abcdef12',
      'e2e-1753600000000-abcdef12',
    )

    expect(sql).toContain('begin;')
    expect(sql).toContain('disable trigger fund_identity_delete_forbidden')
    expect(sql).toContain("where id = 'a1000000-0000-4000-8000-000000000001'::uuid")
    expect(sql).toContain("name = 'Investment E2E 1753600000000-abcdef12'")
    expect(sql).toContain("slug = 'e2e-1753600000000-abcdef12'")
    expect(sql).toContain('E2E Fund identity mismatch')
    expect(sql).toContain('enable trigger fund_identity_delete_forbidden')
    expect(sql).toContain('commit;')
  })

  it.each([
    ['not-a-uuid', 'supabase-db'],
    ['a1000000-0000-4000-8000-000000000001;drop table funds', 'supabase-db'],
  ])('rejects an unsafe Fund id %s', (fundId) => {
    expect(() => buildLocalFundCleanupSql(
      fundId,
      'Investment E2E 1753600000000-abcdef12',
      'e2e-1753600000000-abcdef12',
    )).toThrow('valid UUID')
  })

  it('rejects non-E2E Fund identity values', () => {
    expect(() => buildLocalFundCleanupSql(
      'a1000000-0000-4000-8000-000000000001',
      'Production Fund',
      'production',
    )).toThrow('Fund name')
  })

  it('rejects shell metacharacters in the explicit container name', () => {
    expect(() => validateLocalDatabaseContainer('supabase-db;whoami')).toThrow('container name')
  })
})
