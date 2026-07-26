import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync(
  new URL('../supabase/migrations/20260726010000_multi_tenant_resend_mail.sql', import.meta.url),
  'utf8',
)
const DATABASE_TYPES = readFileSync(
  new URL('../lib/types/database.ts', import.meta.url),
  'utf8',
)

describe('multi-tenant Resend migration security contract', () => {
  const serviceOnlyTables = [
    'fund_email_provider_credentials',
    'fund_email_mailboxes',
    'fund_email_threads',
    'fund_email_messages',
    'fund_email_reply_routes',
    'fund_email_webhook_events',
  ]

  it('keeps every email infrastructure table service-role-only', () => {
    for (const table of serviceOnlyTables) {
      expect(SQL).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
      expect(SQL).toMatch(
        new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, 'i'),
      )
      expect(SQL).toMatch(
        new RegExp(`grant (?:select, insert, update, delete|all) on public\\.${table} to service_role`, 'i'),
      )
    }
    expect(SQL).not.toMatch(/create policy[\s\S]{0,180}fund_email_/i)
  })

  it('stores one exact encrypted Resend connection per Fund without plaintext secrets', () => {
    expect(SQL).toMatch(
      /create table public\.fund_email_provider_credentials\s*\([\s\S]*fund_id uuid not null[\s\S]*unique \(fund_id\)/i,
    )
    expect(SQL).toMatch(/domain text not null/i)
    expect(SQL).toMatch(/sending_api_key_encrypted text not null/i)
    expect(SQL).toMatch(/receiving_api_key_encrypted text not null/i)
    expect(SQL).toMatch(/webhook_secret_encrypted text not null/i)
    expect(SQL).toMatch(/route_token_hash text not null[\s\S]*route_token_hash ~ '\^\[a-f0-9\]\{64\}\$'/i)
    expect(SQL).not.toMatch(/\b(?:sending_api_key|receiving_api_key|webhook_secret|route_token)\s+text\b/i)
    expect(SQL).toMatch(/create unique index fund_email_provider_credentials_domain_key[\s\S]*lower\(domain\)/i)
    expect(SQL).toMatch(/previous_route_token_hash text[\s\S]*previous_route_expires_at timestamptz/i)
    expect(SQL).toMatch(/fund_email_rotate_webhook_route[\s\S]*previous_route_token_hash = route_token_hash[\s\S]*previous_route_expires_at = now\(\)/i)
  })

  it('adds a unique DNS-safe Fund mail slug and makes it immutable while connected', () => {
    expect(SQL).toMatch(/alter table public\.funds[\s\S]*add column (?:if not exists )?email_subdomain text/i)
    expect(SQL).toMatch(
      /constraint funds_email_subdomain_check[\s\S]*email_subdomain = lower\(email_subdomain\)[\s\S]*char_length\(email_subdomain\) between 1 and 63[\s\S]*email_subdomain ~ '\^\[a-z0-9\]/i,
    )
    expect(SQL).toMatch(/create unique index funds_email_subdomain_key[\s\S]*lower\(email_subdomain\)/i)
    expect(SQL).toMatch(/fund_email_reject_connected_slug_change[\s\S]*fund_email_provider_credentials/i)
  })

  it('scopes mailbox names and user ownership to one Fund', () => {
    expect(SQL).toMatch(
      /create table public\.fund_email_mailboxes\s*\([\s\S]*fund_id uuid not null[\s\S]*local_part text not null[\s\S]*unique \(fund_id, local_part\)/i,
    )
    expect(SQL).toMatch(/foreign key \(fund_id, user_id\)[\s\S]*fund_members \(fund_id, user_id\)/i)
    expect(SQL).toMatch(/create unique index fund_email_mailboxes_user_key[\s\S]*\(fund_id, user_id\)[\s\S]*where user_id is not null/i)
    expect(SQL).toMatch(/kind in \('user', 'pitch', 'expert', 'shared'\)/i)
  })

  it('prevents cross-Fund mailbox, thread, message, and reply-route relationships', () => {
    expect(SQL).toMatch(/fund_email_mailboxes[\s\S]*unique \(id, fund_id\)/i)
    expect(SQL).toMatch(/fund_email_threads[\s\S]*foreign key \(mailbox_id, fund_id\)[\s\S]*fund_email_mailboxes \(id, fund_id\)/i)
    expect(SQL).toMatch(/fund_email_messages[\s\S]*foreign key \(thread_id, fund_id\)[\s\S]*fund_email_threads \(id, fund_id\)/i)
    expect(SQL).toMatch(/fund_email_messages[\s\S]*foreign key \(mailbox_id, fund_id\)[\s\S]*fund_email_mailboxes \(id, fund_id\)/i)
    expect(SQL).toMatch(/fund_email_reply_routes[\s\S]*foreign key \(thread_id, fund_id\)[\s\S]*fund_email_threads \(id, fund_id\)/i)
    expect(SQL).toMatch(/fund_email_reply_routes[\s\S]*foreign key \(mailbox_id, fund_id\)[\s\S]*fund_email_mailboxes \(id, fund_id\)/i)
    expect(SQL).toMatch(/alter table public\.inbound_emails[\s\S]*unique \(id, fund_id\)/i)
    expect(SQL).toMatch(/fund_email_messages[\s\S]*foreign key \(inbound_email_id, fund_id\)[\s\S]*inbound_emails \(id, fund_id\)/i)
    expect(SQL).not.toMatch(/recipient_user_id uuid references auth\.users/i)
  })

  it('stores only a hashed, revocable and expiring reply route', () => {
    expect(SQL).toMatch(
      /create table public\.fund_email_reply_routes\s*\([\s\S]*token_hash text not null unique[\s\S]*expires_at timestamptz[\s\S]*revoked_at timestamptz/i,
    )
    expect(SQL).toMatch(/token_hash ~ '\^\[a-f0-9\]\{64\}\$'/i)
    expect(SQL).not.toMatch(/\braw_token\b|\breply_token\s+text\b/i)
  })

  it('deduplicates provider events and emails at the database boundary', () => {
    expect(SQL).toMatch(/unique \(connection_id, svix_id\)/i)
    expect(SQL).toMatch(/unique \(connection_id, provider_email_id\)/i)
    expect(SQL).toMatch(/unique \(fund_id, provider, provider_message_id\)/i)
    expect(SQL).toMatch(/status text not null default 'processing'[\s\S]*processing', 'completed', 'failed'/i)
    expect(SQL).toMatch(/attempt_id uuid not null/i)
    expect(SQL).toMatch(/lease_expires_at timestamptz not null/i)
  })

  it('uses attempt-fenced service-only claim, complete, and fail functions', () => {
    for (const fn of [
      'fund_email_claim_webhook_event',
      'fund_email_complete_webhook_event',
      'fund_email_fail_webhook_event',
    ]) {
      expect(SQL).toMatch(new RegExp(`create or replace function public\\.${fn}`, 'i'))
      expect(SQL).toMatch(new RegExp(`${fn}[\\s\\S]*security definer[\\s\\S]*set search_path = public`, 'i'))
      expect(SQL).toMatch(
        new RegExp(`revoke all on function public\\.${fn}[\\s\\S]{0,400}from public, anon, authenticated`, 'i'),
      )
      expect(SQL).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,400}to service_role`, 'i'),
      )
    }
    expect(SQL).toMatch(/for update skip locked/i)
    expect(SQL).toMatch(/attempt_id = p_attempt_id[\s\S]*status = 'processing'/i)
  })

  it('creates reserved mailboxes with a service-only idempotent function', () => {
    expect(SQL).toMatch(/create or replace function public\.fund_email_ensure_reserved_mailboxes/i)
    expect(SQL).toMatch(/values[\s\S]*'pitch'[\s\S]*'expert'[\s\S]*on conflict \(fund_id, local_part\) do nothing/i)
    expect(SQL).toMatch(/revoke all on function public\.fund_email_ensure_reserved_mailboxes[\s\S]{0,400}from public, anon, authenticated/i)
    expect(SQL).toMatch(/grant execute on function public\.fund_email_ensure_reserved_mailboxes[\s\S]{0,400}to service_role/i)
    expect(SQL).toMatch(/fund_email_set_user_mailbox[\s\S]*from public\.fund_members[\s\S]*on conflict \(fund_id, user_id\) where user_id is not null/i)
    expect(SQL).toMatch(/fund_email_detach_deleted_member_mailbox[\s\S]*kind = 'shared'[\s\S]*active = false/i)
    expect(SQL).toMatch(/revoke all on function public\.fund_email_set_user_mailbox[\s\S]{0,400}from public, anon, authenticated/i)
    expect(SQL).toMatch(/grant execute on function public\.fund_email_set_user_mailbox[\s\S]{0,400}to service_role/i)
  })

  it('creates connections and durable outbound rows through service-only transactions', () => {
    for (const fn of [
      'fund_email_create_connection',
      'fund_email_prepare_outbound_message',
    ]) {
      expect(SQL).toMatch(new RegExp(`create or replace function public\\.${fn}`, 'i'))
      expect(SQL).toMatch(new RegExp(`${fn}[\\s\\S]*security definer[\\s\\S]*set search_path = public`, 'i'))
      expect(SQL).toMatch(
        new RegExp(`revoke all on function public\\.${fn}[\\s\\S]{0,900}from public, anon, authenticated`, 'i'),
      )
      expect(SQL).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,900}to service_role`, 'i'),
      )
    }
    expect(SQL).toMatch(/fund_email_prepare_outbound_message[\s\S]*pg_advisory_xact_lock/i)
    expect(SQL).toMatch(/fund_email_prepare_outbound_message[\s\S]*fund_email_reply_routes[\s\S]*fund_email_messages/i)
  })

  it('stores routed inbound messages atomically without attachment bytes', () => {
    expect(SQL).toMatch(
      /fund_email_messages[\s\S]*attachment_metadata jsonb not null default '\[\]'::jsonb[\s\S]*jsonb_typeof\(attachment_metadata\) = 'array'/i,
    )
    expect(SQL).toMatch(/create or replace function public\.fund_email_store_inbound_message/i)
    expect(SQL).toMatch(
      /fund_email_store_inbound_message[\s\S]*security definer[\s\S]*set search_path = public/i,
    )
    expect(SQL).toMatch(
      /fund_email_store_inbound_message[\s\S]*fund_email_threads[\s\S]*fund_email_messages/i,
    )
    expect(SQL).toMatch(
      /fund_email_store_inbound_message[\s\S]*unique_violation[\s\S]*provider_message_id/i,
    )
    expect(SQL).toMatch(
      /revoke all on function public\.fund_email_store_inbound_message[\s\S]{0,900}from public, anon, authenticated/i,
    )
    expect(SQL).toMatch(
      /grant execute on function public\.fund_email_store_inbound_message[\s\S]{0,900}to service_role/i,
    )
    expect(SQL).not.toMatch(/attachment_(?:content|bytes|base64)\s+(?:text|bytea)/i)
  })

  it('links explicit pitch and expert workflows without crossing into Diligence evidence', () => {
    expect(SQL).toMatch(
      /inbound_deals_intro_source_check[\s\S]*'heartbeat'[\s\S]*'email'/i,
    )
    expect(SQL).toMatch(
      /alter table public\.diligence_expert_requests[\s\S]*email_thread_id uuid/i,
    )
    expect(SQL).toMatch(
      /foreign key \(email_thread_id, fund_id\)[\s\S]*fund_email_threads \(id, fund_id\)/i,
    )
    expect(DATABASE_TYPES).toMatch(
      /diligence_expert_requests:[\s\S]*email_thread_id: string \| null/i,
    )
  })

  it('updates generated database types for every table and service-only function', () => {
    for (const table of serviceOnlyTables) {
      expect(DATABASE_TYPES).toMatch(new RegExp(`${table}: \\{[\\s\\S]*Row: \\{`, 'i'))
    }
    expect(DATABASE_TYPES).toMatch(/funds:[\s\S]*email_subdomain: string \| null/i)
    expect(DATABASE_TYPES).toMatch(/inbound_emails:[\s\S]*email_thread_id: string \| null/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_claim_webhook_event:[\s\S]*p_route_token_hash: string/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_complete_webhook_event:[\s\S]*Returns: boolean/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_fail_webhook_event:[\s\S]*Returns: boolean/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_set_user_mailbox:[\s\S]*p_user_id: string/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_create_connection:[\s\S]*p_route_token_hash: string/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_prepare_outbound_message:[\s\S]*p_idempotency_key: string/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_messages:[\s\S]*attachment_metadata: Json/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_store_inbound_message:[\s\S]*p_attachment_metadata: Json/i)
  })
})
