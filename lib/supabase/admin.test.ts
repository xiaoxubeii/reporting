import { afterEach, describe, expect, it, vi } from 'vitest'

import { adminNoStoreFetch } from './admin'

describe('Supabase admin transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forces every server-side database request to bypass the Next data cache', async () => {
    const response = new Response('{}', { status: 200 })
    const fetchStub = vi.fn(async () => response)
    vi.stubGlobal('fetch', fetchStub)
    const init = Object.freeze({
      method: 'POST',
      headers: Object.freeze({ authorization: 'Bearer test-only' }),
    }) satisfies RequestInit

    await expect(adminNoStoreFetch('http://127.0.0.1:8000/rest/v1/rpc/background_job_claim_due', init))
      .resolves.toBe(response)
    expect(fetchStub).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/rest/v1/rpc/background_job_claim_due',
      {
        method: 'POST',
        headers: init.headers,
        cache: 'no-store',
      },
    )
    expect(init).toEqual({ method: 'POST', headers: init.headers })
  })
})
