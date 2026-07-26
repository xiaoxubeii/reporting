import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync(
  new URL('../supabase/migrations/20260726041000_resend_outbound_semantics.sql', import.meta.url),
  'utf8',
)

describe('Resend outbound semantic hardening migration', () => {
  it('persists the server-generated RFC Message-ID before provider submission', () => {
    expect(SQL).toMatch(/fund_email_prepare_outbound_message[\s\S]*p_internet_message_id text/i)
    expect(SQL).toMatch(/insert into public\.fund_email_messages[\s\S]*internet_message_id[\s\S]*p_internet_message_id/i)
    expect(SQL).toMatch(/returns table[\s\S]*internet_message_id text/i)
  })

  it('rejects idempotency reuse across thread identity or reply-route changes', () => {
    expect(SQL).toMatch(/v_thread\.purpose is distinct from p_purpose/i)
    expect(SQL).toMatch(/v_thread\.context_type is distinct from p_context_type/i)
    expect(SQL).toMatch(/v_thread\.context_id is distinct from p_context_id/i)
    expect(SQL).toMatch(/v_thread\.external_participant_address is distinct from p_external_participant_address/i)
    expect(SQL).toMatch(/reply_routes\.token_hash = p_reply_token_hash/i)
    expect(SQL).toMatch(/v_message\.internet_message_id is distinct from p_internet_message_id/i)
  })

  it('atomically records provider acceptance and verifies the sending capability', () => {
    expect(SQL).toMatch(/create or replace function public\.fund_email_mark_outbound_submitted/i)
    expect(SQL).toMatch(/update public\.fund_email_messages[\s\S]*provider_message_id = p_provider_message_id/i)
    expect(SQL).toMatch(/update public\.fund_email_provider_credentials[\s\S]*sending_status = 'verified'/i)
    expect(SQL).toMatch(/grant execute on function public\.fund_email_mark_outbound_submitted/i)
  })

  it('enforces one Deal screening row per inbound email without deleting existing data', () => {
    expect(SQL).toMatch(/create unique index inbound_deals_email_id_key[\s\S]*on public\.inbound_deals \(email_id\)/i)
    expect(SQL).not.toMatch(/delete from public\.inbound_deals/i)
  })
})
