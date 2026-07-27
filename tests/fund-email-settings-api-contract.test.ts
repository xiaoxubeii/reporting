import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ROUTE = readFileSync(
  new URL('../app/api/settings/fund-email/route.ts', import.meta.url),
  'utf8',
)
const SETTINGS_ROUTE = readFileSync(
  new URL('../app/api/settings/route.ts', import.meta.url),
  'utf8',
)

describe('Fund email settings API contract', () => {
  it('derives user and Fund identity from Session and keeps mailbox writes on the Personal API', () => {
    expect(ROUTE).toMatch(/auth\.getUser\(\)/)
    expect(ROUTE).toMatch(/assertReadAccess\(admin, user\.id\)/)
    expect(ROUTE).toMatch(/assertWriteAccess\(admin, user\.id\)/)
    expect(ROUTE).toMatch(/assertAdminAccess\(admin, user\.id\)/)
    expect(ROUTE).not.toMatch(/setCurrentUserMailbox|action === 'set_mailbox'/)
    expect(ROUTE).not.toMatch(/body\.(?:fundId|userId|from|replyTo)/)
  })

  it('never returns or selects stored secrets and manages webhook secrets server-side', () => {
    expect(ROUTE).not.toMatch(/select\([^)]*(?:api_key_encrypted|webhook_secret_encrypted|route_token_hash)/i)
    expect(ROUTE).not.toMatch(/sendingApiKey\s*[:,]\s*(?:status|connection)|receivingApiKey\s*[:,]\s*(?:status|connection)/)
    expect(ROUTE).not.toMatch(/action === 'configure_identity'/)
    expect(ROUTE).not.toMatch(/action === 'configure_outbound'/)
    expect(ROUTE).toMatch(/action === 'configure_inbound'/)
    expect(ROUTE).toMatch(/requiredExistingIdentity\(status\.emailSubdomain\)/)
    expect(ROUTE).toMatch(/action === 'recreate_inbound_webhook'/)
    expect(ROUTE).not.toMatch(/requiredString\(body\.webhookSecret\)/)
    expect(ROUTE).not.toMatch(/action === 'rotate_route'/)
  })

  it('keeps existing fund_settings provider fields authoritative', () => {
    expect(SETTINGS_ROUTE).toMatch(/rpc\('fund_email_set_authoritative_resend_key'/)
    expect(SETTINGS_ROUTE).toMatch(/p_update_outbound_provider:\s*outboundEmailProvider !== undefined/)
    expect(SETTINGS_ROUTE).toMatch(/p_update_asks_provider:\s*asksEmailProvider !== undefined/)
    expect(SETTINGS_ROUTE).toMatch(/delete settingsUpdates\.outbound_email_provider/)
    expect(SETTINGS_ROUTE).toMatch(/delete settingsUpdates\.asks_email_provider/)
    expect(SETTINGS_ROUTE).not.toMatch(/settingsUpdates\.resend_api_key_encrypted\s*=/)
    expect(SETTINGS_ROUTE).toMatch(/settingsUpdates\.outbound_email_provider\s*=\s*outboundEmailProvider/)
    expect(SETTINGS_ROUTE).toMatch(/settingsUpdates\.inbound_email_provider\s*=\s*inboundEmailProvider/)
    expect(ROUTE).not.toMatch(/sendingApiKey/)
    expect(ROUTE).toMatch(/inbound_email_provider:\s*'resend'/)
  })

  it('returns the server-owned base domain instead of making the browser assume one', () => {
    expect(ROUTE).toMatch(/baseDomain:\s*fundEmailBaseDomain\(\)/)
  })

  it('bounds and validates every JSON settings request', () => {
    expect(ROUTE).toMatch(/readBoundedJson\(request/)
    expect(ROUTE).toMatch(/MAX_SETTINGS_BODY_BYTES/)
  })

  it('disconnects receiving with provider-not-found idempotency and a database CAS boundary', () => {
    expect(ROUTE).toMatch(/removeResendWebhook\(\s*receiving\.receivingApiKey,\s*receiving\.providerWebhookId,?\s*\)/)
    expect(ROUTE).toMatch(/beginFundEmailReceivingDisconnect\([\s\S]*expectedUpdatedAt: status\.updatedAt/)
    expect(ROUTE).toMatch(/finalizeFundEmailReceivingDisconnect\([\s\S]*expectedUpdatedAt: disconnectRevision/)
    expect(ROUTE).toMatch(/inbound_email_provider:\s*null/)
    expect(ROUTE).toMatch(/eq\('inbound_email_provider',\s*'resend'\)/)
    expect(ROUTE).toMatch(/connection_conflict/)
  })

  it('rate limits provider management actions by Fund, user, and action', () => {
    expect(ROUTE).toMatch(/rateLimit\(/)
    expect(ROUTE).toMatch(/fund-email-settings:\$\{fundId\}:\$\{userId\}:\$\{action\}/)
    expect(ROUTE).toMatch(/databaseFailure:\s*'deny'/)
  })

  it('atomically resolves one Fund DEK for every encrypted setting in the request', () => {
    expect(SETTINGS_ROUTE).toMatch(/createFundDekResolver\(/)
    expect(SETTINGS_ROUTE).toMatch(/claudeApiKey[\s\S]*await resolveFundDek!\(\)/)
    expect(SETTINGS_ROUTE).toMatch(/resendApiKey[\s\S]*await resolveFundDek!\(\)/)
    expect(SETTINGS_ROUTE).not.toMatch(/settingsUpdates\.encryption_key_encrypted\s*=/)
  })
})
