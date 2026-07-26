import { spawn } from 'node:child_process'
import { open } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'

import { processIdentityMatches, readProcessIdentity } from './runtime.mjs'

const DEFAULT_START_TIMEOUT_MS = 45_000
const DEFAULT_STOP_TIMEOUT_MS = 10_000

export function buildDefaultAdapters(options) {
  const { rootDir, runtimeDir, env } = options
  return Object.freeze({
    web: createProcessAdapter({
      name: 'web',
      rootDir,
      runtimeDir,
      command: process.execPath,
      args: context => [
        'node_modules/next/dist/bin/next',
        'dev',
        '--hostname', '127.0.0.1',
        '--port', String(context.ports.web),
      ],
      readinessUrl: context => `http://127.0.0.1:${context.ports.web}/`,
      ready: response => response.status < 500,
      env,
    }),
    cron: createProcessAdapter({
      name: 'cron',
      rootDir,
      runtimeDir,
      command: process.execPath,
      args: () => ['scripts/cron-runner/start.mjs'],
      readinessUrl: context => `http://127.0.0.1:${context.ports.cron}/readyz`,
      ready: response => response.status === 200,
      env,
      stopTimeoutMs: cronStopTimeout,
    }),
  })
}

function createProcessAdapter(options) {
  return Object.freeze({
    async start(context) {
      const logPath = path.join(options.runtimeDir, 'logs', `${options.name}.log`)
      const logHandle = await openSafeLog(logPath)
      const childEnv = { ...context.env, ...dynamicRuntimeEnv(context), NODE_ENV: 'development' }
      const child = spawn(options.command, options.args(context), {
        cwd: options.rootDir,
        env: childEnv,
        detached: true,
        stdio: ['ignore', logHandle.fd, logHandle.fd],
      })
      try {
        await new Promise((resolve, reject) => {
          child.once('spawn', resolve)
          child.once('error', reject)
        })
      } catch (error) {
        await logHandle.close()
        throw new Error(`${options.name} failed to spawn: ${error.message}`)
      }
      child.unref()
      await logHandle.close()
      const identity = await waitForIdentity(child.pid)
      if (!identity) throw new Error(`${options.name} exited before its process identity was recorded`)
      if (identity.pgid !== identity.pid) {
        await stopProcessGroupAfterFailedStart({ pgid: identity.pgid }, context.env)
        throw new Error(`${options.name} did not start in an isolated process group`)
      }
      const record = Object.freeze({
        kind: 'process',
        pid: identity.pid,
        pgid: identity.pgid,
        startTime: identity.startTime,
        commandHash: identity.commandHash,
        port: context.ports[options.name],
      })
      try {
        await waitForHttp(options.readinessUrl(context), options.ready, record, context.env)
      } catch (error) {
        try {
          await stopProcessGroupAfterFailedStart(record, context.env)
        } catch (cleanupError) {
          const failure = new Error(`${options.name} failed readiness: ${error.message}; cleanup failed: ${cleanupError.message}`)
          failure.partialRecord = record
          throw failure
        }
        throw new Error(`${options.name} failed readiness: ${error.message}`)
      }
      return record
    },

    async stop(record, context) {
      const minimumTimeout = typeof options.stopTimeoutMs === 'function'
        ? options.stopTimeoutMs(context.env)
        : options.stopTimeoutMs
      await stopOwnedProcess(record, context.env, minimumTimeout)
    },

    async status(record) {
      if (!await processIdentityMatches(record)) return Object.freeze({ state: 'stale' })
      try {
        const response = await fetch(options.readinessUrl({ ports: { [options.name]: record.port } }), {
          signal: AbortSignal.timeout(1_500),
          redirect: 'manual',
        })
        return Object.freeze({ state: options.ready(response) ? 'running' : 'degraded' })
      } catch {
        return Object.freeze({ state: 'degraded' })
      }
    },

    async logs() {
      return tailFile(path.join(options.runtimeDir, 'logs', `${options.name}.log`), options.runtimeDir)
    },
  })
}

function dynamicRuntimeEnv(context) {
  return Object.freeze({
    PORT: String(context.ports.web),
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${context.ports.web}`,
    NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${context.ports.web}`,
    FUND_WORKSPACE_DEV_PORT: String(context.ports.web),
    CRON_RUNNER_BASE_URL: `http://127.0.0.1:${context.ports.web}`,
    BACKGROUND_JOB_INTERNAL_ORIGIN: `http://127.0.0.1:${context.ports.web}`,
    CRON_RUNNER_HEALTH_HOST: '127.0.0.1',
    CRON_RUNNER_HEALTH_PORT: String(context.ports.cron),
  })
}

async function waitForIdentity(pid) {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    const identity = await readProcessIdentity(pid)
    if (identity) return identity
    await delay(20)
  }
  return null
}

