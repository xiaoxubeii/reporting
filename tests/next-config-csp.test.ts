import { describe, expect, it } from 'vitest'

import nextConfig, { supabaseConnectSources } from '../next.config.mjs'

type HeaderRule = {
  source: string
  headers: Array<{ key: string; value: string }>
}

describe('supabaseConnectSources', () => {
  it('allows the configured local HTTP API and its WebSocket endpoint', () => {
    expect(supabaseConnectSources('http://127.0.0.1:8000/rest/v1')).toEqual([
      'http://127.0.0.1:8000',
      'ws://127.0.0.1:8000',
    ])
  })

  it('uses secure WebSockets for an HTTPS Supabase URL', () => {
    expect(supabaseConnectSources('https://project.supabase.co')).toEqual([
      'https://project.supabase.co',
      'wss://project.supabase.co',
    ])
  })

  it('rejects malformed URLs and non-HTTP protocols', () => {
    expect(supabaseConnectSources('not a URL')).toEqual([])
    expect(supabaseConnectSources('javascript:alert(1)')).toEqual([])
  })

  it('rejects cleartext Supabase URLs outside the local machine', () => {
    expect(supabaseConnectSources('http://supabase.internal:8000')).toEqual([])
    expect(supabaseConnectSources('http://192.168.1.20:8000')).toEqual([])
  })

  it('adds the configured Supabase origins to the emitted CSP header', async () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:8000'

    try {
      const config = nextConfig as { headers: () => Promise<HeaderRule[]> }
      const rules = await config.headers()
      const csp = rules
        .flatMap((rule) => rule.headers)
        .find((header) => header.key === 'Content-Security-Policy')

      expect(csp?.value).toContain('http://127.0.0.1:8000')
      expect(csp?.value).toContain('ws://127.0.0.1:8000')
    } finally {
      if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl
    }
  })
})
