import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.hoisted(() => vi.fn())
const createAdminClient = vi.hoisted(() => vi.fn(() => ({ admin: true })))
const loadPersonalProfile = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/identity/profile', () => ({ loadPersonalProfile }))

import { GET, POST } from '../app/api/time-zone/route'

const ONE_YEAR_IN_SECONDS = 31_536_000
const MAX_BODY_BYTES = 256

function request(
  body: string,
  headers: Record<string, string> = {},
  url = 'http://localhost/api/time-zone',
) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      ...headers,
    },
    body,
  })
}

function preferenceRequest(
  body: unknown,
  headers: Record<string, string> = {},
  url?: string,
) {
  return request(JSON.stringify(body), headers, url)
}

function streamedRequest(chunks: string[], headers: Record<string, string> = {}) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })

  return new NextRequest('http://localhost/api/time-zone', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      ...headers,
    },
    body: stream,
    duplex: 'half',
  } as unknown as ConstructorParameters<typeof NextRequest>[1])
}

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: null }, error: null })
  loadPersonalProfile.mockResolvedValue({ fullName: 'Hidden Name', timeZone: 'Asia/Shanghai' })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('GET /api/time-zone', () => {
  it('returns Automatic for a signed-out request without creating an admin client', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ manualTimeZone: null })
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(loadPersonalProfile).not.toHaveBeenCalled()
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each([
    ['Asia/Shanghai', 'Asia/Shanghai'],
    [null, null],
    ['UTC', 'UTC'],
  ])('returns only the authenticated manual timezone %j', async (stored, expected) => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'secret@example.test' } }, error: null })
    loadPersonalProfile.mockResolvedValue({ fullName: 'Private Name', timeZone: stored })

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ manualTimeZone: expected })
    expect(loadPersonalProfile).toHaveBeenCalledWith({ admin: true }, 'user-1')
  })

  it('returns a sanitized storage failure', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    loadPersonalProfile.mockRejectedValue(new Error('database host and secret detail'))

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Unable to load time zone preference' })
  })

  it('returns a sanitized authentication failure', async () => {
    getUser.mockRejectedValue(new Error('session provider and token detail'))

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Unable to load time zone preference' })
  })
})

