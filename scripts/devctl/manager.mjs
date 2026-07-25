import { clearState, ensureRuntimeLayout, readState, withRuntimeLock, writeState } from './runtime.mjs'
import { findAvailablePortBlock, portMapForBase, validateBasePort } from './ports.mjs'
import { EXTERNAL_DEPENDENCY_NAMES } from './dependencies.mjs'
import path from 'node:path'

export const SERVICE_NAMES = Object.freeze(['web', 'cron'])
const START_ORDER = Object.freeze(['web', 'cron'])
const STOP_ORDER = Object.freeze([...START_ORDER].reverse())

export function createDevctlManager(options) {
  const {
    rootDir,
    runtimeDir,
    env = process.env,
    adapters,
    portAllocator = findAvailablePortBlock,
    dependencyProbes = {},
  } = options
  if (!rootDir || !runtimeDir) throw new Error('rootDir and runtimeDir are required')
  for (const name of SERVICE_NAMES) {
    if (!adapters?.[name]) throw new Error(`Missing service adapter: ${name}`)
  }

  async function start(requested = SERVICE_NAMES) {
    const selected = normalizeServices(requested)
    return withRuntimeLock(runtimeDir, async () => {
      await ensureRuntimeLayout(runtimeDir)
      const loadedState = await readState(runtimeDir)
      const existing = loadedState?.rootDir === rootDir ? loadedState : null
      const basePort = existing?.basePort ?? await portAllocator({
        startPort: validateBasePort(env.DEVCTL_BASE_PORT ?? 5000),
      })
      const ports = existing?.ports ?? portMapForBase(basePort)
      let state = existing ?? createEmptyState(rootDir, basePort, ports)
      const created = []
      let changed = false

      try {
        for (const name of START_ORDER.filter(value => selected.includes(value))) {
          const current = state.services[name]
          if (current) {
            const health = await adapters[name].status(current, createContext(state, env, runtimeDir))
            if (health.state === 'running') continue
            if (health.state === 'degraded') {
              await adapters[name].stop(current, createContext(state, env, runtimeDir))
            }
            state = removeService(state, name)
            await writeState(runtimeDir, state)
          }
          let record
          try {
            record = await adapters[name].start(createContext(state, env, runtimeDir))
          } catch (startError) {
            if (startError.partialRecord) {
              state = addService(state, name, startError.partialRecord)
              await writeState(runtimeDir, state)
            }
            throw startError
          }
          state = addService(state, name, record)
          created.push(name)
          changed = true
          await writeState(runtimeDir, state)
        }
        if (Object.keys(state.services).length > 0) await writeState(runtimeDir, state)
        return Object.freeze({ changed, state })
      } catch (error) {
        const rollbackFailures = []
        for (const name of [...created].reverse()) {
          try {
            await adapters[name].stop(state.services[name], createContext(state, env, runtimeDir))
            state = removeService(state, name)
          } catch (rollbackError) {
            rollbackFailures.push(`${name}: ${rollbackError.message}`)
          }
        }
        if (Object.keys(state.services).length === 0) await clearState(runtimeDir)
        else await writeState(runtimeDir, state)
        if (rollbackFailures.length > 0) {
          throw new Error(`${error.message}; rollback incomplete (${rollbackFailures.join('; ')})`)
        }
        throw error
      }
    })
  }

  async function stop(requested = SERVICE_NAMES) {
    const selected = normalizeServices(requested)
    return withRuntimeLock(runtimeDir, async () => {
      let state = await readState(runtimeDir)
      if (state?.rootDir !== rootDir) state = null
      if (!state) return Object.freeze({ changed: false, state: null })
      let changed = false
      for (const name of STOP_ORDER.filter(value => selected.includes(value))) {
        const record = state.services[name]
        if (!record) continue
        const health = await adapters[name].status(record, createContext(state, env, runtimeDir))
        if (health.state !== 'stale' && health.state !== 'stopped') {
          await adapters[name].stop(record, createContext(state, env, runtimeDir))
        }
        state = removeService(state, name)
        changed = true
        if (Object.keys(state.services).length > 0) await writeState(runtimeDir, state)
      }
      if (Object.keys(state.services).length === 0) {
        await clearState(runtimeDir)
        state = null
      }
      return Object.freeze({ changed, state })
    })
  }

  async function restart(requested = SERVICE_NAMES) {
    const selected = normalizeServices(requested)
    await stop(selected)
    return start(selected)
  }

  async function status(requested = SERVICE_NAMES) {
    const selected = normalizeServices(requested)
    const loadedState = await readState(runtimeDir)
    const state = loadedState?.rootDir === rootDir ? loadedState : null
    const context = state ? createContext(state, env, runtimeDir) : null
    const services = []
    for (const name of SERVICE_NAMES.filter(value => selected.includes(value))) {
      const record = state?.services?.[name]
      if (!record) {
        services.push(Object.freeze({
          name,
          state: 'stopped',
          port: state?.ports?.[name] ?? null,
          logPath: path.join(runtimeDir, 'logs', `${name}.log`),
        }))
        continue
      }
      const health = await adapters[name].status(record, context)
      services.push(Object.freeze({
        name,
        port: state.ports[name],
        logPath: path.join(runtimeDir, 'logs', `${name}.log`),
        ...recordSummary(record),
        ...health,
      }))
    }
    const states = services.map(service => service.state)
    const aggregate = states.every(value => value === 'running')
      ? 'running'
      : states.every(value => value === 'stopped' || value === 'stale')
        ? 'stopped'
        : 'degraded'
    const dependencies = await Promise.all(EXTERNAL_DEPENDENCY_NAMES.map(async name => {
      const probe = dependencyProbes[name]
      if (typeof probe !== 'function') return externalDependency(name, { state: 'unknown' })
      try {
        return externalDependency(name, await probe())
      } catch {
        return externalDependency(name, { state: 'unreachable' })
      }
    }))
    return Object.freeze({
      aggregate,
      basePort: state?.basePort ?? null,
      services: Object.freeze(services),
      dependencies: Object.freeze(dependencies),
    })
  }

  async function logs(requested = SERVICE_NAMES) {
    const selected = normalizeServices(requested)
    const loadedState = await readState(runtimeDir)
    const state = loadedState?.rootDir === rootDir ? loadedState : null
    if (!state) return []
    const context = createContext(state, env, runtimeDir)
    const entries = []
    for (const name of SERVICE_NAMES.filter(value => selected.includes(value))) {
      const record = state.services[name]
      if (!record) continue
      entries.push(Object.freeze({ name, text: await adapters[name].logs(record, context) }))
    }
    return entries
  }

  return Object.freeze({ start, stop, restart, status, logs })
}

