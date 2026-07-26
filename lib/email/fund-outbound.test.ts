import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FundEmailConnection } from './fund-credentials'
import type { FundEmailMailbox } from './mailboxes'
import {
  createSupabaseFundEmailOutboundStore,
  fundInternetMessageId,
  loadFundEmailOutboundProviderConnection,
  sendFundThreadEmail,
  type FundEmailOutboundStore,
  type PreparedFundOutboundMessage,
} from './fund-outbound'

const LEGACY_TEST_KEY = ['resend', 'legacy', 'fixture'].join('-')
const AUTHORITATIVE_TEST_KEY = ['resend', 'settings', 'fixture'].join('-')

const CONNECTION: FundEmailConnection = {
  id: 'connection-1',
  fundId: 'fund-1',
  domain: 'cci.fundworkspace.com',
  sendingApiKey: LEGACY_TEST_KEY,
  sendingApiKeyEncrypted: 'v1:legacy-ciphertext',
  receivingApiKey: 're_fund_receiving',
  webhookSecret: 'whsec_fund',
}

const MAILBOX: FundEmailMailbox = {
  id: 'mailbox-1',
  fundId: 'fund-1',
  localPart: 'alice',
  displayName: 'Alice',
  kind: 'user',
  userId: 'user-1',
  active: true,
}

function memoryStore(options: { priorInternetMessageIds?: string[] } = {}): FundEmailOutboundStore & {
  state: { prepared: Map<string, PreparedFundOutboundMessage>; inputs: unknown[]; failed: string[] }
} {
  const state = {
    prepared: new Map<string, PreparedFundOutboundMessage>(),
    inputs: [] as unknown[],
    failed: [] as string[],
  }
  return {
    state,
    async prepare(input) {
      state.inputs = [...state.inputs, input]
      const current = state.prepared.get(input.idempotencyKey)
      if (current) return current
      const prepared: PreparedFundOutboundMessage = {
        threadId: 'thread-1',
        messageId: 'message-1',
        internetMessageId: input.internetMessageId,
        idempotencyKey: input.idempotencyKey,
        providerMessageId: null,
        priorInternetMessageIds: options.priorInternetMessageIds ?? [],
      }
      state.prepared = new Map(state.prepared).set(input.idempotencyKey, prepared)
      return prepared
    },
    async markSubmitted(input) {
      const current = Array.from(state.prepared.values()).find(row => row.messageId === input.messageId)
      if (!current) throw new Error('missing prepared message')
      state.prepared = new Map(state.prepared).set(current.idempotencyKey, {
        ...current,
        providerMessageId: input.providerMessageId,
      })
    },
    async markFailed(input) {
      state.failed = [...state.failed, input.messageId]
    },
  }
}

function dependencies(store: FundEmailOutboundStore, send = vi.fn().mockResolvedValue({ id: 'provider-1' })) {
  return {
    store,
    send,
    loadConnection: vi.fn().mockResolvedValue(CONNECTION),
    resolveMailbox: vi.fn().mockResolvedValue(MAILBOX),
    replyTokenSecret: '44'.repeat(32),
  }
}

