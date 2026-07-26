/* eslint-disable @typescript-eslint/no-explicit-any -- focused in-memory credential store */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decrypt, encrypt } from '@/lib/crypto'
import {
  credentialAssociatedData,
  getFundEmailConnectionStatus,
  loadFundEmailReceivingConfiguration,
  loadReadyFundEmailSendingConnection,
  saveFundEmailReceivingConfiguration,
  saveFundEmailSendingConfiguration,
} from './fund-credentials'

const KEK = '31'.repeat(32)
const DEK = '32'.repeat(32)

function stagedStore() {
  let connection: any = null
  const security = {
    emailSubdomain: null as string | null,
    encryptionKeyEncrypted: encrypt(DEK, KEK),
  }
  const common = {
    id: 'connection-1', fundId: 'fund-1', domain: 'cci.fundworkspace.com',
    status: 'enabled', domainStatus: 'pending', sendingStatus: 'pending', receivingStatus: 'pending',
    lastVerifiedAt: null, lastErrorCode: null, createdAt: '2026-07-26T00:00:00Z',
    updatedAt: '2026-07-26T00:00:00Z', previousRouteTokenHash: null,
    previousRouteExpiresAt: null, sendingApiKeyEncrypted: null, receivingApiKeyEncrypted: null,
    webhookSecretEncrypted: null, routeTokenHash: null, providerWebhookId: null,
  }
  const store: any = {
    getFundSecurityState: vi.fn(async () => security),
    compareAndSetFundDek: vi.fn(async () => security.encryptionKeyEncrypted),
    getConnectionByFundId: vi.fn(async () => connection),
    getConnectionByRouteHash: vi.fn(async (hash: string) => connection?.routeTokenHash === hash ? connection : null),
    configureSending: vi.fn(async (input: any) => {
      security.emailSubdomain = input.slug
      connection = { ...common, ...connection, ...input }
    }),
    configureReceiving: vi.fn(async (input: any) => {
      security.emailSubdomain = input.slug
      connection = { ...common, ...connection, ...input }
    }),
    ensureReservedMailboxes: vi.fn(async () => undefined),
  }
  return {
    store,
    get connection() { return connection },
    markSendingVerified() {
      connection = { ...connection, domainStatus: 'verified', sendingStatus: 'verified' }
    },
  }
}

describe('staged Fund Resend credentials', () => {
  afterEach(() => {
    delete process.env.ENCRYPTION_KEY
    delete process.env.FUND_EMAIL_BASE_DOMAIN
  })

  it('persists and loads a sending key without any inbound secret', async () => {
    process.env.ENCRYPTION_KEY = KEK
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    const fixture = stagedStore()

    await saveFundEmailSendingConfiguration({} as never, {
      fundId: 'fund-1', actorUserId: 'user-1', slug: 'cci', sendingApiKey: 're_send_only',
    }, { store: fixture.store })

    expect(fixture.connection.sendingApiKeyEncrypted).not.toContain('re_send_only')
    expect(fixture.connection.receivingApiKeyEncrypted).toBeNull()
    expect(fixture.connection.webhookSecretEncrypted).toBeNull()
    expect(decrypt(
      fixture.connection.sendingApiKeyEncrypted.slice(3),
      DEK,
      credentialAssociatedData('fund-1', 'sending_api_key'),
    )).toBe('re_send_only')
    await expect(loadReadyFundEmailSendingConnection({} as never, 'fund-1', { store: fixture.store }))
      .resolves.toBeNull()
    fixture.markSendingVerified()
    await expect(loadReadyFundEmailSendingConnection({} as never, 'fund-1', { store: fixture.store }))
      .resolves.toMatchObject({ sendingApiKey: 're_send_only', domain: 'cci.fundworkspace.com' })
    expect(await getFundEmailConnectionStatus({} as never, 'fund-1', { store: fixture.store }))
      .toMatchObject({ configured: true, sendingConfigured: true, receivingConfigured: false, webhookConfigured: false })
  })

  it('persists managed receiving material without a sending key and resolves it independently', async () => {
    process.env.ENCRYPTION_KEY = KEK
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    const fixture = stagedStore()
    await saveFundEmailReceivingConfiguration({} as never, {
      fundId: 'fund-1', actorUserId: 'user-1', slug: 'cci', receivingApiKey: 're_full',
      webhookSecret: 'whsec_auto', routeToken: 'T'.repeat(43), providerWebhookId: 'wh_123',
      expectedProviderWebhookId: null,
      expectedUpdatedAt: null,
      inspection: {
        providerDomainId: 'domain-1', domainStatus: 'verified', sendingStatus: 'pending',
        receivingStatus: 'verified', dnsRecords: [], lastErrorCode: null,
      },
    }, { store: fixture.store })

    expect(fixture.connection.sendingApiKeyEncrypted).toBeNull()
    expect(fixture.connection.providerWebhookId).toBe('wh_123')
    await expect(loadFundEmailReceivingConfiguration({} as never, 'fund-1', { store: fixture.store }))
      .resolves.toMatchObject({
        receivingApiKey: 're_full', webhookSecret: 'whsec_auto', providerWebhookId: 'wh_123',
      })
    expect(await getFundEmailConnectionStatus({} as never, 'fund-1', { store: fixture.store }))
      .toMatchObject({ configured: true, sendingConfigured: false, receivingConfigured: true, webhookConfigured: true })
  })
})
