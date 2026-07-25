import { describe, expect, it, vi } from 'vitest'

const CONFIGURED_ENV = Object.freeze({
  MINIFLUX_BASE_URL: 'http://127.0.0.1:8085/miniflux',
  REPORTING_SEARXNG_URL: 'http://localhost:8086',
  NEXT_PUBLIC_SUPABASE_URL: 'https://database.example',
  MINIFLUX_PROVISIONER_TOKEN: 'must-not-appear',
  REPORTING_SEARXNG_SECRET: 'must-not-appear',
  SUPABASE_SERVICE_ROLE_KEY: 'must-not-appear',
})

describe('devctl external dependency probes', () => {
  it('keeps Miniflux, SearXNG, and Supabase in a separate immutable registry', async () => {
    const { EXTERNAL_DEPENDENCY_NAMES } = await dependenciesModule()

    expect(EXTERNAL_DEPENDENCY_NAMES).toEqual(['miniflux', 'searxng', 'supabase'])
    expect(Object.isFrozen(EXTERNAL_DEPENDENCY_NAMES)).toBe(true)
  })

  it('reports all external dependencies as unconfigured without making requests', async () => {
    const { probeExternalDependencies } = await dependenciesModule()
    const fetchImpl = vi.fn()

    await expect(probeExternalDependencies({}, { fetchImpl })).resolves.toEqual([
      { name: 'miniflux', state: 'unconfigured', ownership: 'external' },
      { name: 'searxng', state: 'unconfigured', ownership: 'external' },
      { name: 'supabase', state: 'unconfigured', ownership: 'external' },
    ])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects invalid configured endpoints without leaking credentials', async () => {
    const { probeExternalDependencies } = await dependenciesModule()
    const statuses = await probeExternalDependencies({
      MINIFLUX_BASE_URL: 'http://feeds.example',
      REPORTING_SEARXNG_URL: 'ftp://search.example',
      NEXT_PUBLIC_SUPABASE_URL: 'https://user:password@database.example/path',
    }, { fetchImpl: vi.fn() })

    expect(statuses.map(status => [status.name, status.state])).toEqual([
      ['miniflux', 'invalid'],
      ['searxng', 'invalid'],
      ['supabase', 'invalid'],
    ])
    expect(JSON.stringify(statuses)).not.toContain('password')
  })

  it('uses bounded side-effect-free health endpoints for all configured dependencies', async () => {
    const { probeExternalDependencies } = await dependenciesModule()
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('ok', { status: 200 }))

    const statuses = await probeExternalDependencies(CONFIGURED_ENV, { fetchImpl })

    expect(statuses.map(status => [status.name, status.state, status.ownership])).toEqual([
      ['miniflux', 'running', 'external'],
      ['searxng', 'running', 'external'],
      ['supabase', 'running', 'external'],
    ])
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'http://127.0.0.1:8085/miniflux/healthcheck',
      'http://localhost:8086/healthz',
      'https://database.example/auth/v1/health',
    ])
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({ redirect: 'manual' })
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      expect(init?.method).toBeUndefined()
      expect(init?.body).toBeUndefined()
    }
    expect(JSON.stringify(statuses)).not.toContain('must-not-appear')
  })

  it('reports configured dependencies as unreachable without blocking on thrown requests', async () => {
    const { probeExternalDependencies } = await dependenciesModule()
    const statuses = await probeExternalDependencies(CONFIGURED_ENV, {
      fetchImpl: vi.fn<typeof fetch>(async () => { throw new Error('connection refused') }),
    })

    expect(statuses.map(status => [status.name, status.state])).toEqual([
      ['miniflux', 'unreachable'],
      ['searxng', 'unreachable'],
      ['supabase', 'unreachable'],
    ])
  })
})

function dependenciesModule(): Promise<{
  EXTERNAL_DEPENDENCY_NAMES: readonly string[]
  probeExternalDependencies(
    env: Readonly<Record<string, string | undefined>>,
    options?: Readonly<{ fetchImpl?: typeof fetch }>,
  ): Promise<readonly Readonly<{
    name: string
    state: string
    ownership: 'external'
    url?: string
  }>[]>
}> {
  return import('../scripts/devctl/dependencies.mjs')
}
