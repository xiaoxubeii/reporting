import { describe, expect, it, vi } from 'vitest'
import { handleResendInboundWebhook, type ResendWebhookDependencies } from './resend-webhook'
import { FundEmailInboundError } from './resend-inbound'

const connection = {
  id: 'connection-1',
  fundId: 'fund-1',
  domain: 'cci.fundworkspace.com',
  sendingApiKey: 're_send',
  receivingApiKey: 're_receive',
  webhookSecret: 'whsec_secret',
}
const event = {
  type: 'email.received',
  created_at: '2026-07-26T00:00:00.000Z',
  data: {
    email_id: 'email-1',
    created_at: '2026-07-26T00:00:00.000Z',
    from: 'founder@example.com',
    to: ['pitch@cci.fundworkspace.com'],
    cc: [],
    bcc: [],
    message_id: '<incoming@example.com>',
    subject: 'Pitch',
    attachments: [],
  },
}
const retrieved = {
  providerEmailId: 'email-1',
  internetMessageId: '<incoming@example.com>',
  from: 'founder@example.com',
  to: ['pitch@cci.fundworkspace.com'],
  cc: [],
  bcc: [],
  replyTo: [],
  subject: 'Pitch',
  text: 'Hello',
  htmlUntrusted: null,
  inReplyTo: null,
  references: [],
  receivedAt: '2026-07-26T00:00:00.000Z',
  attachments: [],
  quarantineReason: null,
}
const routed = {
  disposition: 'routed' as const,
  source: 'mailbox' as const,
  threadId: null,
  mailboxId: 'mailbox-1',
  localPart: 'pitch',
  purpose: 'pitch' as const,
}

function request(body = '{"signed":true}', headers: Record<string, string> = {}): Request {
  return new Request('https://app.example/api/inbound-email/resend/route-token', {
    method: 'POST',
    body,
    headers: {
      'svix-id': 'svix-1',
      'svix-timestamp': '1785024000',
      'svix-signature': 'v1,signature',
      ...headers,
    },
  })
}

