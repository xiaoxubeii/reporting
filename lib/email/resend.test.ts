import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.hoisted(() => vi.fn())
const constructedWith = vi.hoisted(() => [] as string[])

vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
    constructor(apiKey: string) { constructedWith.push(apiKey) }
  },
}))

import { sendOutboundEmail } from '@/lib/email'

const REDACTION_TEST_KEY = ['resend', 'redaction', 'fixture'].join('-')

describe('Resend outbound adapter', () => {
  beforeEach(() => {
    send.mockReset()
    constructedWith.length = 0
    send.mockResolvedValue({ data: { id: 'resend-message-1' }, error: null })
  })

  afterEach(() => vi.restoreAllMocks())

  it('passes Reply-To, RFC headers, tags, content type and stable idempotency', async () => {
    const result = await sendOutboundEmail(
      { provider: 'resend', apiKey: 're_fund_key' },
      {
        from: 'Alice <alice@cci.fundworkspace.com>',
        to: 'expert@example.test',
        cc: 'observer@example.test',
        bcc: 'audit@example.test',
        replyTo: 'r_abc@cci.fundworkspace.com',
        subject: 'Question',
        html: '<p>Hello</p>',
        text: 'Hello',
        headers: {
          'In-Reply-To': '<prior@example.test>',
          References: '<first@example.test> <prior@example.test>',
        },
        tags: [{ name: 'scope', value: 'fund-mail' }],
        idempotencyKey: 'fund-email:message-1',
        attachments: [{ filename: 'brief.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' }],
      },
    )

    expect(result).toEqual({ id: 'resend-message-1' })
    expect(constructedWith).toEqual(['re_fund_key'])
    expect(send).toHaveBeenCalledWith({
      from: 'Alice <alice@cci.fundworkspace.com>',
      to: 'expert@example.test',
      cc: 'observer@example.test',
      bcc: 'audit@example.test',
      replyTo: 'r_abc@cci.fundworkspace.com',
      subject: 'Question',
      html: '<p>Hello</p>',
      text: 'Hello',
      headers: {
        'In-Reply-To': '<prior@example.test>',
        References: '<first@example.test> <prior@example.test>',
      },
      tags: [{ name: 'scope', value: 'fund-mail' }],
      attachments: [{ filename: 'brief.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' }],
    }, { idempotencyKey: 'fund-email:message-1' })
  })

  it('treats a Resend error response or missing provider ID as a sanitized failure', async () => {
    send.mockResolvedValueOnce({ data: null, error: { message: 'secret re_live_123 expert@example.test' } })
    await expect(sendOutboundEmail(
      { provider: 'resend', apiKey: 're_live_123' },
      { from: 'A <a@example.test>', to: 'expert@example.test', subject: 'S', html: '<p>x</p>' },
    )).rejects.toThrow('Resend rejected the email')

    send.mockResolvedValueOnce({ data: {}, error: null })
    await expect(sendOutboundEmail(
      { provider: 'resend', apiKey: 're_live_123' },
      { from: 'A <a@example.test>', to: 'expert@example.test', subject: 'S', html: '<p>x</p>' },
    )).rejects.toThrow('Resend did not return a message ID')
  })

  it('does not log recipients, subjects, bodies, API keys, or reply tokens', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await sendOutboundEmail(
      { provider: 'resend', apiKey: REDACTION_TEST_KEY },
      {
        from: 'Alice <alice@cci.fundworkspace.com>',
        to: 'expert@example.test',
        replyTo: 'r_secret_token@cci.fundworkspace.com',
        subject: 'Sensitive subject',
        html: '<p>Sensitive body</p>',
      },
    )
    const output = JSON.stringify(log.mock.calls)
    expect(output).not.toContain(REDACTION_TEST_KEY)
    expect(output).not.toMatch(/expert@example|Sensitive|r_secret/i)
    expect(output).toContain('resend-message-1')
  })

  it('requires an explicit server-derived From identity', async () => {
    process.env.EMAIL_FROM = 'must-not-fallback@example.test'
    await expect(sendOutboundEmail(
      { provider: 'resend', apiKey: 're_fund_key' },
      { to: 'expert@example.test', subject: 'Question', html: '<p>Hello</p>' },
    )).rejects.toThrow('explicit sender')
    expect(send).not.toHaveBeenCalled()
    delete process.env.EMAIL_FROM
  })

  it.each([
    ['subject', { subject: 'Question\r\nBcc: attacker@example.test' }],
    ['recipient', { to: 'expert@example.test\0ignored' }],
    ['reply-to', { replyTo: 'reply@example.test\nCc: attacker@example.test' }],
    ['custom header', { headers: { 'X-Trace': 'safe\r\nBcc: attacker@example.test' } }],
    ['idempotency key', { idempotencyKey: 'message-1\0suffix' }],
  ])('rejects control characters in the %s at the shared outbound boundary', async (_label, override) => {
    await expect(sendOutboundEmail(
      { provider: 'resend', apiKey: 're_fund_key' },
      {
        from: 'Alice <alice@cci.fundworkspace.com>',
        to: 'expert@example.test',
        subject: 'Question',
        html: '<p>Hello</p>',
        ...override,
      },
    )).rejects.toThrow('Invalid email header')
    expect(send).not.toHaveBeenCalled()
  })
})
