import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'

const entrypoint = path.join(process.cwd(), 'scripts/cron-runner/start.mjs')
type SpawnedChild = ChildProcessByStdio<null, Readable, Readable>

const children = new Set<SpawnedChild>()
const servers = new Set<Server>()

afterEach(async () => {
  children.forEach(child => {
    if (child.exitCode === null) child.kill('SIGKILL')
  })
  children.clear()
  await Promise.all(Array.from(servers, server => closeServer(server)))
  servers.clear()
})

describe('Croner real Node.js entrypoint', () => {
  it('runs one named job through the actual authenticated HTTP path', async () => {
    const received: Array<{ method?: string; url?: string; authorization?: string }> = []
    const target = await listen(createServer((request, response) => {
      received.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
      })
      response.writeHead(204).end()
    }))
    const baseUrl = serverOrigin(target)
    const fixtureValue = ['entrypoint', 'probe', 'credential'].join('-')
    const child = runEntrypoint(['--run', 'affinity-sync'], {
      NODE_ENV: 'development',
      CRON_SECRET: fixtureValue,
      CRON_RUNNER_BASE_URL: baseUrl,
    })

    const result = await waitForExit(child)

    expect(result.exitCode).toBe(0)
    expect(received).toEqual([{
      method: 'GET',
      url: '/api/cron/affinity-sync',
      authorization: `Bearer ${fixtureValue}`,
    }])
    expect(result.stdout).toContain('cron.job.finished')
    expect(result.stdout).not.toContain(fixtureValue)
    expect(result.stderr).not.toContain(fixtureValue)
  })

  it('routes the discovery job through the real Croner bearer path', async () => {
    const received: Array<{ method?: string; url?: string; authorization?: string }> = []
    const target = await listen(createServer((request, response) => {
      received.push({ method: request.method, url: request.url, authorization: request.headers.authorization })
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        success: true,
        data: { state: 'published', summary: { scanned: 0, reused: 0, enriched: 0, classified: 0, published: 0, skipped: 0, failed: 0, expired: 0 } },
      }))
    }))
    const fixtureValue = ['discovery', 'cron', 'credential'].join('-')
    const child = runEntrypoint(['--run', 'feeds-discovery'], {
      NODE_ENV: 'development', CRON_SECRET: fixtureValue, CRON_RUNNER_BASE_URL: serverOrigin(target),
    })

    const result = await waitForExit(child)

    expect(result.exitCode).toBe(0)
    expect(received).toEqual([{ method: 'GET', url: '/api/cron/feeds-discovery', authorization: `Bearer ${fixtureValue}` }])
    expect(result.stdout).not.toContain(fixtureValue)
    expect(result.stderr).not.toContain(fixtureValue)
  })

  it('stays resident, serves health, and exits cleanly on SIGTERM', async () => {
    const target = await listen(createServer((_request, response) => {
      response.writeHead(204).end()
    }))
    const healthReservation = await listen(createServer())
    const healthPort = serverPort(healthReservation)
    await closeServer(healthReservation)
    servers.delete(healthReservation)

    const fixtureValue = ['resident', 'probe', 'credential'].join('-')
    const child = runEntrypoint([], {
      NODE_ENV: 'development',
      CRON_SECRET: fixtureValue,
      CRON_RUNNER_BASE_URL: serverOrigin(target),
      CRON_RUNNER_HEALTH_HOST: '127.0.0.1',
      CRON_RUNNER_HEALTH_PORT: String(healthPort),
      CRON_RUNNER_SHUTDOWN_GRACE_MS: '500',
    })
    let stdout = ''
    child.stdout.on('data', chunk => { stdout += chunk.toString() })

    await waitUntil(() => stdout.includes('cron.runner.ready'), 5_000)
    const health = await fetch(`http://127.0.0.1:${healthPort}/healthz`)
    const readiness = await fetch(`http://127.0.0.1:${healthPort}/readyz`)

    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ status: 'ok' })
    expect(readiness.status).toBe(200)
    expect(await readiness.json()).toEqual({ status: 'ready' })

    child.kill('SIGTERM')
    const [exitCode, signal] = await once(child, 'exit') as [number | null, NodeJS.Signals | null]

    expect(exitCode).toBe(0)
    expect(signal).toBeNull()
    expect(stdout).toContain('cron.runner.stopped')
    expect(stdout).not.toContain(fixtureValue)
  })
})

function runEntrypoint(args: string[], extraEnv: Record<string, string>) {
  const child = spawn(process.execPath, [entrypoint, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  child.once('exit', () => children.delete(child))
  return child
}

async function listen(server: Server) {
  servers.add(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server
}

function serverPort(server: Server) {
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address')
  return address.port
}

function serverOrigin(server: Server) {
  return `http://127.0.0.1:${serverPort(server)}`
}

async function closeServer(server: Server) {
  if (!server.listening) return
  server.close()
  await once(server, 'close')
}

async function waitForExit(child: SpawnedChild) {
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk.toString() })
  child.stderr.on('data', chunk => { stderr += chunk.toString() })
  const [exitCode, signal] = await once(child, 'exit') as [number | null, NodeJS.Signals | null]
  return { exitCode, signal, stdout, stderr }
}

async function waitUntil(predicate: () => boolean, timeoutMs: number) {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for condition')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}