describe('Fund Resend thread outbound', () => {
  afterEach(() => {
    delete process.env.RESEND_API_KEY
  })

  it('uses the existing fund_settings Resend provider key as the authoritative outbound credential', async () => {
    const legacyConnection = vi.fn()
    const result = await loadFundEmailOutboundProviderConnection({} as never, 'fund-1', {
      loadIdentity: vi.fn().mockResolvedValue({
        id: 'connection-1', fundId: 'fund-1', domain: 'cci.fundworkspace.com',
      }),
      loadProviderConfig: vi.fn().mockResolvedValue({
        provider: 'resend', apiKey: AUTHORITATIVE_TEST_KEY,
      }),
      loadLegacyConnection: legacyConnection,
    })

    expect(result).toEqual({
      id: 'connection-1', fundId: 'fund-1', domain: 'cci.fundworkspace.com',
      sendingApiKey: AUTHORITATIVE_TEST_KEY,
    })
    expect(legacyConnection).not.toHaveBeenCalled()
  })

  it('does not use a legacy Resend key when another existing outbound provider is selected', async () => {
    const legacyConnection = vi.fn().mockResolvedValue(CONNECTION)
    await expect(loadFundEmailOutboundProviderConnection({} as never, 'fund-1', {
      loadIdentity: vi.fn().mockResolvedValue({
        id: 'connection-1', fundId: 'fund-1', domain: 'cci.fundworkspace.com',
      }),
      loadProviderConfig: vi.fn().mockResolvedValue({
        provider: 'postmark', serverToken: 'pm_token',
      }),
      loadLegacyConnection: legacyConnection,
    })).resolves.toBeNull()
    expect(legacyConnection).not.toHaveBeenCalled()
  })

  it('does not reactivate a legacy Resend key when no outbound provider is selected', async () => {
    const legacyConnection = vi.fn().mockResolvedValue(CONNECTION)
    await expect(loadFundEmailOutboundProviderConnection({} as never, 'fund-1', {
      loadProviderConfig: vi.fn().mockResolvedValue(null),
      loadSelectedProvider: vi.fn().mockResolvedValue(null),
      loadLegacyConnection: legacyConnection,
    })).resolves.toBeNull()
    expect(legacyConnection).not.toHaveBeenCalled()
  })

  it('promotes a legacy sending key only when Resend is explicitly selected', async () => {
    const legacyConnection = vi.fn().mockResolvedValue(CONNECTION)
    const promoteLegacyKey = vi.fn().mockResolvedValue(true)

    await expect(loadFundEmailOutboundProviderConnection({} as never, 'fund-1', {
      loadProviderConfig: vi.fn().mockResolvedValue(null),
      loadSelectedProvider: vi.fn().mockResolvedValue('resend'),
      loadLegacyConnection: legacyConnection,
      promoteLegacyKey,
    })).resolves.toEqual(CONNECTION)

    expect(legacyConnection).toHaveBeenCalledOnce()
    expect(promoteLegacyKey).toHaveBeenCalledWith(
      expect.anything(),
      'fund-1',
      LEGACY_TEST_KEY,
      'v1:legacy-ciphertext',
    )
  })

  it('fails closed when a legacy key cannot be promoted atomically', async () => {
    const legacyConnection = vi.fn().mockResolvedValue(CONNECTION)

    await expect(loadFundEmailOutboundProviderConnection({} as never, 'fund-1', {
      loadProviderConfig: vi.fn().mockResolvedValue(null),
      loadSelectedProvider: vi.fn().mockResolvedValue('resend'),
      loadLegacyConnection: legacyConnection,
      promoteLegacyKey: vi.fn().mockResolvedValue(false),
    })).resolves.toBeNull()
  })

  it('persists the thread, outbox message, and only a reply-token hash before provider submission', async () => {
    const store = memoryStore()
    const send = vi.fn().mockImplementation(async () => {
      expect(store.state.inputs).toHaveLength(1)
      return { id: 'provider-1' }
    })

    const result = await sendFundThreadEmail({} as never, {
      fundId: 'fund-1',
      actorUserId: 'user-1',
      operationId: 'expert-invitation:request-1:issue-1',
      fallbackMailbox: 'expert',
      purpose: 'expert_invitation',
      contextType: 'diligence_expert_request',
      contextId: '11111111-1111-4111-8111-111111111111',
      to: 'expert@example.test',
      subject: 'Expert question',
      html: '<p>Hello</p>',
      text: 'Hello',
    }, dependencies(store, send))

    expect(result).toMatchObject({
      id: 'provider-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      reused: false,
    })
    expect(send).toHaveBeenCalledWith(
      { provider: 'resend', apiKey: LEGACY_TEST_KEY },
      expect.objectContaining({
        from: 'Alice <alice@cci.fundworkspace.com>',
        to: 'expert@example.test',
        replyTo: expect.stringMatching(/^r_[a-f0-9]{40}@cci\.fundworkspace\.com$/),
        headers: {
          'Message-ID': expect.stringMatching(/^<fw\.[a-f0-9]{48}@cci\.fundworkspace\.com>$/),
        },
        idempotencyKey: expect.stringMatching(/^fund-email:[a-f0-9]{48}$/),
        tags: expect.arrayContaining([{ name: 'scope', value: 'fund-mail' }]),
      }),
    )
    const persisted = JSON.stringify(store.state.inputs)
    const replyTo = send.mock.calls[0][1].replyTo as string
    const rawToken = replyTo.slice(2, replyTo.indexOf('@'))
    expect(persisted).not.toContain(rawToken)
    expect(persisted).not.toContain(replyTo)
    expect(persisted).toContain('replyTokenHash')
  })

  it('retries one persisted outbox message with the same Reply-To and provider idempotency key', async () => {
    const store = memoryStore()
    const send = vi.fn()
      .mockRejectedValueOnce(new Error('ambiguous provider timeout with sensitive details'))
      .mockResolvedValueOnce({ id: 'provider-1' })
    const deps = dependencies(store, send)
    const params = {
      fundId: 'fund-1', actorUserId: 'user-1',
      operationId: 'expert-invitation:request-1:issue-1',
      fallbackMailbox: 'expert' as const,
      purpose: 'expert_invitation' as const,
      contextType: 'diligence_expert_request' as const,
      contextId: '11111111-1111-4111-8111-111111111111',
      to: 'expert@example.test', subject: 'Expert question', html: '<p>Hello</p>',
    }

    await expect(sendFundThreadEmail({} as never, params, deps)).rejects.toThrow('Fund email delivery failed')
    const retry = await sendFundThreadEmail({} as never, params, deps)

    expect(store.state.inputs).toHaveLength(2)
    expect(store.state.failed).toEqual(['message-1'])
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][1].replyTo).toBe(send.mock.calls[0][1].replyTo)
    expect(send.mock.calls[1][1].idempotencyKey).toBe(send.mock.calls[0][1].idempotencyKey)
    expect(retry).toMatchObject({ id: 'provider-1', threadId: 'thread-1', messageId: 'message-1' })
  })

  it('does not submit again after the durable message already has a provider ID', async () => {
    const store = memoryStore()
    const send = vi.fn().mockResolvedValue({ id: 'provider-1' })
    const deps = dependencies(store, send)
    const params = {
      fundId: 'fund-1', actorUserId: 'user-1', operationId: 'operation-1',
      fallbackMailbox: 'expert' as const, purpose: 'expert_invitation' as const,
      contextType: 'diligence_expert_request' as const,
      contextId: '11111111-1111-4111-8111-111111111111',
      to: 'expert@example.test', subject: 'Question', html: '<p>Hello</p>',
    }

    await sendFundThreadEmail({} as never, params, deps)
    const retry = await sendFundThreadEmail({} as never, params, deps)

    expect(send).toHaveBeenCalledTimes(1)
    expect(retry).toMatchObject({ id: 'provider-1', reused: true })
  })

  it('adds same-thread RFC reply headers without accepting caller supplied routing headers', async () => {
    const store = memoryStore({
      priorInternetMessageIds: ['<first@example.test>', '<latest@example.test>'],
    })
    const send = vi.fn().mockResolvedValue({ id: 'provider-2' })

    await sendFundThreadEmail({} as never, {
      fundId: 'fund-1', actorUserId: 'user-1', operationId: 'operation-2',
      fallbackMailbox: 'expert', purpose: 'expert_invitation',
      contextType: 'diligence_expert_request',
      contextId: '11111111-1111-4111-8111-111111111111',
      to: 'expert@example.test', subject: 'Re: Question', html: '<p>Follow-up</p>',
    }, dependencies(store, send))

    expect(send.mock.calls[0][1].headers).toEqual({
      'Message-ID': expect.stringMatching(/^<fw\.[a-f0-9]{48}@cci\.fundworkspace\.com>$/),
      'In-Reply-To': '<latest@example.test>',
      References: '<first@example.test> <latest@example.test>',
    })
  })

  it('derives one stable Fund-domain Message-ID for provider retries', () => {
    const idempotencyKey = 'fund-email:' + 'a'.repeat(48)
    const first = fundInternetMessageId('fund-1', idempotencyKey, 'cci.fundworkspace.com')
    const retry = fundInternetMessageId('fund-1', idempotencyKey, 'cci.fundworkspace.com')

    expect(first).toBe(retry)
    expect(first).toMatch(/^<fw\.[a-f0-9]{48}@cci\.fundworkspace\.com>$/)
  })

  it('marks the durable message submitted and the connection sending capability verified atomically', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    const store = createSupabaseFundEmailOutboundStore({ rpc } as never)

    await store.markSubmitted({
      fundId: 'fund-1',
      connectionId: 'connection-1',
      messageId: 'message-1',
      providerMessageId: 'provider-1',
    })

    expect(rpc).toHaveBeenCalledWith('fund_email_mark_outbound_submitted', {
      p_fund_id: 'fund-1',
      p_connection_id: 'connection-1',
      p_message_id: 'message-1',
      p_provider_message_id: 'provider-1',
    })
  })

  it('fails closed when the Fund connection is unavailable and never uses the platform key', async () => {
    process.env.RESEND_API_KEY = 're_platform_must_not_be_used'
    const store = memoryStore()
    const send = vi.fn()
    const deps = {
      ...dependencies(store, send),
      loadConnection: vi.fn().mockResolvedValue(null),
    }

    await expect(sendFundThreadEmail({} as never, {
      fundId: 'fund-1', actorUserId: 'user-1', operationId: 'operation-3',
      fallbackMailbox: 'expert', purpose: 'expert_invitation',
      contextType: 'diligence_expert_request',
      contextId: '11111111-1111-4111-8111-111111111111',
      to: 'expert@example.test', subject: 'Question', html: '<p>Hello</p>',
    }, deps)).rejects.toMatchObject({ code: 'connection_not_found' })
    expect(send).not.toHaveBeenCalled()
  })
})