function dependencies(overrides: Partial<ResendWebhookDependencies> = {}): ResendWebhookDependencies {
  return {
    resolveConnection: vi.fn().mockResolvedValue(connection),
    verify: vi.fn().mockReturnValue(event),
    claim: vi.fn().mockResolvedValue({ id: 'event-1', attemptId: 'attempt-1' }),
    retrieve: vi.fn().mockResolvedValue(retrieved),
    route: vi.fn().mockResolvedValue(routed),
    materializeAttachments: vi.fn().mockImplementation(async (_connection, email, routing) => ({
      email,
      routing,
    })),
    persist: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('handleResendInboundWebhook', () => {
  it('resolves the Fund only from the high-entropy route token before signature verification', async () => {
    const deps = dependencies({ resolveConnection: vi.fn().mockResolvedValue(null) })

    const result = await handleResendInboundWebhook(request(), 'unknown-route-token', deps)

    expect(result).toEqual({ status: 404, body: { ok: false, error: 'route_not_found' } })
    expect(deps.resolveConnection).toHaveBeenCalledWith('unknown-route-token')
    expect(deps.verify).not.toHaveBeenCalled()
    expect(deps.claim).not.toHaveBeenCalled()
  })

  it('verifies the untouched raw body with all three Svix headers before claiming', async () => {
    const calls: string[] = []
    const deps = dependencies({
      verify: vi.fn((raw, headers, secret) => {
        calls.push('verify')
        expect(raw).toBe('{"signed":true}')
        expect(headers).toEqual({
          id: 'svix-1',
          timestamp: '1785024000',
          signature: 'v1,signature',
        })
        expect(secret).toBe('whsec_secret')
        return event
      }),
      claim: vi.fn(async () => {
        calls.push('claim')
        return { id: 'event-1', attemptId: 'attempt-1' }
      }),
    })

    const result = await handleResendInboundWebhook(request(), 'route-token', deps)

    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(calls).toEqual(['verify', 'claim'])
    expect(deps.claim).toHaveBeenCalledWith({
      routeToken: 'route-token',
      svixId: 'svix-1',
      providerEmailId: 'email-1',
    })
    expect(deps.persist).toHaveBeenCalledWith(connection, retrieved, routed)
    expect(deps.complete).toHaveBeenCalledWith('event-1', 'attempt-1', 'routed')
  })

  it('finishes recipient routing before attachment persistence and message persistence', async () => {
    const calls: string[] = []
    const deps = dependencies({
      retrieve: vi.fn(async () => {
        calls.push('retrieve')
        return retrieved
      }),
      route: vi.fn(async () => {
        calls.push('route')
        return routed
      }),
      materializeAttachments: vi.fn(async (_connection, email, routing) => {
        calls.push('materialize-attachments')
        return { email, routing }
      }),
      persist: vi.fn(async () => {
        calls.push('persist-message')
      }),
    })

    const result = await handleResendInboundWebhook(request(), 'route-token', deps)

    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(calls).toEqual([
      'retrieve',
      'route',
      'materialize-attachments',
      'persist-message',
    ])
  })

  it('rejects missing headers, invalid signatures, and oversized raw bodies before claim', async () => {
    const missingDeps = dependencies()
    const missing = await handleResendInboundWebhook(
      request('{}', { 'svix-signature': '' }),
      'route-token',
      missingDeps,
    )
    expect(missing.status).toBe(400)
    expect(missingDeps.verify).not.toHaveBeenCalled()
    expect(missingDeps.claim).not.toHaveBeenCalled()

    const invalidDeps = dependencies({ verify: vi.fn(() => { throw new Error('secret detail') }) })
    const invalid = await handleResendInboundWebhook(request(), 'route-token', invalidDeps)
    expect(invalid).toEqual({ status: 401, body: { ok: false, error: 'invalid_signature' } })
    expect(invalidDeps.claim).not.toHaveBeenCalled()

    const oversizedDeps = dependencies()
    const oversized = await handleResendInboundWebhook(
      request('x'.repeat(256 * 1024 + 1)),
      'route-token',
      oversizedDeps,
    )
    expect(oversized.status).toBe(413)
    expect(oversizedDeps.verify).not.toHaveBeenCalled()
  })

  it('does no provider retrieval for an already claimed event', async () => {
    const deps = dependencies({ claim: vi.fn().mockResolvedValue(null) })

    const result = await handleResendInboundWebhook(request(), 'route-token', deps)

    expect(result).toEqual({ status: 200, body: { ok: true, duplicate: true } })
    expect(deps.retrieve).not.toHaveBeenCalled()
  })

  it('marks retryable retrieval failures and returns a retryable HTTP status', async () => {
    const deps = dependencies({
      retrieve: vi.fn().mockRejectedValue(new FundEmailInboundError(
        'inbound_provider_unavailable',
        'secret provider detail',
        true,
      )),
    })

    const result = await handleResendInboundWebhook(request(), 'route-token', deps)

    expect(result).toEqual({ status: 503, body: { ok: false, error: 'temporarily_unavailable' } })
    expect(deps.fail).toHaveBeenCalledWith(
      'event-1',
      'attempt-1',
      'inbound_provider_unavailable',
    )
    expect(deps.complete).not.toHaveBeenCalled()
  })

  it('completes permanent identity failures as quarantined without persisting content', async () => {
    const deps = dependencies({
      retrieve: vi.fn().mockRejectedValue(new FundEmailInboundError(
        'inbound_identity_mismatch',
        'identity detail',
        false,
      )),
    })

    const result = await handleResendInboundWebhook(request(), 'route-token', deps)

    expect(result).toEqual({ status: 200, body: { ok: true, quarantined: true } })
    expect(deps.complete).toHaveBeenCalledWith('event-1', 'attempt-1', 'quarantined')
    expect(deps.persist).not.toHaveBeenCalled()
  })

  it('verifies unsupported event types before ignoring them', async () => {
    const deps = dependencies({
      verify: vi.fn().mockReturnValue({ ...event, type: 'email.delivered' }),
    })

    const result = await handleResendInboundWebhook(request(), 'route-token', deps)

    expect(result).toEqual({ status: 200, body: { ok: true, ignored: true } })
    expect(deps.verify).toHaveBeenCalledOnce()
    expect(deps.claim).not.toHaveBeenCalled()
  })
})
