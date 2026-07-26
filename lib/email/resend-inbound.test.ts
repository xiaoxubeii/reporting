import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FundEmailConnection } from './fund-credentials'

const receivingGet = vi.hoisted(() => vi.fn())
const attachmentsList = vi.hoisted(() => vi.fn())
const constructedWith = vi.hoisted(() => [] as Array<string | undefined>)

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      receiving: {
        get: receivingGet,
        attachments: { list: attachmentsList },
      },
    }
    constructor(key?: string) { constructedWith.push(key) }
  },
}))

import {
  materializeResendInboundAttachments,
  retrieveResendInboundEmail,
  type ResendReceivedEventData,
} from './resend-inbound'

const CONNECTION: FundEmailConnection = {
  id: 'connection-1',
  fundId: 'fund-1',
  domain: 'cci.fundworkspace.com',
  sendingApiKey: 're_sending',
  receivingApiKey: 're_receiving',
  webhookSecret: 'whsec_secret',
}

const EVENT: ResendReceivedEventData = {
  email_id: 'email-1',
  created_at: '2026-07-26T08:00:00.000Z',
  from: 'Founder <founder@example.test>',
  to: ['pitch@cci.fundworkspace.com'],
  cc: [],
  bcc: [],
  message_id: '<incoming-1@example.test>',
  subject: 'Cardio startup',
  attachments: [],
}

function fetched(overrides: Record<string, unknown> = {}) {
  return {
    object: 'email',
    id: 'email-1',
    to: ['pitch@cci.fundworkspace.com'],
    from: 'Founder <founder@example.test>',
    created_at: '2026-07-26T08:00:00.000Z',
    subject: 'Cardio startup',
    bcc: [],
    cc: [],
    reply_to: null,
    html: '<p>Pitch</p>',
    text: 'Pitch',
    headers: {
      'Message-ID': '<incoming-1@example.test>',
      'In-Reply-To': '<outbound-1@resend.test>',
      References: '<root@resend.test> <outbound-1@resend.test>',
    },
    message_id: '<incoming-1@example.test>',
    raw: null,
    attachments: [],
    ...overrides,
  }
}