describe('POST /api/time-zone', () => {
  it('allows signed-out Automatic mode and writes a secure host-only preference cookie', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const response = await POST(preferenceRequest({ mode: 'auto', timeZone: 'Etc/UTC' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ mode: 'auto', timeZone: 'UTC', changed: true })
    expect(response.cookies.get('REPORTING_TIME_ZONE')).toMatchObject({
      name: 'REPORTING_TIME_ZONE',
      value: 'auto%3AUTC',
      path: '/',
    })
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain(`Max-Age=${ONE_YEAR_IN_SECONDS}`)
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('SameSite=lax')
    expect(cookie).toContain('Secure')
    expect(cookie).not.toMatch(/(?:^|;)\s*Domain=/i)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(loadPersonalProfile).not.toHaveBeenCalled()
  })

  it('does not rewrite an unchanged valid cookie', async () => {
    const response = await POST(preferenceRequest(
      { mode: 'auto', timeZone: 'UTC' },
      { cookie: 'REPORTING_TIME_ZONE=auto%3AUTC' },
    ))

    await expect(response.json()).resolves.toEqual({ mode: 'auto', timeZone: 'UTC', changed: false })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('requires authentication for manual mode without writing a cookie', async () => {
    const response = await POST(preferenceRequest({ mode: 'manual', timeZone: 'Asia/Shanghai' }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('lets an authenticated user write a manual cookie without mutating profile storage', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    const response = await POST(preferenceRequest({ mode: 'manual', timeZone: 'Asia/Shanghai' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      mode: 'manual',
      timeZone: 'Asia/Shanghai',
      changed: true,
    })
    expect(response.cookies.get('REPORTING_TIME_ZONE')?.value).toBe('manual%3AAsia%2FShanghai')
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(loadPersonalProfile).not.toHaveBeenCalled()
  })

  it('returns a sanitized authentication failure without writing a manual cookie', async () => {
    getUser.mockRejectedValue(new Error('session provider and token detail'))

    const response = await POST(preferenceRequest({ mode: 'manual', timeZone: 'UTC' }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Unable to update time zone preference' })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it.each([
    { mode: 'automatic', timeZone: 'UTC' },
    { mode: 'manual', timeZone: 'Not/A_Zone' },
    { mode: 'auto', timeZone: '' },
    { mode: 'auto', timeZone: 'UTC', userId: 'user-1' },
    { timeZone: 'UTC' },
    { mode: 'auto' },
    null,
    [],
  ])('rejects invalid or non-exact input %j before any state change', async body => {
    const response = await POST(preferenceRequest(body))

    expect(response.status).toBe(400)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(getUser).not.toHaveBeenCalled()
  })

  it('requires a trusted same-origin JSON request', async () => {
    const body = { mode: 'auto', timeZone: 'UTC' }
    const crossOrigin = await POST(preferenceRequest(body, { origin: 'https://attacker.example' }))
    const missingOrigin = await POST(preferenceRequest(body, { origin: '' }))
    const wrongType = await POST(preferenceRequest(body, { 'content-type': 'text/plain' }))

    expect(crossOrigin.status).toBe(403)
    expect(missingOrigin.status).toBe(403)
    expect(wrongType.status).toBe(415)
    expect(crossOrigin.headers.get('set-cookie')).toBeNull()
    expect(missingOrigin.headers.get('set-cookie')).toBeNull()
    expect(wrongType.headers.get('set-cookie')).toBeNull()
  })

  it('accepts the exact tenant origin and rejects sibling or untrusted tenant hosts', async () => {
    vi.stubEnv('FUND_WORKSPACE_ROOT_DOMAIN', 'localhost')
    const body = { mode: 'auto', timeZone: 'UTC' }
    const trusted = await POST(preferenceRequest(body, {
      host: 'alpha.localhost:5040',
      origin: 'http://alpha.localhost:5040',
    }, 'http://127.0.0.1:5040/api/time-zone'))
    const sibling = await POST(preferenceRequest(body, {
      host: 'alpha.localhost:5040',
      origin: 'http://beta.localhost:5040',
    }, 'http://127.0.0.1:5040/api/time-zone'))
    const untrustedHost = await POST(preferenceRequest(body, {
      host: 'attacker.example',
      origin: 'http://attacker.example',
    }, 'http://127.0.0.1:5040/api/time-zone'))

    expect(trusted.status).toBe(200)
    expect(sibling.status).toBe(403)
    expect(untrustedHost.status).toBe(403)
  })

  it('rejects malformed, declared-oversized, and streamed-oversized bodies', async () => {
    const malformed = await POST(request('{'))
    const declaredOversized = await POST(preferenceRequest(
      { mode: 'auto', timeZone: 'UTC' },
      { 'content-length': String(MAX_BODY_BYTES + 1) },
    ))
    const payload = JSON.stringify({ mode: 'auto', timeZone: 'UTC', padding: 'x'.repeat(MAX_BODY_BYTES) })
    const streamedOversized = await POST(streamedRequest([
      payload.slice(0, 128),
      payload.slice(128),
    ], { 'content-length': '1' }))

    expect(malformed.status).toBe(400)
    expect(declaredOversized.status).toBe(413)
    expect(streamedOversized.status).toBe(413)
    expect(malformed.headers.get('set-cookie')).toBeNull()
    expect(declaredOversized.headers.get('set-cookie')).toBeNull()
    expect(streamedOversized.headers.get('set-cookie')).toBeNull()
  })

  it.each(['1e2', '0x100', '+256', '-1'])('rejects an invalid content length %j', async contentLength => {
    const response = await POST(preferenceRequest(
      { mode: 'auto', timeZone: 'UTC' },
      { 'content-length': contentLength },
    ))

    expect(response.status).toBe(400)
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
