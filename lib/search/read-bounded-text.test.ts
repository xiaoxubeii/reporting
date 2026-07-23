import { describe, expect, it, vi } from 'vitest'
import { readBoundedResponseText } from './read-bounded-text'

describe('readBoundedResponseText', () => {
  it('decodes a streamed response within the byte limit', async () => {
    const response = new Response('心脏 valve', {
      headers: { 'Content-Type': 'text/plain' },
    })

    await expect(readBoundedResponseText(
      response,
      64,
      () => new Error('too large'),
    )).resolves.toBe('心脏 valve')
  })

  it('cancels a streamed response as soon as accumulated bytes exceed the limit', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.enqueue(new Uint8Array([4, 5, 6]))
      },
      cancel,
    })
    const response = new Response(stream)

    await expect(readBoundedResponseText(
      response,
      5,
      () => new Error('too large'),
    )).rejects.toThrow('too large')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('rejects a declared oversize response before reading its body', async () => {
    const response = new Response('small', {
      headers: { 'Content-Length': '100' },
    })

    await expect(readBoundedResponseText(
      response,
      10,
      () => new Error('too large'),
    )).rejects.toThrow('too large')
  })
})