describe('Resend inbound adapter', () => {
  beforeEach(() => {
    receivingGet.mockReset()
    attachmentsList.mockReset()
    constructedWith.length = 0
    receivingGet.mockResolvedValue({ data: fetched(), error: null })
    attachmentsList.mockResolvedValue({ data: { object: 'list', has_more: false, data: [] }, error: null })
  })

  it('uses the Fund receiving key, validates signed/fetched identity, and normalizes RFC headers', async () => {
    const result = await retrieveResendInboundEmail({} as never, CONNECTION, EVENT)

    expect(constructedWith).toEqual(['re_receiving'])
    expect(receivingGet).toHaveBeenCalledWith('email-1')
    expect(result).toMatchObject({
      providerEmailId: 'email-1',
      internetMessageId: '<incoming-1@example.test>',
      inReplyTo: '<outbound-1@resend.test>',
      references: ['<root@resend.test>', '<outbound-1@resend.test>'],
      to: ['pitch@cci.fundworkspace.com'],
      text: 'Pitch',
      htmlUntrusted: '<p>Pitch</p>',
      quarantineReason: null,
    })
  })

  it('rejects recipient, provider ID, sender, subject, or Message-ID disagreement before routing', async () => {
    for (const override of [
      { to: ['pitch@other.fundworkspace.com'] },
      { id: 'email-other' },
      { from: 'Attacker <attacker@example.test>' },
      { subject: 'Changed subject' },
      { message_id: '<different@example.test>' },
    ]) {
      receivingGet.mockResolvedValueOnce({ data: fetched(override), error: null })
      await expect(retrieveResendInboundEmail({} as never, CONNECTION, EVENT))
        .rejects.toMatchObject({ code: 'inbound_identity_mismatch', retryable: false })
    }
    expect(attachmentsList).not.toHaveBeenCalled()
  })

  it('rejects conflicting case-insensitive headers and bounded body violations', async () => {
    receivingGet.mockResolvedValueOnce({
      data: fetched({ headers: { 'Message-ID': '<a@test>', 'message-id': '<b@test>' } }),
      error: null,
    })
    await expect(retrieveResendInboundEmail({} as never, CONNECTION, EVENT))
      .rejects.toMatchObject({ code: 'inbound_header_invalid', retryable: false })

    receivingGet.mockResolvedValueOnce({ data: fetched({ text: 'x'.repeat(1024 * 1024 + 1) }), error: null })
    await expect(retrieveResendInboundEmail({} as never, CONNECTION, EVENT))
      .rejects.toMatchObject({ code: 'inbound_content_oversized', retryable: false })
  })

  it('routes the recipient before downloading or storing attachment bytes', async () => {
    const metadata = {
      id: 'attachment-1', filename: 'deck.pdf', size: 4,
      content_type: 'application/pdf', content_disposition: 'attachment', content_id: null,
    }
    const event = { ...EVENT, attachments: [metadata] }
    receivingGet.mockResolvedValue({ data: fetched({ attachments: [metadata] }), error: null })
    attachmentsList.mockResolvedValue({
      data: {
        object: 'list', has_more: false, data: [{
          ...metadata,
          object: 'attachment',
          download_url: 'https://inbound-cdn.resend.com/email-1/attachments/attachment-1?signature=signed',
          expires_at: '2099-01-01T00:00:00.000Z',
        }],
      },
      error: null,
    })
    const result = await retrieveResendInboundEmail({} as never, CONNECTION, event)

    expect(attachmentsList).not.toHaveBeenCalled()
    expect(result.attachments).toEqual([])
    expect(result.attachmentManifest).toHaveLength(1)

    const download = vi.fn().mockResolvedValue(Buffer.from('safe'))
    const scan = vi.fn().mockResolvedValue({ safe: true })
    const storeAttachment = vi.fn().mockResolvedValue(
      'fund-email-inbound-attachments/fund-1/mailbox-1/email-1/0_deck.pdf',
    )
    const materialized = await materializeResendInboundAttachments(
      {} as never,
      CONNECTION,
      result,
      {
        disposition: 'routed',
        source: 'mailbox',
        threadId: null,
        mailboxId: 'mailbox-1',
        localPart: 'pitch',
        purpose: 'pitch',
      },
      { download, scan, storeAttachment },
    )

    expect(attachmentsList).toHaveBeenCalledWith({ emailId: 'email-1' })
    expect(download).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/inbound-cdn\.resend\.com\//),
      4,
    )
    expect(scan).toHaveBeenCalledWith(Buffer.from('safe'), 'deck.pdf', 'application/pdf')
    expect(storeAttachment).toHaveBeenCalledWith(expect.objectContaining({
      fundId: 'fund-1', providerEmailId: 'email-1', bytes: Buffer.from('safe'),
    }))
    expect(materialized.attachments).toEqual([expect.objectContaining({
      filename: 'deck.pdf', size: 4,
      storagePath: 'fund-email-inbound-attachments/fund-1/mailbox-1/email-1/0_deck.pdf',
    })])
    expect(JSON.stringify(materialized)).not.toContain('safe')
  })

  it('quarantines disallowed, oversized, mismatched, unsafe, or failed-storage attachments', async () => {
    const metadata = {
      id: 'attachment-1', filename: 'deck.pdf', size: 4,
      content_type: 'application/pdf', content_disposition: 'attachment', content_id: null,
    }
    const event = { ...EVENT, attachments: [metadata] }
    receivingGet.mockResolvedValue({ data: fetched({ attachments: [metadata] }), error: null })
    const baseAttachment = {
      ...metadata, object: 'attachment', expires_at: '2099-01-01T00:00:00.000Z',
      download_url: 'https://evil.example.test/file',
    }
    attachmentsList.mockResolvedValue({
      data: { object: 'list', has_more: false, data: [baseAttachment] }, error: null,
    })
    const storeAttachment = vi.fn()
    const retrieved = await retrieveResendInboundEmail({} as never, CONNECTION, event)
    const routing = {
      disposition: 'routed' as const,
      source: 'mailbox' as const,
      threadId: null,
      mailboxId: 'mailbox-1',
      localPart: 'pitch',
      purpose: 'pitch' as const,
    }
    const disallowed = await materializeResendInboundAttachments(
      {} as never, CONNECTION, retrieved, routing, { storeAttachment },
    )
    expect(disallowed.quarantineReason).toBe('attachment_url_invalid')
    expect(storeAttachment).not.toHaveBeenCalled()

    attachmentsList.mockResolvedValueOnce({
      data: {
        object: 'list', has_more: false, data: [{
          ...baseAttachment,
          download_url: 'https://inbound-cdn.resend.com/email-1/attachments/attachment-1',
        }],
      },
      error: null,
    })
    const unsafe = await materializeResendInboundAttachments({} as never, CONNECTION, retrieved, routing, {
      download: vi.fn().mockResolvedValue(Buffer.from('safe')),
      scan: vi.fn().mockResolvedValue({ safe: false, reason: 'malware' }),
      storeAttachment,
    })
    expect(unsafe.quarantineReason).toBe('attachment_unsafe')
    expect(storeAttachment).not.toHaveBeenCalled()
  })

  it('uses a dedicated private-bucket path and upsert for idempotent webhook retries', async () => {
    const metadata = {
      id: 'attachment-1', filename: 'deck.pdf', size: 4,
      content_type: 'application/pdf', content_disposition: 'attachment', content_id: null,
    }
    const event = { ...EVENT, attachments: [metadata] }
    receivingGet.mockResolvedValue({ data: fetched({ attachments: [metadata] }), error: null })
    attachmentsList.mockResolvedValue({
      data: {
        object: 'list', has_more: false, data: [{
          ...metadata,
          object: 'attachment',
          download_url: 'https://inbound-cdn.resend.com/email-1/attachments/attachment-1',
          expires_at: '2099-01-01T00:00:00.000Z',
        }],
      },
      error: null,
    })
    const upload = vi.fn().mockResolvedValue({ error: null })
    const bucket = vi.fn().mockReturnValue({ upload })
    const admin = { storage: { from: bucket } } as never
    const email = await retrieveResendInboundEmail(admin, CONNECTION, event)
    const routing = {
      disposition: 'routed' as const,
      source: 'mailbox' as const,
      threadId: null,
      mailboxId: 'mailbox-1',
      localPart: 'pitch',
      purpose: 'pitch' as const,
    }
    const dependencies = {
      download: vi.fn().mockResolvedValue(Buffer.from('safe')),
      scan: vi.fn().mockResolvedValue({ safe: true }),
    }

    const first = await materializeResendInboundAttachments(
      admin, CONNECTION, email, routing, dependencies,
    )
    const second = await materializeResendInboundAttachments(
      admin, CONNECTION, email, routing, dependencies,
    )

    expect(bucket).toHaveBeenCalledWith('fund-email-inbound-attachments')
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload.mock.calls[0][0]).toBe(upload.mock.calls[1][0])
    expect(upload.mock.calls[0][0]).toMatch(/^fund-1\/mailbox-1\/[a-f0-9]{64}\//)
    expect(upload.mock.calls[0][2]).toMatchObject({ upsert: true })
    expect(first.attachments[0].storagePath).toBe(second.attachments[0].storagePath)
  })

  it('turns provider failures into retryable sanitized errors', async () => {
    receivingGet.mockResolvedValue({
      data: null,
      error: { message: 're_secret founder@example.test internal provider details' },
    })
    await expect(retrieveResendInboundEmail({} as never, CONNECTION, EVENT))
      .rejects.toMatchObject({
        code: 'inbound_provider_unavailable',
        message: 'Resend inbound content is temporarily unavailable.',
        retryable: true,
      })
  })
})
