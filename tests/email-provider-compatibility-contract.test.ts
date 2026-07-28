import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
}

describe('email provider compatibility', () => {
  it('accepts Postmark inbound only while Postmark is the selected provider', () => {
    const route = source('app/api/inbound-email/route.ts')
    expect(route).toMatch(/from\('fund_settings'\)[\s\S]*eq\('inbound_email_provider',\s*'postmark'\)[\s\S]*eq\('postmark_inbound_address',\s*toAddress\)/)
    const globalFallback = route.slice(route.indexOf("from('authorized_senders')"))
    expect(globalFallback).toMatch(/from\('fund_settings'\)[\s\S]*in\('fund_id',\s*candidateFundIds\)[\s\S]*eq\('inbound_email_provider',\s*'postmark'\)/)
    expect(globalFallback.indexOf("eq('inbound_email_provider', 'postmark')"))
      .toBeLessThan(globalFallback.indexOf('postmarkFunds.length > 1'))
  })

  it('uses configured sender identity for generic Resend callers', () => {
    const email = source('lib/email.ts')
    expect(email).toMatch(/system_email_from_name, system_email_from_address/)
    expect(email).toMatch(/params\.from \?\? config\.from/)
  })

  it.each([
    'app/api/inbound-email/route.ts',
    'app/api/inbound-email/mailgun/route.ts',
  ])('fails closed before pipeline processing when legacy attachment storage fails: %s', file => {
    const route = source(file)
    expect(route).toContain('prepareLegacyInboundAttachments')
    expect(route).toContain('persistLegacyInboundAttachments')
    expect(route).not.toContain('Content: att.Content')
    expect(route.indexOf('if (!preparedAttachments.ok)'))
      .toBeLessThan(route.indexOf('await runPipeline'))
    expect(route.indexOf('if (!storedAttachments.ok)'))
      .toBeLessThan(route.indexOf('await runPipeline'))
  })

  it('exposes an atomic key transition without copying incompatible legacy ciphertext', () => {
    const migration = source('supabase/migrations/20260726170000_harden_resend_provider_integration.sql')
    expect(migration).not.toMatch(/set resend_api_key_encrypted = credentials\.sending_api_key_encrypted/)
    expect(migration).toMatch(/fund_email_set_authoritative_resend_key/)
    expect(migration).toMatch(/fund_email_promote_legacy_resend_key/)
    expect(migration).toMatch(/asks_email_provider = 'resend'/)
    expect(migration).toMatch(/resend_api_key_encrypted is null/)
    expect(migration).toMatch(/sending_api_key_encrypted = p_expected_sending_api_key_encrypted/)
    expect(migration).toMatch(/set sending_api_key_encrypted = null/)
  })
})
