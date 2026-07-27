import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync(
  new URL('../supabase/migrations/20260729000000_fund_identity_onboarding.sql', import.meta.url),
  'utf8',
)
const DATABASE_TYPES = readFileSync(new URL('../lib/types/database.ts', import.meta.url), 'utf8')

describe('Fund identity onboarding migration security contract', () => {
  it('creates an owner-scoped global profile with conservative legacy backfill', () => {
    expect(SQL).toContain('create table public.user_profiles')
    expect(SQL).toMatch(/full_name text check \(full_name is null or \(char_length\(full_name\) between 1 and 120/i)
    expect(SQL).toMatch(/alter table public\.user_profiles enable row level security/i)
    expect(SQL).toMatch(/create policy user_profiles_owner_select[\s\S]*auth\.uid\(\) = user_id/i)
    expect(SQL).not.toMatch(/create policy user_profiles_owner_(?:insert|update)/i)
    expect(SQL).toMatch(/revoke insert, update, delete on table public\.user_profiles from authenticated/i)
    expect(SQL).toMatch(/grant select on table public\.user_profiles to authenticated, service_role/i)
    expect(SQL).toMatch(/insert into public\.user_profiles[\s\S]*fund_members[\s\S]*display_name/i)
    expect(SQL).toMatch(/on conflict \(user_id\) do update[\s\S]*coalesce\(public\.user_profiles\.full_name/i)
  })

  it('stores invitation capabilities only as service-owned hashed records', () => {
    expect(SQL).toContain('create table public.fund_member_invitations')
    expect(SQL).toMatch(/role text not null check \(role in \('admin', 'member'\)\)/i)
    expect(SQL).toMatch(/token_hash text not null unique check \(token_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/i)
    expect(SQL).toMatch(/accepted_by uuid references auth\.users\(id\) on delete restrict/i)
    expect(SQL).toMatch(/check \(not \(accepted_at is not null and revoked_at is not null\)\)/i)
    expect(SQL).toMatch(/alter table public\.fund_member_invitations enable row level security/i)
    expect(SQL).toMatch(/revoke all on table public\.fund_member_invitations from public, anon, authenticated/i)
    expect(SQL).toMatch(/grant select, insert, update, delete on table public\.fund_member_invitations to service_role/i)
    expect(SQL).not.toMatch(/create policy[\s\S]{0,180}fund_member_invitations/i)
    expect(SQL).toMatch(/delivery_confirmed_at timestamptz/i)
  })

  it('revokes direct authenticated Fund and membership creation', () => {
    expect(SQL).toContain('revoke insert on table public.funds from authenticated')
    expect(SQL).toContain('revoke insert on table public.fund_members from authenticated')
    expect(SQL).toMatch(/drop policy if exists "Authenticated users can create a fund" on public\.funds/i)
    expect(SQL).toMatch(/drop policy if exists "Fund admins can invite others" on public\.fund_members/i)
    expect(SQL).toMatch(/drop policy if exists "Fund members can update their fund" on public\.funds/i)
    expect(SQL).toMatch(/create policy "Fund admins can update their fund"[\s\S]*public\.is_fund_admin\(id\)/i)
    expect(SQL).toContain('Fund founder is immutable')
    expect(SQL).toMatch(/drop policy if exists "Authenticated users can create join requests" on public\.fund_join_requests/i)
    expect(SQL).toMatch(/revoke insert, update, delete on table public\.fund_join_requests from authenticated, service_role/i)
    expect(SQL).toMatch(/revoke execute on function public\.approve_fund_join_request\(uuid, uuid, uuid, uuid\) from service_role/i)
    expect(SQL).toMatch(/drop policy if exists "Fund owners can delete their fund" on public\.funds/i)
    expect(SQL).toMatch(/drop policy if exists "Fund creator can delete their fund" on public\.funds/i)
    expect(SQL).toMatch(/if exists \([\s\S]*from pg_policies[\s\S]*tablename = 'funds'[\s\S]*cmd = 'DELETE'/i)
    expect(SQL).toMatch(/revoke delete on table public\.funds from authenticated/i)
    expect(SQL).toContain('Fund identity cannot be deleted')
  })

  it('rejects internal business mailboxes during both signup and Auth email changes', () => {
    expect(SQL).toContain('create or replace function public.reject_internal_auth_email')
    expect(SQL).toMatch(/new\.email_change/i)
    expect(SQL).toMatch(/before insert or update of email, email_change on auth\.users/i)
    expect(SQL).toContain('Internal Fund email cannot authenticate')
    expect(SQL).toMatch(/from auth\.users[\s\S]*internal Auth identities must be migrated to external email first/i)
    expect(SQL.indexOf('create trigger reject_internal_auth_email')).toBeLessThan(
      SQL.indexOf('Existing internal Auth identities must be migrated to external email first'),
    )
  })

  it('bootstraps one immutable Fund identity atomically through service role only', () => {
    expect(SQL).toContain('create or replace function public.bootstrap_fund_identity')
    const fn = SQL.match(/create or replace function public\.bootstrap_fund_identity[\s\S]*?\n\$\$;/i)?.[0] ?? ''
    expect(fn).toMatch(/security definer/i)
    expect(fn).toMatch(/pg_advisory_xact_lock/i)
    expect(fn).toMatch(/insert into public\.funds/i)
    expect(fn).toMatch(/insert into public\.fund_members/i)
    expect(fn).toMatch(/insert into public\.fund_settings/i)
    expect(fn).toMatch(/fund_email_ensure_reserved_mailboxes/i)
    expect(fn).toMatch(/returns table \(fund_id uuid, slug text\)/i)
    expect(SQL).toMatch(/revoke all on function public\.bootstrap_fund_identity[\s\S]{0,1000}from public, anon, authenticated/i)
    expect(SQL).toMatch(/grant execute on function public\.bootstrap_fund_identity[\s\S]{0,1000}to service_role/i)
    expect(SQL).toMatch(/Fund slug is immutable/i)
    expect(SQL).toMatch(/Fund email subdomain is immutable/i)
    expect(SQL).toMatch(/p_slug in \([\s\S]*'billing'[\s\S]*'mail'[\s\S]*'status'/i)
    expect(SQL).toContain("base_candidate := 'f-' || replace(missing.id::text, '-', '')")
    expect(SQL).not.toContain('Existing Fund namespace uses a reserved label')
  })

  it('implements locked invitation lifecycle without trusting caller role or email', () => {
    for (const fn of [
      'create_fund_member_invitation',
      'rotate_fund_member_invitation',
      'revoke_fund_member_invitation',
      'resolve_fund_member_invitation',
      'accept_fund_member_invitation',
      'confirm_fund_member_invitation_delivery',
    ]) {
      expect(SQL).toMatch(new RegExp(`create or replace function public\\.${fn}`, 'i'))
      expect(SQL).toMatch(new RegExp(`${fn}[\\s\\S]*security definer[\\s\\S]*set search_path = public`, 'i'))
      expect(SQL).toMatch(
        new RegExp(`revoke all on function public\\.${fn}[\\s\\S]{0,1600}from public, anon, authenticated`, 'i'),
      )
      expect(SQL).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,1600}to service_role`, 'i'),
      )
    }
    const accept = SQL.match(/create or replace function public\.accept_fund_member_invitation[\s\S]*?\n\$\$;/i)?.[0] ?? ''
    expect(accept).toMatch(/for update/i)
    expect(accept).toMatch(/pg_advisory_xact_lock[\s\S]*auth-user:/i)
    expect(accept).toMatch(/auth\.users/i)
    expect(accept).toMatch(/email_confirmed_at is not null/i)
    expect(accept).toMatch(/lower\(btrim\(/i)
    expect(accept).toMatch(/insert into public\.fund_members/i)
    expect(accept).toMatch(/accepted_by = p_user_id[\s\S]*return query/i)
    expect(accept).not.toMatch(/on conflict/i)
    expect(accept).toMatch(/delivery_confirmed_at is null/i)
  })

  it('makes user mailbox claims immutable and retains historical ownership', () => {
    expect(SQL).toMatch(/alter table public\.fund_email_mailboxes[\s\S]*add column claimed_by_user_id uuid/i)
    expect(SQL).toMatch(/alter table public\.fund_email_mailboxes[\s\S]*add column claimed_at timestamptz/i)
    expect(SQL).toMatch(/kind = 'user'[\s\S]*claimed_by_user_id is not null/i)
    expect(SQL).toMatch(/create or replace function public\.fund_email_set_user_mailbox/i)
    expect(SQL).toMatch(/pg_advisory_xact_lock[\s\S]*fund-mailbox:/i)
    expect(SQL).toContain('Fund mailbox local part is immutable')
    expect(SQL).toMatch(/raise exception using[\s\S]*errcode = '23505'/i)
    expect(SQL).toMatch(/create or replace function public\.fund_email_detach_deleted_member_mailbox/i)
    expect(SQL).toMatch(/claimed_by_user_id = old\.user_id[\s\S]*user_id = null[\s\S]*active = false/i)
    expect(SQL).toMatch(/unique \(fund_id, local_part\)/i)
    expect(SQL).toMatch(/create or replace function public\.fund_email_mailbox_identity_immutable/i)
    expect(SQL).toMatch(/new\.local_part is distinct from old\.local_part/i)
    expect(SQL).toMatch(/new\.claimed_by_user_id is distinct from old\.claimed_by_user_id/i)
    expect(SQL).toMatch(/p_local_part like '%\._%'[\s\S]*p_local_part like '%_\.%'/i)
    expect(SQL).toMatch(/revoke delete on table public\.fund_email_mailboxes from service_role/i)
  })

  it('requires external Auth identities and active membership for identity writes', () => {
    const bootstrap = SQL.match(/create or replace function public\.bootstrap_fund_identity[\s\S]*?\n\$\$;/i)?.[0] ?? ''
    expect(bootstrap).toMatch(/split_part\(lower\(btrim\(users\.email\)\), '@', 2\)/i)
    expect(bootstrap).toMatch(/not like '%\.fundworkspace\.com'/i)

    const displayName =
      SQL.match(/create or replace function public\.fund_email_update_user_mailbox_display_name[\s\S]*?\n\$\$;/i)?.[0] ?? ''
    expect(displayName).toMatch(/from public\.fund_members/i)
    expect(displayName).toMatch(/mailboxes\.user_id = p_user_id/i)
    expect(displayName).toMatch(/mailboxes\.active is true/i)
  })

  it('admits exact live external invitations but always rejects internal mailbox login', () => {
    expect(SQL).toMatch(/create or replace function public\.hook_before_user_created/i)
    expect(SQL).toContain('Internal Fund email cannot authenticate')
    expect(SQL).toMatch(/email_domain = 'fundworkspace\.com'[\s\S]*email_domain like '%\.fundworkspace\.com'/i)
    expect(SQL).toMatch(/from public\.fund_member_invitations/i)
    expect(SQL).toMatch(/accepted_at is null[\s\S]*revoked_at is null[\s\S]*replaced_at is null[\s\S]*expires_at > now\(\)/i)
  })

  it('updates generated database types for public client contracts', () => {
    expect(DATABASE_TYPES).toMatch(/user_profiles: \{[\s\S]*Row: \{[\s\S]*full_name: string \| null/i)
    expect(DATABASE_TYPES).toMatch(/fund_member_invitations: \{[\s\S]*Row: \{[\s\S]*token_hash: string/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_mailboxes:[\s\S]*claimed_by_user_id: string \| null[\s\S]*claimed_at: string \| null/i)
    expect(DATABASE_TYPES).toMatch(/bootstrap_fund_identity:[\s\S]*Returns: \{[\s\S]*fund_id: string[\s\S]*slug: string/i)
    expect(DATABASE_TYPES).toMatch(/accept_fund_member_invitation:[\s\S]*Returns:/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_update_user_mailbox_display_name:[\s\S]*Returns:/i)
  })
})
