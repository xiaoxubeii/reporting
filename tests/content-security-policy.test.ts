import { afterEach, describe, expect, it, vi } from 'vitest'

type HeaderRule = {
  source: string
  headers: Array<{ key: string; value: string }>
}

type RewriteRule = {
  source: string
  destination: string
}

async function contentSecurityPolicy(): Promise<string> {
  const config = (await import('../next.config.mjs')).default as {
    headers: () => Promise<HeaderRule[]>
  }
  const rules = await config.headers()
  const pageRule = rules.find(rule => rule.source === '/((?!_next/static).*)')
  return pageRule?.headers.find(header => header.key === 'Content-Security-Policy')?.value ?? ''
}

async function rewrites(): Promise<RewriteRule[]> {
  const config = (await import('../next.config.mjs')).default as {
    rewrites: () => Promise<RewriteRule[]>
  }
  return config.rewrites()
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Content Security Policy', () => {
  it('allows the configured local Supabase HTTP and WebSocket origins', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:8000/auth/v1')

    const csp = await contentSecurityPolicy()

    expect(csp).toContain('http://127.0.0.1:8000')
    expect(csp).toContain('ws://127.0.0.1:8000')
    expect(csp).not.toContain('/auth/v1')
  })

  it('pins production Supabase access to the configured HTTPS tenant', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project-ref.supabase.co/rest/v1')

    const csp = await contentSecurityPolicy()

    expect(csp).toContain('https://project-ref.supabase.co')
    expect(csp).toContain('wss://project-ref.supabase.co')
    expect(csp).not.toContain('https://*.supabase.co')
    expect(csp).not.toContain('wss://*.supabase.co')
  })

  it.each([
    ['https://*', 'https://*'],
    ['https://*.evil.test', 'evil.test'],
    ['https://example.com;worker-src', 'example.com'],
    ['https://example.com%3Bworker-src', 'example.com'],
    ['https://example.com\n', 'example.com'],
    ['https://example.com\t', 'example.com'],
    ['https://user:pass@example.com', 'example.com'],
    ['javascript:alert(1)', 'javascript:'],
    ['file:///tmp/supabase', 'file:'],
  ])('rejects an unsafe configured Supabase URL: %s', async (configuredUrl, forbiddenSource) => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', configuredUrl)

    const csp = await contentSecurityPolicy()

    expect(csp).not.toContain(forbiddenSource)
    expect(csp.match(/worker-src/g)).toBeNull()
    expect(csp.match(/connect-src/g)).toHaveLength(1)
  })

  it('rejects cleartext non-loopback Supabase origins in every environment', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.internal.example:8000')

    const csp = await contentSecurityPolicy()

    expect(csp).not.toContain('supabase.internal.example')
  })
})

describe('Supabase browser proxy', () => {
  it('proxies same-origin browser requests to the configured Supabase origin', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:8000')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_BROWSER_URL', '/_supabase')

    await expect(rewrites()).resolves.toContainEqual({
      source: '/_supabase/:path*',
      destination: 'http://127.0.0.1:8000/:path*',
    })
  })

  it('does not expose the proxy unless the browser override explicitly enables it', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:8000')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_BROWSER_URL', '')

    const rules = await rewrites()

    expect(rules.some(rule => rule.source === '/_supabase/:path*')).toBe(false)
  })

  it('does not expose the development proxy in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project-ref.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_BROWSER_URL', '/_supabase')

    const rules = await rewrites()

    expect(rules.some(rule => rule.source === '/_supabase/:path*')).toBe(false)
  })

  it.each([
    'http://supabase.internal.example:8000',
    'https://user:pass@example.com',
    'file:///tmp/supabase',
  ])('does not create a proxy for an unsafe Supabase URL: %s', async configuredUrl => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', configuredUrl)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_BROWSER_URL', '/_supabase')

    const rules = await rewrites()

    expect(rules.some(rule => rule.source === '/_supabase/:path*')).toBe(false)
  })
})
