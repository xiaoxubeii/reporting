import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createDevctlManager } from '../scripts/devctl/manager.mjs'
import { ensureRuntimeLayout, readState } from '../scripts/devctl/runtime.mjs'

const temporaryDirectories = new Set<string>()

afterEach(async () => {
  await Promise.all(Array.from(temporaryDirectories, directory => rm(directory, {
    recursive: true,
    force: true,
  })))
  temporaryDirectories.clear()
})

describe('devctl lifecycle orchestration', () => {
  it('starts once, reuses persisted ports, and stops idempotently', async () => {
    const fixture = await createFixture()

    expect((await fixture.manager.start()).changed).toBe(true)
    expect((await fixture.manager.start()).changed).toBe(false)
    expect(fixture.events.filter(event => event.startsWith('start:'))).toEqual([
      'start:web',
      'start:cron',
    ])

    const state = await readState(fixture.runtimeDir)
    expect(state?.basePort).toBe(5000)
    expect(state?.ports).toEqual({ web: 5000, cron: 5001 })
    expect(Object.keys(state?.services ?? {})).toEqual(['web', 'cron'])
    const persisted = JSON.parse(await readFile(path.join(fixture.runtimeDir, 'state.json'), 'utf8'))
    expect(persisted).toMatchObject({
      version: 1,
      ports: { web: 5000, cron: 5001, miniflux: 5002, searxng: 5003 },
    })
    expect(Object.keys(persisted.services)).toEqual(['web', 'cron'])

    expect((await fixture.manager.stop()).changed).toBe(true)
    expect((await fixture.manager.stop()).changed).toBe(false)
    expect(fixture.events.filter(event => event.startsWith('stop:'))).toEqual([
      'stop:cron',
      'stop:web',
    ])
  })

  it('rolls back only services created by a failed start in reverse order', async () => {
    const fixture = await createFixture({ failService: 'cron' })

    await expect(fixture.manager.start()).rejects.toThrow('cron failed')
    expect(fixture.events).toEqual([
      'start:web',
      'start:cron',
      'stop:web',
    ])
    expect(await readState(fixture.runtimeDir)).toBeNull()
  })

  it('stops an owned degraded service before replacing it', async () => {
    const fixture = await createFixture({ degradedService: 'web' })
    await fixture.manager.start(['web'])
    fixture.events.length = 0

    await fixture.manager.start(['web'])

    expect(fixture.events).toEqual(['status:web', 'stop:web', 'start:web'])
  })

  it('retains ownership state when rollback cannot stop a created service', async () => {
    const fixture = await createFixture({ failService: 'cron', stopFailureService: 'web' })

    await expect(fixture.manager.start()).rejects.toThrow('rollback incomplete')
    const state = await readState(fixture.runtimeDir)
    expect(Object.keys(state?.services ?? {})).toEqual(['web'])
  })

  it('persists a partial adapter record when internal cleanup fails', async () => {
    const fixture = await createFixture({ partialStartService: 'web' })

    await expect(fixture.manager.start(['web'])).rejects.toThrow('internal cleanup failed')
    const state = await readState(fixture.runtimeDir)
    expect(Object.keys(state?.services ?? {})).toEqual(['web'])
  })

  it('does not stop a stale or foreign process record', async () => {
    const fixture = await createFixture({ staleService: 'web' })
    await fixture.manager.start(['web'])
    fixture.events.length = 0

    const result = await fixture.manager.stop(['web'])

    expect(result.changed).toBe(true)
    expect(fixture.events).toEqual(['status:web'])
    expect(await readState(fixture.runtimeDir)).toBeNull()
  })

  it('reports managed health separately from all three external dependencies', async () => {
    const fixture = await createFixture({ degradedService: 'cron' })
    await fixture.manager.start(['web', 'cron'])

    const status = await fixture.manager.status(['web', 'cron'])

    expect(status.aggregate).toBe('degraded')
    expect(status.services.map(service => [service.name, service.state])).toEqual([
      ['web', 'running'],
      ['cron', 'degraded'],
    ])
    expect(status.dependencies).toEqual([
      { name: 'miniflux', state: 'running', ownership: 'external', url: 'https://feeds.example' },
      { name: 'searxng', state: 'unreachable', ownership: 'external', url: 'https://search.example' },
      { name: 'supabase', state: 'unconfigured', ownership: 'external' },
    ])
  })

  it('silently removes legacy external Compose records without stopping them', async () => {
    const fixture = await createFixture()
    await ensureRuntimeLayout(fixture.runtimeDir)
    const legacyState = {
      version: 1,
      rootDir: process.cwd(),
      basePort: 5000,
      ports: { web: 5000, cron: 5001, miniflux: 5002, searxng: 5003 },
      services: {
        miniflux: { kind: 'compose', project: 'legacy-miniflux', port: 5002 },
        searxng: { kind: 'compose', project: 'legacy-searxng', port: 5003 },
      },
      createdAt: new Date().toISOString(),
    }
    await writeFile(
      path.join(fixture.runtimeDir, 'state.json'),
      `${JSON.stringify(legacyState, null, 2)}\n`,
      { mode: 0o600 },
    )

    await fixture.manager.start(['web'])

    const state = await readState(fixture.runtimeDir)
    expect(state?.ports).toEqual({ web: 5000, cron: 5001 })
    expect(Object.keys(state?.services ?? {})).toEqual(['web'])
    expect(fixture.events).toEqual(['start:web'])
    expect(fixture.events).not.toContain('stop:miniflux')
    expect(fixture.events).not.toContain('stop:searxng')
  })

  it('creates a protected runtime directory and never stores injected secrets in state', async () => {
    const fixture = await createFixture()
    await fixture.manager.start(['web'])

    expect((await stat(fixture.runtimeDir)).mode & 0o777).toBe(0o700)
    expect((await stat(path.join(fixture.runtimeDir, 'state.json'))).mode & 0o777).toBe(0o600)
    expect(await readFile(path.join(fixture.runtimeDir, 'state.json'), 'utf8')).not.toContain(
      fixture.fixtureMarker,
    )
  })
})

