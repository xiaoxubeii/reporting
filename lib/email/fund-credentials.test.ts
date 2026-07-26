/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory credential fixtures model encrypted database rows */
import { afterEach, describe, expect, it } from 'vitest'
import { decrypt, encrypt } from '@/lib/crypto'
import {
  credentialAssociatedData,
  deleteFundEmailConnection,
  getFundEmailConnectionStatus,
  generateFundEmailRouteToken,
  hashFundEmailRouteToken,
  loadFundEmailConnection,
  loadReadyFundEmailIdentity,
  loadReadyFundEmailSendingConnection,
  resolveVerifiedFundEmailReceivingConnectionByRouteToken,
  rotateFundEmailCredentials,
  rotateFundEmailWebhookRoute,
  resolveFundEmailConnectionByRouteToken,
  saveFundEmailConnection,
  saveFundEmailIdentity,
  type FundEmailCredentialStore,
} from './fund-credentials'

const KEK = '11'.repeat(32)
const DEK = '22'.repeat(32)

function memoryStore(): FundEmailCredentialStore & {
  state: {
    security: Map<string, { emailSubdomain: string | null; encryptionKeyEncrypted: string | null }>
    connections: Map<string, any>
    ensured: string[]
  }
} {
  const state: {
    security: Map<string, { emailSubdomain: string | null; encryptionKeyEncrypted: string | null }>
    connections: Map<string, any>
    ensured: string[]
  } = {
    security: new Map<string, { emailSubdomain: string | null; encryptionKeyEncrypted: string | null }>([
      ['fund-1', { emailSubdomain: null, encryptionKeyEncrypted: encrypt(DEK, KEK) }],
      ['fund-2', { emailSubdomain: null, encryptionKeyEncrypted: encrypt(DEK, KEK) }],
    ]),
    connections: new Map<string, any>(),
    ensured: [] as string[],
  }
  return {
    state,
    async getFundSecurityState(fundId) { return state.security.get(fundId) ?? null },
    async compareAndSetFundDek(fundId, envelope) {
      const current = state.security.get(fundId)
      if (!current) return null
      if (!current.encryptionKeyEncrypted) current.encryptionKeyEncrypted = envelope
      return current.encryptionKeyEncrypted
    },
    async setFundEmailSubdomain(fundId, slug) {
      const current = state.security.get(fundId)
      if (!current) throw new Error('missing fund')
      current.emailSubdomain = slug
    },
    async getConnectionByFundId(fundId) { return state.connections.get(fundId) ?? null },
    async getConnectionByRouteHash(hash) {
      return Array.from(state.connections.values()).find((row) => (
        row.routeTokenHash === hash
        || (
          row.previousRouteTokenHash === hash
          && row.previousRouteExpiresAt
          && new Date(row.previousRouteExpiresAt).getTime() > Date.now()
        )
      )) ?? null
    },
    async createConnection(row) {
      const security = state.security.get(row.fundId)
      if (!security) throw new Error('missing fund')
      if (security.emailSubdomain && security.emailSubdomain !== row.slug) throw new Error('slug conflict')
      if (state.connections.has(row.fundId)) throw new Error('connection exists')
      security.emailSubdomain = row.slug
      state.connections = new Map(state.connections).set(row.fundId, {
        id: `connection-${row.fundId}`,
        createdAt: '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z',
        lastVerifiedAt: null,
        lastErrorCode: null,
        status: 'enabled',
        domainStatus: 'pending',
        sendingStatus: 'pending',
        receivingStatus: 'pending',
        previousRouteTokenHash: null,
        previousRouteExpiresAt: null,
        providerWebhookId: null,
        ...row,
      })
      state.ensured = [...state.ensured, row.fundId]
    },
    async upsertConnection(row) {
      const existing = state.connections.get(row.fundId)
      state.connections.set(row.fundId, {
        id: existing?.id ?? `connection-${row.fundId}`,
        createdAt: existing?.createdAt ?? '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z',
        lastVerifiedAt: null,
        lastErrorCode: null,
        status: 'enabled',
        domainStatus: 'pending',
        sendingStatus: 'pending',
        receivingStatus: 'pending',
        ...existing,
        ...row,
      })
    },
    async configureIdentity(row) {
      const existing = state.connections.get(row.fundId)
      const security = state.security.get(row.fundId)
      if (!security) throw new Error('missing fund')
      security.emailSubdomain = row.slug
      state.connections = new Map(state.connections).set(row.fundId, {
        id: existing?.id ?? `connection-${row.fundId}`,
        fundId: row.fundId,
        domain: row.domain,
        createdAt: existing?.createdAt ?? '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z',
        lastVerifiedAt: existing?.lastVerifiedAt ?? null,
        lastErrorCode: existing?.lastErrorCode ?? null,
        status: 'enabled',
        domainStatus: existing?.domainStatus ?? 'pending',
        sendingStatus: existing?.sendingStatus ?? 'pending',
        receivingStatus: existing?.receivingStatus ?? 'pending',
        previousRouteTokenHash: existing?.previousRouteTokenHash ?? null,
        previousRouteExpiresAt: existing?.previousRouteExpiresAt ?? null,
        providerWebhookId: existing?.providerWebhookId ?? null,
        sendingApiKeyEncrypted: null,
        receivingApiKeyEncrypted: existing?.receivingApiKeyEncrypted ?? null,
        webhookSecretEncrypted: existing?.webhookSecretEncrypted ?? null,
        routeTokenHash: existing?.routeTokenHash ?? null,
      })
    },
    async configureSending(row) {
      const existing = state.connections.get(row.fundId)
      const security = state.security.get(row.fundId)
      if (!security) throw new Error('missing fund')
      security.emailSubdomain = row.slug
      state.connections = new Map(state.connections).set(row.fundId, {
        id: existing?.id ?? `connection-${row.fundId}`,
        createdAt: existing?.createdAt ?? '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z',
        lastVerifiedAt: null,
        lastErrorCode: null,
        status: 'enabled',
        domainStatus: 'pending',
        sendingStatus: 'pending',
        receivingStatus: existing?.receivingStatus ?? 'pending',
        previousRouteTokenHash: null,
        previousRouteExpiresAt: null,
        providerWebhookId: null,
        receivingApiKeyEncrypted: null,
        webhookSecretEncrypted: null,
        routeTokenHash: null,
        ...existing,
        ...row,
      })
    },
    async configureReceiving(row) {
      const existing = state.connections.get(row.fundId)
      const security = state.security.get(row.fundId)
      if (!security) throw new Error('missing fund')
      security.emailSubdomain = row.slug
      state.connections = new Map(state.connections).set(row.fundId, {
        id: existing?.id ?? `connection-${row.fundId}`,
        createdAt: existing?.createdAt ?? '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z',
        lastVerifiedAt: null,
        lastErrorCode: null,
        status: 'enabled',
        domainStatus: row.inspection.domainStatus,
        sendingStatus: row.inspection.sendingStatus,
        receivingStatus: row.inspection.receivingStatus,
        previousRouteTokenHash: null,
        previousRouteExpiresAt: null,
        sendingApiKeyEncrypted: null,
        ...existing,
        ...row,
      })
    },
    async updateSecrets(fundId, values) {
      const existing = state.connections.get(fundId)
      if (!existing) return false
      state.connections.set(fundId, { ...existing, ...values })
      return true
    },
    async updateRouteHash(fundId, routeTokenHash) {
      const existing = state.connections.get(fundId)
      if (!existing) return false
      state.connections = new Map(state.connections).set(fundId, {
        ...existing,
        previousRouteTokenHash: existing.routeTokenHash,
        previousRouteExpiresAt: '2099-01-01T00:00:00.000Z',
        routeTokenHash,
      })
      return true
    },
    async deleteConnection(fundId) { return state.connections.delete(fundId) },
    async ensureReservedMailboxes(fundId) { state.ensured.push(fundId) },
  }
}

