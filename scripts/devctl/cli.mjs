#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildDefaultAdapters, platformHost } from './adapters.mjs'
import { createExternalDependencyProbes } from './dependencies.mjs'
import { createDevctlManager, normalizeServices, SERVICE_NAMES } from './manager.mjs'
import { readExistingSecret, readOrCreateSecret } from './runtime.mjs'

const ACTIONS = new Set(['start', 'stop', 'restart', 'status', 'logs'])

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const stdout = dependencies.stdout ?? process.stdout
  const stderr = dependencies.stderr ?? process.stderr
  const inheritedEnv = dependencies.env ?? process.env
  const rootDir = dependencies.rootDir ?? resolveRootDir()
  const parsed = parseArguments(argv)
  if (parsed.help) {
    stdout.write(usage())
    return 0
  }

  const runtimeDir = path.resolve(inheritedEnv.DEVCTL_RUNTIME_DIR ?? path.join(rootDir, '.devctl'))
  const envFile = path.join(rootDir, '.env.local')
  const exampleEnv = await readDotenvIfExists(path.join(rootDir, '.env.example'))
  const dotenv = filterDotenv(await readDotenvIfExists(envFile), new Set(Object.keys(exampleEnv)))
  const sourceEnv = { ...dotenv, ...inheritedEnv }
  const startsServices = parsed.action === 'start' || parsed.action === 'restart'
  const cronSecret = startsServices
    ? await readOrCreateSecret(runtimeDir, 'cron_secret', sourceEnv.CRON_SECRET)
    : await readExistingSecret(runtimeDir, 'cron_secret', sourceEnv.CRON_SECRET)
  const backgroundJobTokenSecret = startsServices
    ? await readOrCreateSecret(runtimeDir, 'background_job_token_secret', sourceEnv.BACKGROUND_JOB_TOKEN_SECRET)
    : await readExistingSecret(runtimeDir, 'background_job_token_secret', sourceEnv.BACKGROUND_JOB_TOKEN_SECRET)
  const env = Object.freeze({
    ...sourceEnv,
    ...(cronSecret ? { CRON_SECRET: cronSecret } : {}),
    ...(backgroundJobTokenSecret ? { BACKGROUND_JOB_TOKEN_SECRET: backgroundJobTokenSecret } : {}),
  })
  const adapters = dependencies.adapters ?? buildDefaultAdapters({ rootDir, runtimeDir, env })
  const manager = createDevctlManager({
    rootDir,
    runtimeDir,
    env,
    adapters,
    portAllocator: dependencies.portAllocator,
    dependencyProbes: dependencies.dependencyProbes ?? createExternalDependencyProbes(sourceEnv),
  })

  try {
    if (parsed.action === 'start') {
      const result = await manager.start(parsed.services)
      stdout.write(result.changed ? formatStarted(result.state, 'started', env) : 'All selected services are already running.\n')
      return 0
    }
    if (parsed.action === 'stop') {
      const result = await manager.stop(parsed.services)
      stdout.write(result.changed ? 'Selected services stopped.\n' : 'Selected services are already stopped.\n')
      return 0
    }
    if (parsed.action === 'restart') {
      const result = await manager.restart(parsed.services)
      stdout.write(formatStarted(result.state, 'restarted', env))
      return 0
    }
    if (parsed.action === 'status') {
      const status = await manager.status(parsed.services)
      stdout.write(formatStatus(status))
      return status.aggregate === 'running' ? 0 : status.aggregate === 'stopped' ? 3 : 1
    }
    const logs = await manager.logs(parsed.services)
    if (logs.length === 0) stdout.write('No devctl-managed logs are available.\n')
    else logs.forEach(entry => stdout.write(`== ${entry.name} ==\n${entry.text.trimEnd()}\n`))
    return 0
  } catch (error) {
    stderr.write(`devctl: ${safeMessage(error)}\n`)
    return 1
  }
}

export function parseArguments(argv) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    return Object.freeze({ help: true, action: null, services: SERVICE_NAMES })
  }
  const [action, ...serviceArgs] = argv
  if (!ACTIONS.has(action)) throw new Error(`Unknown action: ${action}`)
  if (serviceArgs.some(value => value.startsWith('-'))) {
    throw new Error(`Unknown option: ${serviceArgs.find(value => value.startsWith('-'))}`)
  }
  return Object.freeze({ help: false, action, services: normalizeServices(serviceArgs) })
}

export function formatStarted(state, verb = 'started', env = {}) {
  const host = platformHost(env)
  const lines = [
    `Reporting services ${verb} in port block ${state.basePort}-${state.basePort + 9}.`,
  ]
  for (const [name, port] of Object.entries(state.ports)) {
    if (state.services[name]) lines.push(`  ${name.padEnd(9)} http://${host}:${port}`)
  }
  return `${lines.join('\n')}\n`
}

function formatStatus(status) {
  const lines = [
    `Reporting devctl: ${status.aggregate}`,
    `Port block: ${status.basePort === null ? 'not allocated' : `${status.basePort}-${status.basePort + 9}`}`,
    'Service    State       PID      Port   Log',
  ]
  for (const service of status.services) {
    lines.push([
      service.name.padEnd(10),
      service.state.padEnd(11),
      String(service.pid ?? '-').padEnd(8),
      String(service.port ?? '-').padEnd(6),
      service.logPath,
    ].join(' '))
  }
  for (const dependency of status.dependencies) {
    const url = dependency.url ? ` ${dependency.url}` : ''
    lines.push(`${dependency.name.padEnd(10)} ${String(dependency.state).padEnd(11)} external${url}`)
  }
  return `${lines.join('\n')}\n`
}

export function parseDotenv(text) {
  const values = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const [, key, rawValue] = match
    values[key] = parseDotenvValue(rawValue)
  }
  return Object.freeze(values)
}

export function filterDotenv(values, allowedKeys) {
  return Object.freeze(Object.fromEntries(
    Object.entries(values).filter(([key]) => allowedKeys.has(key)),
  ))
}

function parseDotenvValue(rawValue) {
  const value = rawValue.trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1)
  return value.replace(/\s+#.*$/, '').trim()
}

async function readDotenvIfExists(filePath) {
  try {
    return parseDotenv(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return Object.freeze({})
    throw error
  }
}

function resolveRootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
}

function safeMessage(error) {
  return error instanceof Error ? error.message.replace(/[\r\n]+/g, ' ') : 'unexpected failure'
}

function usage() {
  return `Usage: ./devctl.sh <start|stop|restart|status|logs> [service ...]\n\nServices: ${SERVICE_NAMES.join(', ')}\nWithout service names, the action applies to all services.\nPort blocks begin at DEVCTL_BASE_PORT (default 5000) and advance by 10.\n`
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code }).catch(error => {
    process.stderr.write(`devctl: ${safeMessage(error)}\n`)
    process.exitCode = 1
  })
}
