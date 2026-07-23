import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260723011000_harden_rate_limit_atomicity.sql',
), 'utf8')

describe('Search rate-limit migration', () => {
  it('serializes each bucket and validates all caller-controlled parameters', () => {
    expect(migration).toMatch(/pg_advisory_xact_lock/i)
    expect(migration).toMatch(/hashtextextended\(p_key/i)
    expect(migration).toMatch(/octet_length\(p_key\)/i)
    expect(migration).toMatch(/p_limit is null or p_limit < 1/i)
    expect(migration).toMatch(/p_window_seconds is null or p_window_seconds < 1/i)
  })

  it('restricts the security-definer function to the service role', () => {
    expect(migration).toMatch(/set search_path = ''/i)
    expect(migration).toMatch(/revoke all on function[\s\S]*from public, anon, authenticated/i)
    expect(migration).toMatch(/grant execute on function[\s\S]*to service_role/i)
  })
})
