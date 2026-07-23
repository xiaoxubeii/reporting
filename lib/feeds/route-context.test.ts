import { describe, expect, it, vi } from 'vitest'
import { assertSameOriginMutation, readJsonObject } from './route-context'

describe('assertSameOriginMutation', () => {
  it('accepts a same-origin Referer when the browser omits Origin', () => {
    const request = new Request('https://reporting.example/api/feeds/follow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: 'https://reporting.example/feeds?view=explore',
      },
    })

    expect(() => assertSameOriginMutation(request)).not.toThrow()
  })

  it('uses the public Host header when the runtime request URL contains a bind address', () => {
    const request = new Request('http://0.0.0.0:3100/api/feeds/follow', {
      method: 'POST',
      headers: {
        Host: 'localhost:3100',
        'Content-Type': 'application/json',
        Referer: 'http://localhost:3100/feeds?view=explore',
      },
    })

    expect(() => assertSameOriginMutation(request)).not.toThrow()
  })

  it('rejects cross-origin Origin or Referer metadata', () => {
    const crossOriginHeaders: Array<Record<string, string>> = [
      { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
      { Referer: 'https://attacker.example/feeds', 'Content-Type': 'application/json' },
    ]
    for (const headers of crossOriginHeaders) {
      const request = new Request('https://reporting.example/api/feeds/follow', {
        method: 'POST', headers,
      })
      expect(() => assertSameOriginMutation(request)).toThrowError(/Cross-origin/)
    }
  })
})

describe('readJsonObject', () => {
  it('accepts a small JSON object', async () => {
    const request = new Request('https://reporting.example/api/feeds/discover', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' }),
      headers: { 'Content-Type': 'application/json' },
    })

    await expect(readJsonObject(request)).resolves.toEqual({ url: 'https://example.com' })
  })

  it('rejects and cancels declared or streamed bodies larger than the feeds JSON limit', async () => {
    const declaredCancel = vi.fn(async () => undefined)
    const declared = {
      headers: new Headers({ 'Content-Length': '20000' }),
      body: { cancel: declaredCancel },
    } as unknown as Request

    await expect(readJsonObject(declared)).rejects.toMatchObject({ code: 'invalid_request' })
    expect(declaredCancel).toHaveBeenCalledOnce()

    const streamedCancel = vi.fn()
    const streamed = new Request('https://reporting.example/api/feeds/discover', {
      method: 'POST',
      body: new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(20000)) },
        cancel: streamedCancel,
      }),
      duplex: 'half',
    } as RequestInit)

    await expect(readJsonObject(streamed)).rejects.toMatchObject({ code: 'invalid_request' })
    expect(streamedCancel).toHaveBeenCalledOnce()
  })
})
