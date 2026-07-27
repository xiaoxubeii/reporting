import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import nextConfig, { nextDistDir, nextTsconfigPath, supabaseConnectSources } from '../next.config.mjs'

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

describe('nextDistDir', () => {
  it('keeps production output at .next and accepts an isolated devctl directory', () => {
    expect(nextDistDir(undefined)).toBe('.next')
    expect(nextDistDir('  ')).toBe('.next')
    expect(nextDistDir('.next-devctl')).toBe('.next-devctl')
  })

  it('rejects paths outside the project root', () => {
    expect(() => nextDistDir('../shared-next')).toThrow('NEXT_DIST_DIR must be a safe directory name')
    expect(() => nextDistDir('/tmp/shared-next')).toThrow('NEXT_DIST_DIR must be a safe directory name')
    expect(() => nextDistDir('.git')).toThrow('NEXT_DIST_DIR must be a safe directory name')
    expect(() => nextDistDir('app')).toThrow('NEXT_DIST_DIR must be a safe directory name')
    expect(() => nextDistDir('node_modules')).toThrow('NEXT_DIST_DIR must be a safe directory name')
  })

  it('rejects a symlinked build directory', () => {
    const rootDir = mkdtempSync(path.join(os.tmpdir(), 'reporting-next-dist-'))
    try {
      symlinkSync(path.join(rootDir, 'outside'), path.join(rootDir, '.next-devctl'))
      expect(() => nextDistDir('.next-devctl', rootDir)).toThrow(
        'NEXT_DIST_DIR must not be a symbolic link',
      )
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})

describe('nextTsconfigPath', () => {
  it('keeps production and devctl generated types isolated', () => {
    expect(nextTsconfigPath('.next')).toBe('tsconfig.json')
    expect(nextTsconfigPath('.next-devctl')).toBe('tsconfig.devctl.json')

    const productionConfig = JSON.parse(readFileSync(path.join(process.cwd(), 'tsconfig.json'), 'utf8'))
    const devctlConfig = JSON.parse(readFileSync(path.join(process.cwd(), 'tsconfig.devctl.json'), 'utf8'))
    expect(productionConfig.include).toContain('.next/types/**/*.ts')
    expect(productionConfig.include).not.toContain('.next-devctl/types/**/*.ts')
    expect(devctlConfig.include).toContain('.next-devctl/types/**/*.ts')
    expect(devctlConfig.include).not.toContain('.next/types/**/*.ts')
  })
})
