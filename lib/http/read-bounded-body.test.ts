import { describe, expect, it } from 'vitest'

import {
  RequestBodyTooLargeError,
  readBoundedFormData,
  readBoundedJson,
} from './read-bounded-body'

describe('bounded request body readers', () => {
  it('rejects a declared oversize body before parsing it', async () => {
    const request = new Request('https://example.test/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '1025',
      },
      body: '{}',
    })

    await expect(readBoundedJson(request, 1024)).rejects.toBeInstanceOf(RequestBodyTooLargeError)
  })

  it('stops reading a chunked body as soon as the byte limit is crossed', async () => {
    let cancelled = false
    const request = new Request('https://example.test/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"value":"'))
          controller.enqueue(new TextEncoder().encode('too-large"}'))
        },
        cancel() {
          cancelled = true
        },
      }),
      duplex: 'half',
    } as RequestInit)

    await expect(readBoundedJson(request, 12)).rejects.toBeInstanceOf(RequestBodyTooLargeError)
    expect(cancelled).toBe(true)
  })

  it('parses valid JSON and multipart bodies within the limit', async () => {
    const json = new Request('https://example.test/json', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    })
    await expect(readBoundedJson(json, 1024)).resolves.toEqual({ ok: true })

    const form = new FormData()
    form.set('sender', 'founder@example.test')
    form.set('attachment', new File(['safe'], 'pitch.txt', { type: 'text/plain' }))
    const multipart = new Request('https://example.test/mailgun', { method: 'POST', body: form })
    const parsed = await readBoundedFormData(multipart, 4096)
    expect(parsed.get('sender')).toBe('founder@example.test')
    expect(parsed.get('attachment')).toBeInstanceOf(File)
  })
})