describe('Fund Resend credentials', () => {
  afterEach(() => {
    delete process.env.ENCRYPTION_KEY
    delete process.env.FUND_EMAIL_BASE_DOMAIN
    delete process.env.RESEND_API_KEY
  })

  it('loads an outbound identity before inbound domain inspection is configured', async () => {
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    const store = memoryStore()
    await saveFundEmailIdentity(
      {} as never,
      { fundId: 'fund-1', actorUserId: 'user-1', slug: 'cci' },
      { store },
    )

    await expect(
      loadReadyFundEmailIdentity({} as never, 'fund-1', { store }),
    ).resolves.toEqual({
      id: 'connection-fund-1',
      fundId: 'fund-1',
      domain: 'cci.fundworkspace.com',
    })
  })

  it('encrypts separate Fund credentials with Fund- and purpose-bound AAD', async () => {
    process.env.ENCRYPTION_KEY = KEK
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    const store = memoryStore()
    const result = await saveFundEmailConnection({} as never, {
      fundId: 'fund-1',
      actorUserId: 'user-1',
      slug: 'cci',
      sendingApiKey: 're_sending',
      receivingApiKey: 're_receiving',
      webhookSecret: 'whsec_secret',
    }, { store, generateRouteToken: () => 'A'.repeat(43) })

    expect(result).toMatchObject({ domain: 'cci.fundworkspace.com', routeToken: 'A'.repeat(43) })
    expect(store.state.ensured).toEqual(['fund-1'])
    const row = store.state.connections.get('fund-1')
    expect(row.sendingApiKeyEncrypted).not.toContain('re_sending')
    expect(row.receivingApiKeyEncrypted).not.toContain('re_receiving')
    expect(row.webhookSecretEncrypted).not.toContain('whsec_secret')
    expect(decrypt(row.sendingApiKeyEncrypted.slice(3), DEK, credentialAssociatedData('fund-1', 'sending_api_key')))
      .toBe('re_sending')
    expect(() => decrypt(
      row.sendingApiKeyEncrypted.slice(3),
      DEK,
      credentialAssociatedData('fund-2', 'sending_api_key'),
    )).toThrow()
  })

  it('generates independent 32-byte URL-safe webhook routes and hashes them deterministically', () => {
    const first = generateFundEmailRouteToken()
    const second = generateFundEmailRouteToken()
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(second).not.toBe(first)
    expect(hashFundEmailRouteToken(first)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashFundEmailRouteToken(first)).toBe(hashFundEmailRouteToken(first))
  })

  it('loads only the selected Fund connection and never falls back to the platform key', async () => {
    process.env.ENCRYPTION_KEY = KEK
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    process.env.RESEND_API_KEY = 'platform-must-not-be-used'
    const store = memoryStore()
    await saveFundEmailConnection({} as never, {
      fundId: 'fund-1', actorUserId: 'user-1', slug: 'cci',
      sendingApiKey: 're_sending', receivingApiKey: 're_receiving', webhookSecret: 'whsec_secret',
    }, { store, generateRouteToken: () => 'B'.repeat(43) })

    await expect(loadFundEmailConnection({} as never, 'fund-1', { store })).resolves.toMatchObject({
      fundId: 'fund-1',
      domain: 'cci.fundworkspace.com',
      sendingApiKey: 're_sending',
      receivingApiKey: 're_receiving',
      webhookSecret: 'whsec_secret',
    })
    await expect(loadFundEmailConnection({} as never, 'fund-2', { store })).resolves.toBeNull()
  })

  it('allows one pending sending-key attempt after domain verification while inbound stays independently gated', async () => {
    process.env.ENCRYPTION_KEY = KEK
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    const store = memoryStore()
    const routeToken = 'V'.repeat(43)
    await saveFundEmailConnection({} as never, {
      fundId: 'fund-1', actorUserId: 'user-1', slug: 'cci',
      sendingApiKey: 're_sending', receivingApiKey: 're_receiving', webhookSecret: 'whsec_secret',
    }, { store, generateRouteToken: () => routeToken })

    await expect(loadReadyFundEmailSendingConnection({} as never, 'fund-1', { store }))
      .resolves.toBeNull()
    await expect(resolveVerifiedFundEmailReceivingConnectionByRouteToken(
      {} as never,
      routeToken,
      { store },
    )).resolves.toBeNull()

    const pending = store.state.connections.get('fund-1')
    store.state.connections = new Map(store.state.connections).set('fund-1', {
      ...pending,
      domainStatus: 'verified',
      sendingStatus: 'pending',
      receivingStatus: 'failed',
    })
    await expect(loadReadyFundEmailSendingConnection({} as never, 'fund-1', { store }))
      .resolves.toMatchObject({ sendingApiKey: 're_sending' })
    await expect(resolveVerifiedFundEmailReceivingConnectionByRouteToken(
      {} as never,
      routeToken,
      { store },
    )).resolves.toBeNull()

    store.state.connections = new Map(store.state.connections).set('fund-1', {
      ...store.state.connections.get('fund-1'),
      sendingStatus: 'failed',
    })
    await expect(loadReadyFundEmailSendingConnection({} as never, 'fund-1', { store }))
      .resolves.toBeNull()

    store.state.connections = new Map(store.state.connections).set('fund-1', {
      ...store.state.connections.get('fund-1'),
      sendingStatus: 'verified',
      receivingStatus: 'verified',
    })
    await expect(resolveVerifiedFundEmailReceivingConnectionByRouteToken(
      {} as never,
      routeToken,
      { store },
    )).resolves.toMatchObject({ receivingApiKey: 're_receiving' })
  })

  it('fails closed for missing KEK or ciphertext copied to another Fund', async () => {
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    const store = memoryStore()
    await expect(saveFundEmailConnection({} as never, {
      fundId: 'fund-1', actorUserId: 'user-1', slug: 'cci',
      sendingApiKey: 're_sending', receivingApiKey: 're_receiving', webhookSecret: 'whsec_secret',
    }, { store })).rejects.toMatchObject({ code: 'encryption_unavailable' })

    process.env.ENCRYPTION_KEY = KEK
    await saveFundEmailConnection({} as never, {
      fundId: 'fund-1', actorUserId: 'user-1', slug: 'cci',
      sendingApiKey: 're_sending', receivingApiKey: 're_receiving', webhookSecret: 'whsec_secret',
    }, { store, generateRouteToken: () => 'C'.repeat(43) })
    const copied = { ...store.state.connections.get('fund-1'), fundId: 'fund-2', domain: 'abc.fundworkspace.com' }
    store.state.connections.set('fund-2', copied)
    await expect(loadFundEmailConnection({} as never, 'fund-2', { store }))
      .rejects.toMatchObject({ code: 'credential_unavailable' })
  })

  it('returns only secret-free status and performs explicit rotations/removal', async () => {
    process.env.ENCRYPTION_KEY = KEK
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    const store = memoryStore()
    await saveFundEmailConnection({} as never, {
      fundId: 'fund-1', actorUserId: 'user-1', slug: 'cci',
      sendingApiKey: 're_old', receivingApiKey: 're_old_receive', webhookSecret: 'whsec_old',
    }, { store, generateRouteToken: () => 'D'.repeat(43) })

    const status = await getFundEmailConnectionStatus({} as never, 'fund-1', { store })
    expect(status).toMatchObject({ configured: true, sendingConfigured: true, receivingConfigured: true })
    expect(JSON.stringify(status)).not.toMatch(/re_old|whsec|encrypted|routeToken/i)

    await rotateFundEmailCredentials({} as never, {
      fundId: 'fund-1', actorUserId: 'user-1',
      sendingApiKey: 're_new', receivingApiKey: 're_new_receive', webhookSecret: 'whsec_new',
    }, { store })
    const oldRouteToken = 'D'.repeat(43)
    const route = await rotateFundEmailWebhookRoute({} as never, 'fund-1', 'user-1', {
      store,
      generateRouteToken: () => 'E'.repeat(43),
    })
    expect(route.routeToken).toBe('E'.repeat(43))
    await expect(resolveFundEmailConnectionByRouteToken({} as never, oldRouteToken, { store }))
      .resolves.toMatchObject({ fundId: 'fund-1' })
    await expect(resolveFundEmailConnectionByRouteToken({} as never, route.routeToken, { store }))
      .resolves.toMatchObject({ fundId: 'fund-1' })
    await expect(loadFundEmailConnection({} as never, 'fund-1', { store })).resolves.toMatchObject({
      sendingApiKey: 're_new', receivingApiKey: 're_new_receive', webhookSecret: 'whsec_new',
    })

    await expect(deleteFundEmailConnection({} as never, 'fund-1', { store })).resolves.toBe(true)
    await expect(loadFundEmailConnection({} as never, 'fund-1', { store })).resolves.toBeNull()
  })
})