async function waitForHttp(url, isReady, record, env) {
  const timeoutMs = parseBoundedInteger(env.DEVCTL_START_TIMEOUT_MS, DEFAULT_START_TIMEOUT_MS, 1_000, 300_000)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!await processIdentityMatches(record)) throw new Error('process exited')
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1_500),
        redirect: 'manual',
      })
      if (isReady(response)) return
    } catch {
      // Readiness is retried until the bounded deadline.
    }
    await delay(100)
  }
  throw new Error(`timed out waiting for ${url}`)
}

async function stopOwnedProcess(record, env, serviceTimeoutMs) {
  if (!await processIdentityMatches(record)) return
  await terminateProcessGroup(record, env, serviceTimeoutMs)
}

async function stopProcessGroupAfterFailedStart(record, env) {
  if (!processGroupExists(record.pgid)) return
  await terminateProcessGroup(record, env)
}

async function terminateProcessGroup(record, env, serviceTimeoutMs = DEFAULT_STOP_TIMEOUT_MS) {
  try {
    process.kill(-record.pgid, 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
  const requestedTimeout = parseBoundedInteger(env.DEVCTL_STOP_TIMEOUT_MS, serviceTimeoutMs, 100, 310_000)
  if (requestedTimeout < serviceTimeoutMs) {
    throw new Error(`DEVCTL_STOP_TIMEOUT_MS must be at least ${serviceTimeoutMs} for the selected service`)
  }
  const timeoutMs = requestedTimeout
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && processGroupExists(record.pgid)) await delay(50)
  if (!processGroupExists(record.pgid)) return
  try {
    process.kill(-record.pgid, 'SIGKILL')
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
}

function processGroupExists(pgid) {
  if (!Number.isInteger(pgid) || pgid <= 1) return false
  try {
    process.kill(-pgid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

async function tailFile(logPath, runtimeDir) {
  const expectedDirectory = path.resolve(runtimeDir, 'logs')
  if (path.dirname(path.resolve(logPath)) !== expectedDirectory) throw new Error('Refusing to read a log outside the devctl runtime')
  try {
    const handle = await open(logPath, constants.O_RDONLY | constants.O_NOFOLLOW)
    let value
    try {
      value = await handle.readFile('utf8')
    } finally {
      await handle.close()
    }
    const lines = value.split('\n')
    return lines.slice(-80).join('\n')
  } catch (error) {
    if (error?.code === 'ENOENT') return ''
    throw error
  }
}

async function openSafeLog(logPath) {
  return open(logPath, constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
}

export function composeServicesHealthy(rawOutput, requiredServices) {
  const trimmed = rawOutput.trim()
  if (!trimmed) return false
  let entries
  try {
    if (trimmed.startsWith('[')) entries = JSON.parse(trimmed)
    else entries = trimmed.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
  } catch {
    return false
  }
  return requiredServices.every(name => entries.some(entry => {
    const service = entry.Service ?? entry.service
    const state = String(entry.State ?? entry.state ?? '').toLowerCase()
    const health = String(entry.Health ?? entry.health ?? '').toLowerCase()
    return service === name && state === 'running' && health === 'healthy'
  }))
}

export function composePublishesPort(rawOutput, serviceName, expectedPort) {
  const entries = parseComposeOutput(rawOutput)
  if (!entries) return false
  const service = entries.find(entry => (entry.Service ?? entry.service) === serviceName)
  const publishers = service?.Publishers ?? service?.publishers
  return Array.isArray(publishers) && publishers.some(publisher => (
    Number(publisher.PublishedPort ?? publisher.publishedPort) === expectedPort
    && String(publisher.Protocol ?? publisher.protocol ?? 'tcp').toLowerCase() === 'tcp'
  ))
}

export function cronStopTimeout(runtimeEnv) {
  const graceMs = parseBoundedInteger(runtimeEnv.CRON_RUNNER_SHUTDOWN_GRACE_MS, 30_000, 100, 300_000)
  return graceMs + 5_000
}

function parseComposeOutput(rawOutput) {
  const trimmed = rawOutput.trim()
  if (!trimmed) return null
  try {
    return trimmed.startsWith('[')
      ? JSON.parse(trimmed)
      : trimmed.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
  } catch {
    return null
  }
}

function parseBoundedInteger(rawValue, fallback, min, max) {
  if (rawValue === undefined || rawValue === '') return fallback
  if (!/^\d+$/.test(String(rawValue))) throw new Error('devctl timeout must be an integer')
  const value = Number(rawValue)
  if (value < min || value > max) throw new Error(`devctl timeout must be between ${min} and ${max}`)
  return value
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export { dynamicRuntimeEnv }
