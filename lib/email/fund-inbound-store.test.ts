/* eslint-disable @typescript-eslint/no-explicit-any -- tests inject minimal Supabase RPC doubles */
import { describe, expect, it, vi } from 'vitest'
import {
  createSupabaseFundEmailInboundPersistence,
  createSupabaseFundEmailWebhookEventStore,
} from './fund-inbound-store'
import type { RetrievedResendInboundEmail } from './resend-inbound'

const email: RetrievedResendInboundEmail = {
  providerEmailId: 'email-1',
  internetMessageId: '<incoming@example.com>',
  from: 'Founder <founder@example.com>',
  to: ['pitch@cci.fundworkspace.com'],
  cc: ['observer@example.com'],
  bcc: [],
  replyTo: ['founder@example.com'],
  subject: 'Pitch',
  text: 'Hello',
  htmlUntrusted: '<p>Hello</p>',
  inReplyTo: '<outbound@example.com>',
  references: ['<older@example.com>'],
  receivedAt: '2026-07-26T00:00:00.000Z',
  attachments: [{
    id: 'attachment-1',
    filename: 'deck.pdf',
    size: 123,
    contentType: 'application/pdf',
    contentDisposition: 'attachment',
    contentId: null,
    storagePath: 'fund-email/fund-1/email-1/0_deck.pdf',
  }],
  quarantineReason: null,
}

describe('Supabase Fund inbound stores', () => {
  it('persists a routed email through the atomic RPC with metadata only', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ message_id: 'message-1', thread_id: 'thread-1', reused: false }],
      error: null,
    })
    const persist = createSupabaseFundEmailInboundPersistence({ rpc } as any)

    await expect(persist(
      {
        id: 'connection-1',
        fundId: 'fund-1',
        domain: 'cci.fundworkspace.com',
        receivingApiKey: 'receiving-secret',
        webhookSecret: 'webhook-secret',
      },
      email,
      {
        disposition: 'routed',
        source: 'rfc_headers',
        threadId: 'thread-1',
        mailboxId: 'mailbox-1',
        purpose: 'pitch',
      },
    )).resolves.toEqual({ messageId: 'message-1', threadId: 'thread-1', reused: false })

    expect(rpc).toHaveBeenCalledWith('fund_email_store_inbound_message', {
      p_fund_id: 'fund-1',
      p_mailbox_id: 'mailbox-1',
      p_thread_id: 'thread-1',
      p_purpose: 'pitch',
      p_provider_message_id: 'email-1',
      p_internet_message_id: '<incoming@example.com>',
      p_in_reply_to: '<outbound@example.com>',
      p_message_references: ['<older@example.com>'],
      p_from_address: 'Founder <founder@example.com>',
      p_to_addresses: ['pitch@cci.fundworkspace.com'],
      p_cc_addresses: ['observer@example.com'],
      p_bcc_addresses: [],
      p_reply_to_address: 'founder@example.com',
      p_subject: 'Pitch',
      p_text_body: 'Hello',
      p_html_body_untrusted: '<p>Hello</p>',
      p_attachment_metadata: [{
        id: 'attachment-1',
        filename: 'deck.pdf',
        size: 123,
        contentType: 'application/pdf',
        contentDisposition: 'attachment',
        contentId: null,
        storagePath: 'fund-email/fund-1/email-1/0_deck.pdf',
      }],
      p_received_at: '2026-07-26T00:00:00.000Z',
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('sending-secret')
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('receiving-secret')
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('webhook-secret')
  })

  it('does not create a message row for quarantined or unroutable content', async () => {
    const rpc = vi.fn()
    const persist = createSupabaseFundEmailInboundPersistence({ rpc } as any)

    await persist({ fundId: 'fund-1' } as any, email, {
      disposition: 'quarantined',
      reason: 'routing_identity_conflict',
    })
    await persist({ fundId: 'fund-1' } as any, email, {
      disposition: 'unroutable',
      reason: 'mailbox_not_found',
    })

    expect(rpc).not.toHaveBeenCalled()
  })

  it('claims and fences webhook event completion through service-only RPCs', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: { id: 'event-1', attempt_id: 'attempt-1' },
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
    const store = createSupabaseFundEmailWebhookEventStore({ rpc } as any)

    await expect(store.claim({
      routeToken: 'route-token',
      svixId: 'svix-1',
      providerEmailId: 'email-1',
    })).resolves.toEqual({ id: 'event-1', attemptId: 'attempt-1' })
    await expect(store.complete('event-1', 'attempt-1', 'routed')).resolves.toBe(true)
    await expect(store.fail('event-1', 'attempt-1', 'inbound_provider_unavailable')).resolves.toBe(true)

    expect(rpc.mock.calls[0][0]).toBe('fund_email_claim_webhook_event')
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_route_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_svix_id: 'svix-1',
      p_provider_email_id: 'email-1',
      p_lease_seconds: 900,
    })
  })
})
