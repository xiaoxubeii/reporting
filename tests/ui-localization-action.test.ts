import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { POST } from '../app/api/locale/route'
import { isDevelopmentLoopbackForward } from '../i18n/origin'

afterEach(() => {
  vi.unstubAllEnvs()
})

function localeRequest(
  body: string,
  headers: Record<string, string> = {},
  url = 'http://localhost/api/locale',
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

function streamedLocaleRequest(chunks: string[], headers: Record<string, string> = {}) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })

  return new NextRequest('http://localhost/api/locale', {
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

describe('POST /api/locale', () => {
  it.each(['en', 'zh-CN'] as const)('persists the supported locale %s', async locale => {
    const response = await POST(localeRequest(JSON.stringify({ locale })))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ locale })
    expect(response.cookies.get('NEXT_LOCALE')).toMatchObject({
      name: 'NEXT_LOCALE',
      value: locale,
      path: '/',
    })
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=31536000')
    expect(response.headers.get('set-cookie')).toContain('Path=/')
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each([undefined, null, '', 'zh', 'ZH-cn', '../messages/zh-CN', 42, ['en'], { locale: 'en' }])(
    'rejects unsupported input %j before writing a cookie',
    async locale => {
      const response = await POST(localeRequest(JSON.stringify({ locale })))

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: 'Unsupported locale' })
      expect(response.headers.get('set-cookie')).toBeNull()
    },
  )

  it('rejects extra request fields', async () => {
    const response = await POST(localeRequest(JSON.stringify({ locale: 'en', redirectTo: 'https://example.com' })))

    expect(response.status).toBe(400)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('rejects cross-origin requests', async () => {
    const response = await POST(localeRequest(JSON.stringify({ locale: 'en' }), {
      origin: 'https://example.com',
    }))

    expect(response.status).toBe(403)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('accepts a different localhost forwarding port outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const response = await POST(localeRequest(
      JSON.stringify({ locale: 'zh-CN' }),
      { origin: 'http://localhost:59343' },
      'http://localhost:3137/api/locale',
    ))

    expect(response.status).toBe(200)
    expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('zh-CN')
  })

  it.each([
    ['http://localhost:59343', 'http://localhost:3137'],
    ['http://127.0.0.1:59343', 'http://127.0.0.1:3137'],
    ['http://[::1]:59343', 'http://[::1]:3137'],
    ['http://localhost:59343', 'http://127.0.0.1:3137'],
    ['http://localhost:59343', 'http://0.0.0.0:3137'],
  ])('recognizes local development forwarding safely: %s', (origin, appOrigin) => {
    vi.stubEnv('NODE_ENV', 'development')

    expect(isDevelopmentLoopbackForward(origin, appOrigin)).toBe(true)
  })

  it('keeps forwarded-port origin checks strict in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const response = await POST(localeRequest(
      JSON.stringify({ locale: 'en' }),
      { origin: 'http://localhost:59343' },
      'http://localhost:3137/api/locale',
    ))

    expect(response.status).toBe(403)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it.each([
    ['https://app.example.com:59343', 'https://app.example.com:3137/api/locale'],
    ['https://localhost:59343', 'http://localhost:3137/api/locale'],
    ['http://localhost.evil.example:59343', 'http://localhost.evil.example:3137/api/locale'],
    ['http://0.0.0.0:59343', 'http://localhost:3137/api/locale'],
  ])('rejects unsafe development forwarding origins: %s', async (origin, url) => {
    vi.stubEnv('NODE_ENV', 'development')
    const response = await POST(localeRequest(JSON.stringify({ locale: 'en' }), { origin }, url))

    expect(response.status).toBe(403)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('accepts the configured public origin when the request URL uses an internal proxy origin', async () => {
    const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_SITE_URL = 'https://portfolio.example.com'

    try {
      const response = await POST(localeRequest(
        JSON.stringify({ locale: 'zh-CN' }),
        { origin: 'https://portfolio.example.com' },
        'http://internal-app:3000/api/locale',
      ))

      expect(response.status).toBe(200)
      expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('zh-CN')
    } finally {
      if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
      else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl
    }
  })

  it('accepts the exact trusted Fund origin when Next uses an internal origin', async () => {
    vi.stubEnv('FUND_WORKSPACE_ROOT_DOMAIN', 'localhost')
    const response = await POST(localeRequest(
      JSON.stringify({ locale: 'zh-CN' }),
      {
        host: 'alpha.localhost:5040',
        origin: 'http://alpha.localhost:5040',
      },
      'http://127.0.0.1:5040/api/locale',
    ))

    expect(response.status).toBe(200)
    expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('zh-CN')
  })

  it('rejects a sibling Fund origin even though it shares the root domain', async () => {
    vi.stubEnv('FUND_WORKSPACE_ROOT_DOMAIN', 'localhost')
    const response = await POST(localeRequest(
      JSON.stringify({ locale: 'zh-CN' }),
      {
        host: 'alpha.localhost:5040',
        origin: 'http://beta.localhost:5040',
      },
      'http://127.0.0.1:5040/api/locale',
    ))

    expect(response.status).toBe(403)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('ignores an invalid configured site URL for direct same-origin requests', async () => {
    const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_SITE_URL = 'not a valid URL'

    try {
      const response = await POST(localeRequest(JSON.stringify({ locale: 'en' })))

      expect(response.status).toBe(200)
      expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('en')
    } finally {
      if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
      else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl
    }
  })

  it('requires JSON and rejects malformed or oversized bodies', async () => {
    const wrongType = await POST(localeRequest(JSON.stringify({ locale: 'en' }), {
      'content-type': 'text/plain',
    }))
    const malformed = await POST(localeRequest('{'))
    const oversized = await POST(localeRequest(JSON.stringify({ locale: 'en' }), {
      'content-length': '101',
    }))

    expect(wrongType.status).toBe(415)
    expect(malformed.status).toBe(400)
    expect(oversized.status).toBe(413)
    expect(wrongType.headers.get('set-cookie')).toBeNull()
    expect(malformed.headers.get('set-cookie')).toBeNull()
    expect(oversized.headers.get('set-cookie')).toBeNull()
  })

  it.each(['1e2', '0x64', '+1'])('rejects non-decimal content length %j', async contentLength => {
    const response = await POST(localeRequest(JSON.stringify({ locale: 'en' }), {
      'content-length': contentLength,
    }))

    expect(response.status).toBe(400)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('stops oversized streamed bodies even without a trustworthy content length', async () => {
    const largePayload = JSON.stringify({ locale: 'en', padding: 'x'.repeat(200) })
    const withoutLength = await POST(streamedLocaleRequest([
      largePayload.slice(0, 60),
      largePayload.slice(60),
    ]))
    const forgedSmallLength = await POST(streamedLocaleRequest([largePayload], {
      'content-length': '1',
    }))

    expect(withoutLength.status).toBe(413)
    expect(forgedSmallLength.status).toBe(413)
    expect(withoutLength.headers.get('set-cookie')).toBeNull()
    expect(forgedSmallLength.headers.get('set-cookie')).toBeNull()
  })

  it('cancels the stream as soon as the byte limit is exceeded', async () => {
    const encoder = new TextEncoder()
    let pulls = 0
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (pulls <= 2) {
          controller.enqueue(encoder.encode('x'.repeat(60)))
          return
        }
        controller.error(new Error('Handler read beyond the configured limit'))
      },
      cancel() {
        cancelled = true
      },
    })
    const request = new NextRequest('http://localhost/api/locale', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: stream,
      duplex: 'half',
    } as unknown as ConstructorParameters<typeof NextRequest>[1])

    const response = await POST(request)

    expect(response.status).toBe(413)
    expect(pulls).toBe(2)
    expect(cancelled).toBe(true)
  })
})
