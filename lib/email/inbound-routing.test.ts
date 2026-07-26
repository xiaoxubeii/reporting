import { describe, expect, it, vi } from 'vitest'
import {
  routeFundInboundEmail,
  type FundEmailInboundRoutingStore,
} from './inbound-routing'
import type { RetrievedResendInboundEmail } from './resend-inbound'

const fundId = '11111111-1111-4111-8111-111111111111'
const threadA = {
  threadId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  mailboxId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  purpose: 'pitch' as const,
}
const threadB = {
  threadId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  mailboxId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  purpose: 'general' as const,
}
const pitchMailbox = {
  mailboxId: threadA.mailboxId,
  localPart: 'pitch',
  purpose: 'pitch' as const,
}

function email(overrides: Partial<RetrievedResendInboundEmail> = {}): RetrievedResendInboundEmail {
  return {
    providerEmailId: 'provider-email-1',
    internetMessageId: '<incoming@example.com>',
    from: 'Founder <founder@example.com>',
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
    ...overrides,
  }
}

function store(overrides: Partial<FundEmailInboundRoutingStore> = {}): FundEmailInboundRoutingStore {
  return {
    findReplyRoute: vi.fn().mockResolvedValue(null),
    findThreadByInternetMessageIds: vi.fn().mockResolvedValue([]),
    findMailboxesByLocalParts: vi.fn().mockResolvedValue([pitchMailbox]),
    ...overrides,
  }
}

describe('routeFundInboundEmail', () => {
  it('routes by a valid opaque reply token before other non-conflicting hints', async () => {
    const routingStore = store({
      findReplyRoute: vi.fn().mockResolvedValue(threadA),
      findThreadByInternetMessageIds: vi.fn().mockResolvedValue([threadA]),
      findMailboxesByLocalParts: vi.fn().mockResolvedValue([]),
    })

    const result = await routeFundInboundEmail({
      fundId,
      domain: 'cci.fundworkspace.com',
      email: email({
        to: ['r_0123456789abcdef0123456789abcdef01234567@cci.fundworkspace.com'],
        inReplyTo: '<outbound@example.com>',
      }),
      store: routingStore,
    })

    expect(result).toEqual({ disposition: 'routed', source: 'reply_token', ...threadA })
    expect(routingStore.findReplyRoute).toHaveBeenCalledWith(
      fundId,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    )
    expect(routingStore.findMailboxesByLocalParts).not.toHaveBeenCalled()
  })

  it('never falls back when an opaque reply token is unknown', async () => {
    const routingStore = store({
      findThreadByInternetMessageIds: vi.fn().mockResolvedValue([threadA]),
    })

    const result = await routeFundInboundEmail({
      fundId,
      domain: 'cci.fundworkspace.com',
      email: email({
        to: ['r_0123456789abcdef0123456789abcdef01234567@cci.fundworkspace.com'],
        inReplyTo: '<outbound@example.com>',
      }),
      store: routingStore,
    })

    expect(result).toEqual({ disposition: 'quarantined', reason: 'unknown_reply_token' })
    expect(routingStore.findThreadByInternetMessageIds).not.toHaveBeenCalled()
  })

  it('quarantines conflicting reply-token and RFC thread identity', async () => {
    const result = await routeFundInboundEmail({
      fundId,
      domain: 'cci.fundworkspace.com',
      email: email({
        to: ['r_0123456789abcdef0123456789abcdef01234567@cci.fundworkspace.com'],
        references: ['<prior@example.com>'],
      }),
      store: store({
        findReplyRoute: vi.fn().mockResolvedValue(threadA),
        findThreadByInternetMessageIds: vi.fn().mockResolvedValue([threadB]),
        findMailboxesByLocalParts: vi.fn().mockResolvedValue([]),
      }),
    })

    expect(result).toEqual({ disposition: 'quarantined', reason: 'routing_identity_conflict' })
  })

  it('routes by an unambiguous RFC In-Reply-To or References match', async () => {
    const result = await routeFundInboundEmail({
      fundId,
      domain: 'cci.fundworkspace.com',
      email: email({
        to: ['unknown@cci.fundworkspace.com'],
        inReplyTo: '<outbound@example.com>',
        references: ['<older@example.com>'],
      }),
      store: store({
        findThreadByInternetMessageIds: vi.fn().mockResolvedValue([threadA, threadA]),
        findMailboxesByLocalParts: vi.fn().mockResolvedValue([]),
      }),
    })

    expect(result).toEqual({ disposition: 'routed', source: 'rfc_headers', ...threadA })
  })

  it('routes a new message only through one exact active mailbox', async () => {
    const result = await routeFundInboundEmail({
      fundId,
      domain: 'cci.fundworkspace.com',
      email: email(),
      store: store(),
    })

    expect(result).toEqual({
      disposition: 'routed',
      source: 'mailbox',
      threadId: null,
      ...pitchMailbox,
    })
  })

  it('quarantines multiple conflicting mailboxes and leaves unknown addresses unroutable', async () => {
    const conflictingStore = store({
      findMailboxesByLocalParts: vi.fn().mockResolvedValue([
        pitchMailbox,
        { mailboxId: threadB.mailboxId, localPart: 'alice', purpose: 'general' },
      ]),
    })
    const conflict = await routeFundInboundEmail({
      fundId,
      domain: 'cci.fundworkspace.com',
      email: email({ to: ['pitch@cci.fundworkspace.com', 'alice@cci.fundworkspace.com'] }),
      store: conflictingStore,
    })
    expect(conflict).toEqual({ disposition: 'quarantined', reason: 'multiple_mailboxes' })

    const unknown = await routeFundInboundEmail({
      fundId,
      domain: 'cci.fundworkspace.com',
      email: email({ to: ['nobody@cci.fundworkspace.com'] }),
      store: store({ findMailboxesByLocalParts: vi.fn().mockResolvedValue([]) }),
    })
    expect(unknown).toEqual({ disposition: 'unroutable', reason: 'mailbox_not_found' })
  })

  it('ignores recipients outside the exact Fund domain', async () => {
    const result = await routeFundInboundEmail({
      fundId,
      domain: 'cci.fundworkspace.com',
      email: email({ to: ['pitch@evil.example'] }),
      store: store(),
    })

    expect(result).toEqual({ disposition: 'unroutable', reason: 'fund_recipient_not_found' })
  })
})
