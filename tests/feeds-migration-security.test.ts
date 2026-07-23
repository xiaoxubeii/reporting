import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../supabase/migrations/20260722000000_feeds_product.sql', import.meta.url),
  'utf8',
)
const approvalMigration = readFileSync(
  new URL('../supabase/migrations/20260722010000_atomic_fund_join_approval.sql', import.meta.url),
  'utf8',
)
const provisioningLeaseMigration = readFileSync(
  new URL('../supabase/migrations/20260722020000_miniflux_provisioning_lease.sql', import.meta.url),
  'utf8',
)
const approvalClaimMigration = readFileSync(
  new URL('../supabase/migrations/20260722030000_claim_fund_join_approval.sql', import.meta.url),
  'utf8',
)

describe('Feeds migration security contract', () => {
  it('keeps API-only tables behind service role instead of direct authenticated access', () => {
    expect(migration).not.toMatch(/grant[\s\S]{0,180}to authenticated/i)
    expect(migration).toMatch(/grant[\s\S]{0,180}to service_role/i)
    expect(migration).toMatch(/revoke all on public\.miniflux_connections from public, anon, authenticated/i)
  })

  it('stores exactly one encrypted Miniflux connection per reporting user', () => {
    expect(migration).toMatch(/create table public\.miniflux_connections\s*\([\s\S]*user_id\s+uuid\s+primary key[\s\S]*api_token_encrypted\s+text\s+not null/i)
    expect(migration).toMatch(/user_id\s+uuid[\s\S]*references auth\.users\s*\(id\)/i)
    expect(migration).toMatch(/external_user_id\s+bigint/i)
    expect(migration).not.toMatch(/fund_id\s+uuid\s+primary key/i)
  })

  it('does not mirror Miniflux sources, subscriptions, entries, or personal state', () => {
    for (const table of ['feed_sources', 'feed_endpoints', 'feed_subscriptions', 'feed_item_states']) {
      expect(migration, table).not.toMatch(new RegExp(`create table (?:public\\.)?${table}\\b`, 'i'))
    }
    expect(migration).not.toMatch(/create (?:or replace )?function public\.(?:create_feed_subscription|update_feed_item_state)/i)
  })

  it('commits membership and approval status in one service-role-only database function', () => {
    expect(approvalMigration).toMatch(/create or replace function public\.approve_fund_join_request/i)
    expect(approvalMigration).toMatch(/for update/i)
    expect(approvalMigration).toMatch(/insert into public\.fund_members[\s\S]*update public\.fund_join_requests/i)
    expect(approvalMigration).toMatch(/security definer[\s\S]*set search_path = public/i)
    expect(approvalMigration).toMatch(/from public\.fund_members[\s\S]*role = 'admin'/i)
    expect(approvalMigration).toMatch(/revoke all[\s\S]*from authenticated/i)
    expect(approvalMigration).toMatch(/grant execute[\s\S]*to service_role/i)
  })

  it('serializes provisioning with a service-role-only expiring per-user lease', () => {
    expect(provisioningLeaseMigration).toMatch(/create table if not exists public\.miniflux_provisioning_leases/i)
    expect(provisioningLeaseMigration).toMatch(/user_id uuid primary key references auth\.users/i)
    expect(provisioningLeaseMigration).toMatch(/expires_at timestamptz not null/i)
    expect(provisioningLeaseMigration).toMatch(/on conflict \(user_id\) do update[\s\S]*expires_at <= now\(\)/i)
    expect(provisioningLeaseMigration).toMatch(/p_ttl_seconds integer default 120/i)
    expect(provisioningLeaseMigration).toMatch(/revoke all[\s\S]*from public, anon, authenticated/i)
    expect(provisioningLeaseMigration).toMatch(/grant execute[\s\S]*to service_role/i)
  })

  it('claims approvals before external provisioning and rechecks admin rights at commit', () => {
    expect(approvalClaimMigration).toMatch(/status = 'provisioning'[\s\S]*approval_claim_id = p_claim_id/i)
    expect(approvalClaimMigration).toMatch(/status = 'pending'[\s\S]*approval_claim_id = null/i)
    expect(approvalClaimMigration).toMatch(/from public\.fund_members[\s\S]*role = 'admin'/i)
    expect(approvalClaimMigration.match(/role = 'admin'[\s\S]{0,100}for update/gi)).toHaveLength(3)
    expect(approvalClaimMigration).toMatch(/status = 'provisioning'[\s\S]*approval_claim_id = p_claim_id[\s\S]*for update/i)
    expect(approvalClaimMigration).toMatch(/reject_fund_join_request[\s\S]*status = 'pending'[\s\S]*return coalesce\(rejected, false\)/i)
    expect(approvalClaimMigration).toMatch(/revoke all[\s\S]*from public, anon, authenticated/i)
    expect(approvalClaimMigration).toMatch(/grant execute[\s\S]*to service_role/i)
  })
})
