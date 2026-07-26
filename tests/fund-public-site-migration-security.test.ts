import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync('supabase/migrations/20260728000000_fund_public_sites.sql', 'utf8')

describe('Fund public site migration security contract', () => {
  it('isolates lifecycle state in a forced-RLS one-row-per-Fund table', () => {
    expect(SQL).toMatch(/create table public\.fund_public_sites/i)
    expect(SQL).toMatch(/fund_id uuid primary key references public\.funds\(id\) on delete cascade/i)
    expect(SQL).toMatch(/enable row level security/i)
    expect(SQL).toMatch(/force row level security/i)
    expect(SQL).toMatch(/revoke all on table public\.fund_public_sites from public, anon, authenticated/i)
    expect(SQL).toMatch(/grant select on table public\.fund_public_sites to service_role/i)
    expect(SQL).toMatch(/grant insert \(fund_id, draft_template_key, draft_content, updated_by\)[\s\S]*to service_role/i)
    expect(SQL).toMatch(/grant update \(draft_template_key, draft_content, draft_revision, updated_at, updated_by\)[\s\S]*to service_role/i)
    expect(SQL).not.toMatch(/grant[^;]*delete[^;]*fund_public_sites/i)
    expect(SQL).not.toMatch(/grant update \([^)]*published_/i)
  })

  it('allows anonymous callers to resolve only the published snapshot', () => {
    const resolver = SQL.slice(
      SQL.indexOf('create or replace function public.resolve_published_fund_site'),
      SQL.indexOf('create or replace function public.publish_fund_public_site'),
    )
    expect(SQL).toMatch(/create or replace function public\.resolve_published_fund_site\(p_slug text\)/i)
    expect(SQL).toMatch(/where funds\.slug = p_slug[\s\S]*sites\.is_published = true/i)
    expect(resolver).not.toMatch(/draft_/i)
    expect(SQL).toMatch(/grant execute on function public\.resolve_published_fund_site\(text\) to anon, authenticated, service_role/i)
  })

  it('keeps atomic lifecycle mutation service-only', () => {
    expect(SQL).toMatch(/for update/i)
    expect(SQL).toMatch(/published_template_key = site\.draft_template_key[\s\S]*published_content = site\.draft_content/i)
    expect(SQL).toMatch(/site\.lifecycle_revision <> p_expected_lifecycle_revision/i)
    expect(SQL).toMatch(/revoke all on function public\.publish_fund_public_site\(uuid, bigint, bigint, uuid\) from public, anon, authenticated/i)
    expect(SQL).toMatch(/grant execute on function public\.publish_fund_public_site\(uuid, bigint, bigint, uuid\) to service_role/i)
  })
})
