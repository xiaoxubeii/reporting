import { describe, expect, it, vi } from 'vitest'
import {
  persistLegacyInboundAttachments,
  prepareLegacyInboundAttachments,
} from './legacy-inbound-attachments'

const textAttachment = (name: string, content = 'hello') => ({
  Name: name,
  ContentType: 'text/plain',
  ContentLength: Buffer.byteLength(content),
  Content: Buffer.from(content).toString('base64'),
})

describe('legacy inbound attachment boundary', () => {
  it('rejects too many attachments before scanning', async () => {
    const scan = vi.fn().mockResolvedValue({ safe: true })
    const result = await prepareLegacyInboundAttachments(
      Array.from({ length: 11 }, (_, index) => textAttachment(`${index}.txt`)),
      scan,
    )

    expect(result).toEqual({ ok: false, code: 'attachment_limit_exceeded' })
    expect(scan).not.toHaveBeenCalled()
  })

  it.each([
    [{ ...textAttachment('missing.txt'), Content: undefined }, 'attachment_content_invalid'],
    [{ ...textAttachment('invalid.txt'), Content: 'not-base64!' }, 'attachment_content_invalid'],
    [{ ...textAttachment('size.txt'), ContentLength: 99 }, 'attachment_size_mismatch'],
    [{ ...textAttachment('large.txt'), ContentLength: 10 * 1024 * 1024 + 1 }, 'attachment_limit_exceeded'],
  ])('rejects malformed or oversized content without preserving it', async (attachment, code) => {
    const result = await prepareLegacyInboundAttachments([attachment])
    expect(result).toEqual({ ok: false, code })
  })

  it('fails the entire message when any attachment is unsafe', async () => {
    const scan = vi.fn()
      .mockResolvedValueOnce({ safe: true })
      .mockResolvedValueOnce({ safe: false, reason: 'malware' })

    const result = await prepareLegacyInboundAttachments([
      textAttachment('safe.txt'),
      textAttachment('unsafe.txt'),
    ], scan)

    expect(result).toEqual({ ok: false, code: 'attachment_unsafe' })
  })

  it('rolls back stored objects and returns no metadata when storage fails', async () => {
    const prepared = await prepareLegacyInboundAttachments([
      textAttachment('one.txt'),
      textAttachment('two.txt'),
    ], async () => ({ safe: true }))
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return

    const store = vi.fn()
      .mockResolvedValueOnce('email-id/0_one.txt')
      .mockRejectedValueOnce(new Error('storage unavailable'))
    const remove = vi.fn().mockResolvedValue(undefined)

    const result = await persistLegacyInboundAttachments(prepared.attachments, { store, remove })

    expect(result).toEqual({ ok: false, code: 'attachment_storage_failed' })
    expect(remove).toHaveBeenCalledWith('email-id/0_one.txt')
  })

  it('returns storage-only metadata after every attachment is stored', async () => {
    const prepared = await prepareLegacyInboundAttachments(
      [textAttachment('../deck.txt')],
      async () => ({ safe: true }),
    )
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return

    const store = vi.fn().mockResolvedValue('email-id/0___deck.txt')
    const result = await persistLegacyInboundAttachments(prepared.attachments, {
      store,
      remove: vi.fn(),
    })

    expect(result).toEqual({
      ok: true,
      attachments: [{
        Name: '../deck.txt',
        ContentType: 'text/plain',
        ContentLength: 5,
        StoragePath: 'email-id/0___deck.txt',
      }],
    })
    expect(JSON.stringify(result)).not.toContain('aGVsbG8=')
  })
})
