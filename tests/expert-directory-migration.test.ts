import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260725020000_expert_directory_discovery.sql'),
  'utf8',
)

describe('expert directory discovery migration', () => {
  it('backfills and constrains the two formal expert pools', () => {
    expect(migration).toContain('add column verification_type text')
    expect(migration).toContain('alter column verification_type set not null')
    expect(migration).not.toContain("verification_type text not null default 'fund_confirmed'")
    expect(migration).not.toContain("source_type text not null default 'manual'")
    expect(migration).toContain("scope = 'global' and verification_type = 'platform_certified'")
    expect(migration).toContain("scope = 'fund' and verification_type = 'fund_confirmed'")
    expect(migration).toContain('verified_at is not null')
    expect(migration).toContain('verified_by is not null')
    expect(migration).toContain('(select funds.created_by from public.funds where funds.id = experts.fund_id)')
  })

  it('keeps candidates fund-private and server-mediated', () => {
    expect(migration).toContain('create table public.expert_candidates')
    expect(migration).toContain("status text not null default 'pending'")
    expect(migration).toContain('revoke all on table public.expert_candidates from public, anon, authenticated')
    expect(migration).toContain('grant all on table public.expert_candidates to service_role')
    expect(migration).toContain('foreign key (confirmed_expert_id, fund_id)')
    expect(migration).toContain('references public.experts(id, fund_id)')
    expect(migration).toContain('create or replace function public.merge_expert_candidates')
  })

  it('confirms candidates atomically and only for fund admins', () => {
    expect(migration).toContain('create or replace function public.confirm_expert_candidate')
    expect(migration).toContain('for update')
    expect(migration).toContain("members.role = 'admin'")
    expect(migration).toContain("v_candidate.status = 'confirmed'")
    expect(migration).toContain("v_confirmed.scope <> 'fund'")
    expect(migration).toContain("v_candidate.status = 'rejected'")
    expect(migration).toContain('grant execute on function public.confirm_expert_candidate')
  })

  it('matches only eligible formal experts with trust metadata', () => {
    expect(migration).toContain("e.verification_type = 'platform_certified'")
    expect(migration).toContain("e.verification_type = 'fund_confirmed'")
    expect(migration).toContain('e.source_type')
    expect(migration).toContain('e.verified_at is not null')
    expect(migration).not.toMatch(/from public\.expert_candidates\s+e/i)
  })
})
