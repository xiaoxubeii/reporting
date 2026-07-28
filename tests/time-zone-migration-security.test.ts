import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL(
  '../supabase/migrations/20260729010000_user_time_zone_preferences.sql',
  import.meta.url,
)
const SQL = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : ''
const IDENTITY_SQL = readFileSync(
  new URL('../supabase/migrations/20260729000000_fund_identity_onboarding.sql', import.meta.url),
  'utf8',
)
const DATABASE_TYPES = readFileSync(new URL('../lib/types/database.ts', import.meta.url), 'utf8')

describe('user timezone preference migration security contract', () => {
  it('adds nullable bounded profile storage without rewriting timestamp data', () => {
    expect(SQL).toMatch(/alter table public\.user_profiles[\s\S]*add column time_zone text/i)
    expect(SQL).not.toMatch(/time_zone text not null/i)
    expect(SQL).not.toMatch(/time_zone text[^;]*default/i)
    expect(SQL).toMatch(/char_length\(time_zone\) between 1 and 128/i)
    expect(SQL).toMatch(/time_zone !~ E?'\[[^']*\\r[^']*\\n[^']*\]'/i)
    expect(SQL).not.toMatch(/alter column (?:created_at|updated_at)/i)
    expect(SQL).not.toMatch(/update public\.user_profiles[\s\S]*set[\s\S]*(?:created_at|updated_at)/i)
  })

  it('preserves owner-select RLS while keeping all profile writes service-owned', () => {
    expect(IDENTITY_SQL).toMatch(
      /create policy user_profiles_owner_select[\s\S]*auth\.uid\(\) = user_id/i,
    )
    expect(SQL).not.toMatch(/(?:drop|alter) policy user_profiles_owner_select/i)
    expect(SQL).not.toMatch(/create policy user_profiles_owner_(?:insert|update|delete)/i)
    expect(SQL).toMatch(
      /revoke insert, update, delete on table public\.user_profiles from authenticated/i,
    )
  })

  it('exposes only a bounded service-role timezone mutation RPC', () => {
    expect(SQL).toMatch(
      /create or replace function public\.update_user_time_zone\(\s*p_user_id uuid,\s*p_time_zone text\s*\)/i,
    )
    expect(SQL).toMatch(
      /update_user_time_zone[\s\S]*security definer[\s\S]*set search_path = public/i,
    )
    expect(SQL).toMatch(/p_time_zone is not null[\s\S]*char_length\(p_time_zone\) not between 1 and 128/i)
    expect(SQL).toMatch(/insert into public\.user_profiles \(user_id, time_zone\)/i)
    expect(SQL).toMatch(/on conflict \(user_id\) do update[\s\S]*time_zone = excluded\.time_zone/i)
    expect(SQL).not.toMatch(/on conflict \(user_id\) do update[\s\S]*full_name\s*=/i)
    expect(SQL).toMatch(
      /revoke all on function public\.update_user_time_zone\(uuid, text\)[\s\S]*from public, anon, authenticated/i,
    )
    expect(SQL).toMatch(
      /grant execute on function public\.update_user_time_zone\(uuid, text\)[\s\S]*to service_role/i,
    )
  })

  it('updates generated table and RPC types with nullable timezone values', () => {
    expect(DATABASE_TYPES).toMatch(/user_profiles:[\s\S]*Row: \{[\s\S]*time_zone: string \| null;/i)
    expect(DATABASE_TYPES).toMatch(/user_profiles:[\s\S]*Insert: \{[\s\S]*time_zone\?: string \| null;/i)
    expect(DATABASE_TYPES).toMatch(/user_profiles:[\s\S]*Update: \{[\s\S]*time_zone\?: string \| null;/i)
    expect(DATABASE_TYPES).toMatch(
      /update_user_time_zone: \{\s*Args: \{ p_time_zone: string \| null; p_user_id: string \};/i,
    )
  })
})