function createEmptyState(rootDir, basePort, ports) {
  return Object.freeze({
    version: 2,
    rootDir,
    basePort,
    ports: { ...ports },
    services: {},
    createdAt: new Date().toISOString(),
  })
}

function externalDependency(name, result) {
  const state = typeof result?.state === 'string' ? result.state : 'unknown'
  const url = typeof result?.url === 'string' ? result.url : undefined
  return Object.freeze({
    name,
    state,
    ownership: 'external',
    ...(url ? { url } : {}),
  })
}

function addService(state, name, record) {
  return Object.freeze({
    ...state,
    services: { ...state.services, [name]: { ...record } },
  })
}

function removeService(state, name) {
  const services = Object.fromEntries(Object.entries(state.services).filter(([key]) => key !== name))
  return Object.freeze({ ...state, services })
}

function createContext(state, env, runtimeDir) {
  return Object.freeze({
    rootDir: state.rootDir,
    runtimeDir,
    basePort: state.basePort,
    ports: Object.freeze({ ...state.ports }),
    env,
  })
}

function recordSummary(record) {
  return record.kind === 'process' ? { pid: record.pid } : { pid: null }
}

export function normalizeServices(requested) {
  const values = Array.isArray(requested) && requested.length > 0 ? requested : SERVICE_NAMES
  const unique = [...new Set(values)]
  const invalid = unique.filter(name => !SERVICE_NAMES.includes(name))
  if (invalid.length > 0) throw new Error(`Unknown service: ${invalid.join(', ')}`)
  return unique
}