async function createFixture(options: {
  failService?: string
  staleService?: string
  degradedService?: string
  stopFailureService?: string
  partialStartService?: string
} = {}) {
  const parentDir = await mkdtemp(path.join(tmpdir(), 'reporting-devctl-'))
  temporaryDirectories.add(parentDir)
  const runtimeDir = path.join(parentDir, 'runtime')
  const events: string[] = []
  const fixtureMarker = 'test-only-value-that-must-not-enter-state'
  const serviceNames = ['web', 'cron', 'miniflux', 'searxng'] as const
  const adapters = Object.fromEntries(serviceNames.map(name => [name, {
    async start(context: { ports: Record<string, number> }) {
      events.push(`start:${name}`)
      if (options.partialStartService === name) {
        const error = new Error('internal cleanup failed') as Error & { partialRecord?: object }
        error.partialRecord = processRecord(name, context.ports[name])
        throw error
      }
      if (options.failService === name) throw new Error(`${name} failed`)
      return processRecord(name, context.ports[name])
    },
    async stop() {
      events.push(`stop:${name}`)
      if (options.stopFailureService === name) throw new Error(`${name} stop failed`)
    },
    async status() {
      events.push(`status:${name}`)
      if (options.staleService === name) return { state: 'stale' as const }
      if (options.degradedService === name) return { state: 'degraded' as const }
      return { state: 'running' as const }
    },
  }]))

  const manager = createDevctlManager({
    rootDir: process.cwd(),
    runtimeDir,
    env: {
      DEVCTL_BASE_PORT: '5000',
      CRON_SECRET: fixtureMarker,
      BACKGROUND_JOB_TOKEN_SECRET: fixtureMarker,
      REPORTING_SEARXNG_SECRET: fixtureMarker,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8000',
    },
    adapters,
    portAllocator: async () => 5000,
    dependencyProbes: Object.freeze({
      miniflux: async () => ({
        name: 'miniflux', state: 'running', ownership: 'external', url: 'https://feeds.example',
      }),
      searxng: async () => ({
        name: 'searxng', state: 'unreachable', ownership: 'external', url: 'https://search.example',
      }),
      supabase: async () => ({ name: 'supabase', state: 'unconfigured', ownership: 'external' }),
    }),
  })
  return { manager, runtimeDir, events, fixtureMarker }
}

function processRecord(name: string, port: number) {
  const pid = name === 'web' ? 20_001 : 20_002
  return {
    kind: 'process',
    pid,
    pgid: pid,
    startTime: '1',
    commandHash: 'a'.repeat(64),
    port,
  }
}
