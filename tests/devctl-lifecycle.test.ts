import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createDevctlManager } from '../scripts/devctl/manager.mjs'
import { readState } from '../scripts/devctl/runtime.mjs'

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
    expect(fixture.events.filter(event => event.startsWith('start:'))).toHaveLength(4)

    const state = await readState(fixture.runtimeDir)
    expect(state?.basePort).toBe(5000)
    expect(state?.ports).toEqual({ web: 5000, cron: 5001, miniflux: 5002, searxng: 5003 })

    expect((await fixture.manager.stop()).changed).toBe(true)
    expect((await fixture.manager.stop()).changed).toBe(false)
    expect(fixture.events.filter(event => event.startsWith('stop:'))).toEqual([
      'stop:cron',
      'stop:web',
      'stop:searxng',
      'stop:miniflux',
    ])
  })

  it('rolls back only services created by a failed start in reverse order', async () => {
    const fixture = await createFixture({ failService: 'web' })

    await expect(fixture.manager.start()).rejects.toThrow('web failed')
    expect(fixture.events).toEqual([
      'start:miniflux',
      'start:searxng',
      'start:web',
      'stop:searxng',
      'stop:miniflux',
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
    const fixture = await createFixture({ failService: 'web', stopFailureService: 'searxng' })

    await expect(fixture.manager.start()).rejects.toThrow('rollback incomplete')
    const state = await readState(fixture.runtimeDir)
    expect(Object.keys(state?.services ?? {})).toEqual(['searxng'])
  })

  it('persists a partial adapter record when internal cleanup fails', async () => {
    const fixture = await createFixture({ partialStartService: 'miniflux' })

    await expect(fixture.manager.start(['miniflux'])).rejects.toThrow('internal cleanup failed')
    const state = await readState(fixture.runtimeDir)
    expect(Object.keys(state?.services ?? {})).toEqual(['miniflux'])
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

  it('reports running, degraded, stopped, and external Supabase separately', async () => {
    const fixture = await createFixture({ degradedService: 'cron' })
    await fixture.manager.start(['web', 'cron'])

    const status = await fixture.manager.status(['web', 'cron'])

    expect(status.aggregate).toBe('degraded')
    expect(status.services.map(service => [service.name, service.state])).toEqual([
      ['web', 'running'],
      ['cron', 'degraded'],
    ])
    expect(status.supabase.ownership).toBe('external')
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
        error.partialRecord = { kind: 'compose', project: `fixture-${name}`, port: context.ports[name] }
        throw error
      }
      if (options.failService === name) throw new Error(`${name} failed`)
      return { kind: 'compose', project: `fixture-${name}`, port: context.ports[name] }
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
      REPORTING_SEARXNG_SECRET: fixtureMarker,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8000',
    },
    adapters,
    portAllocator: async () => 5000,
    supabaseProbe: async () => ({ state: 'running', ownership: 'external' }),
  })
  return { manager, runtimeDir, events, fixtureMarker }
}
