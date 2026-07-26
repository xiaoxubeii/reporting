import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync(
  new URL('../supabase/migrations/20260726130000_split_fund_resend_configuration.sql', import.meta.url),
  'utf8',
)
const DATABASE_TYPES = readFileSync(
  new URL('../lib/types/database.ts', import.meta.url),
  'utf8',
)
const PROVIDER_INTEGRATION_SQL = readFileSync(
  new URL('../supabase/migrations/20260726150000_integrate_resend_email_provider.sql', import.meta.url),
  'utf8',
)

describe('staged Fund Resend configuration migration', () => {
  it('allows sending and managed receiving capabilities to be configured independently', () => {
    expect(SQL).toMatch(/alter column sending_api_key_encrypted drop not null/i)
    expect(SQL).toMatch(/alter column receiving_api_key_encrypted drop not null/i)
    expect(SQL).toMatch(/alter column webhook_secret_encrypted drop not null/i)
    expect(SQL).toMatch(/alter column route_token_hash drop not null/i)
    expect(SQL).toMatch(/add column if not exists provider_webhook_id text/i)
    expect(SQL).toMatch(/constraint fund_email_provider_credentials_capability_check[\s\S]*sending_api_key_encrypted is not null[\s\S]*receiving_api_key_encrypted is not null[\s\S]*webhook_secret_encrypted is not null[\s\S]*route_token_hash is not null/i)
    expect(SQL).not.toMatch(/constraint fund_email_provider_credentials_capability_check[\s\S]{0,900}provider_webhook_id is not null/i)
  })

  it('adds service-only atomic outbound and inbound configuration functions', () => {
    for (const fn of [
      'fund_email_configure_sending',
      'fund_email_configure_receiving',
      'fund_email_begin_delete',
      'fund_email_finalize_delete',
    ]) {
      expect(SQL).toMatch(new RegExp(`create or replace function public\\.${fn}`, 'i'))
      expect(SQL).toMatch(new RegExp(`${fn}[\\s\\S]*security definer[\\s\\S]*set search_path = public`, 'i'))
      expect(SQL).toMatch(new RegExp(`revoke all on function public\\.${fn}[\\s\\S]{0,700}from public, anon, authenticated`, 'i'))
      expect(SQL).toMatch(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,700}to service_role`, 'i'))
    }
    expect(SQL).toMatch(/fund_email_configure_receiving[\s\S]*previous_route_token_hash = null[\s\S]*previous_route_expires_at = null/i)
    expect(SQL).toMatch(/fund_email_configure_receiving[\s\S]*for update[\s\S]*provider_webhook_id is distinct from p_expected_provider_webhook_id/i)
    expect(SQL).toMatch(/fund_email_configure_receiving[\s\S]*domain_status = excluded\.domain_status[\s\S]*dns_records = excluded\.dns_records/i)
    expect(SQL).toMatch(/fund_email_configure_sending[\s\S]*for update[\s\S]*v_existing\.status <> 'enabled'[\s\S]*sending_api_key_encrypted = excluded\.sending_api_key_encrypted/i)
    expect(SQL).not.toMatch(/fund_email_configure_sending[\s\S]{0,2500}on conflict \(fund_id\) do update[\s\S]{0,500}status = 'enabled'/i)
    expect(SQL).toMatch(/fund_email_begin_delete[\s\S]*for update[\s\S]*updated_at is distinct from p_expected_updated_at[\s\S]*status = 'disabled'/i)
    expect(SQL).toMatch(/fund_email_finalize_delete[\s\S]*status <> 'disabled'[\s\S]*updated_at is distinct from p_expected_updated_at[\s\S]*delete from public\.fund_email_provider_credentials/i)
  })

  it('updates generated types without making provider metadata browser-readable', () => {
    expect(DATABASE_TYPES).toMatch(/fund_email_provider_credentials:[\s\S]*provider_webhook_id: string \| null/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_provider_credentials:[\s\S]*sending_api_key_encrypted: string \| null/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_configure_sending:[\s\S]*p_sending_api_key_encrypted: string/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_configure_receiving:[\s\S]*p_provider_webhook_id: string/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_begin_delete:[\s\S]*p_expected_updated_at: string/i)
    expect(DATABASE_TYPES).toMatch(/fund_email_finalize_delete:[\s\S]*p_expected_updated_at: string/i)
  })

  it('adds Resend to the existing inbound provider contract and allows metadata-only identity rows', () => {
    expect(PROVIDER_INTEGRATION_SQL).toMatch(/inbound_email_provider[\s\S]*'postmark'[\s\S]*'mailgun'[\s\S]*'resend'/i)
    expect(PROVIDER_INTEGRATION_SQL).toMatch(/drop constraint if exists fund_email_provider_credentials_capability_check/i)
    expect(PROVIDER_INTEGRATION_SQL).toMatch(/receiving_api_key_encrypted is null[\s\S]*webhook_secret_encrypted is null[\s\S]*route_token_hash is null[\s\S]*provider_webhook_id is null/i)
    expect(PROVIDER_INTEGRATION_SQL).toMatch(/create or replace function public\.fund_email_configure_identity/i)
    expect(PROVIDER_INTEGRATION_SQL).toMatch(/sending_api_key_encrypted = null/i)
  })

  it('adds service-only fenced receiving disconnect functions', () => {
    for (const fn of [
      'fund_email_begin_receiving_disconnect',
      'fund_email_finalize_receiving_disconnect',
    ]) {
      expect(PROVIDER_INTEGRATION_SQL).toMatch(new RegExp(`create or replace function public\\.${fn}`, 'i'))
      expect(PROVIDER_INTEGRATION_SQL).toMatch(new RegExp(`${fn}[\\s\\S]*security definer[\\s\\S]*set search_path = public`, 'i'))
      expect(PROVIDER_INTEGRATION_SQL).toMatch(new RegExp(`revoke all on function public\\.${fn}[\\s\\S]{0,800}from public, anon, authenticated`, 'i'))
      expect(PROVIDER_INTEGRATION_SQL).toMatch(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,800}to service_role`, 'i'))
    }
    expect(PROVIDER_INTEGRATION_SQL).toMatch(/fund_email_begin_receiving_disconnect[\s\S]*receiving_status = 'failed'/i)
    expect(PROVIDER_INTEGRATION_SQL).toMatch(/fund_email_finalize_receiving_disconnect[\s\S]*receiving_api_key_encrypted = null[\s\S]*provider_webhook_id = null/i)
  })
})
