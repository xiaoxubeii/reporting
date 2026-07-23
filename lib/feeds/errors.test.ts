import { describe, expect, it, vi } from 'vitest'
import { feedFailure, feedSuccess } from './envelope'
import { FeedApiError, toFeedApiError } from './errors'
import { MinifluxError } from './miniflux/client'

describe('feed API envelopes', () => {
  it('returns success responses with optional status and metadata', async () => {
    const plain = feedSuccess({ ok: true })
    expect(plain.status).toBe(200)
    await expect(plain.json()).resolves.toEqual({ success: true, data: { ok: true }, error: null })

    const created = feedSuccess({ id: 1 }, { status: 201, meta: { cursor: 2 } })
    expect(created.status).toBe(201)
    await expect(created.json()).resolves.toMatchObject({ success: true, meta: { cursor: 2 } })
  })

  it.each([
    ['authentication', 502, 'authentication'],
    ['rate_limited', 429, 'rate_limited'],
    ['not_found', 404, 'not_found'],
    ['upstream', 502, 'upstream'],
  ] as const)('maps Miniflux %s failures to safe envelopes', async (code, status, expectedCode) => {
    const response = feedFailure(new MinifluxError(code, 'sensitive upstream detail'))
    expect(response.status).toBe(status)
    const body = await response.json()
    expect(body.error.code).toBe(expectedCode)
    expect(body.error.message).not.toContain('sensitive')
  })

  it('preserves explicit safe errors and sanitizes unexpected errors', async () => {
    expect(toFeedApiError(new FeedApiError('forbidden', 403, 'No access'))).toMatchObject({ status: 403 })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const safe = toFeedApiError(new Error('database password'))
    expect(safe).toMatchObject({ code: 'internal', status: 500 })
    expect(safe.safeMessage).not.toContain('password')
    expect(errorSpy).toHaveBeenCalledOnce()
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('database password')
    errorSpy.mockRestore()
  })
})
