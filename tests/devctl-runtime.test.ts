import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  processIdentityMatches,
  readProcessIdentity,
  ensureRuntimeLayout,
  readState,
  withRuntimeLock,
} from '../scripts/devctl/runtime.mjs'
import { filterDotenv } from '../scripts/devctl/cli.mjs'

const temporaryDirectories = new Set<string>()
const childProcessGroups = new Set<number>()

afterEach(async () => {
  for (const pgid of Array.from(childProcessGroups)) {
    try { process.kill(-pgid, 'SIGKILL') } catch {}
  }
  childProcessGroups.clear()
  await Promise.all(Array.from(temporaryDirectories, directory => rm(directory, {
    recursive: true,
    force: true,
  })))
  temporaryDirectories.clear()
})

describe('devctl runtime safety', () => {
  it('validates PID start time and command identity before ownership', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true,
      stdio: 'ignore',
    })
    childProcessGroups.add(child.pid!)
    await once(child, 'spawn')
    const identity = await readProcessIdentity(child.pid!)
    expect(identity).not.toBeNull()

    const record = { kind: 'process', ...identity }
    expect(await processIdentityMatches(record)).toBe(true)
    expect(await processIdentityMatches({ ...record, startTime: '0' })).toBe(false)
    expect(await processIdentityMatches({ ...record, commandHash: 'foreign' })).toBe(false)
    expect(await processIdentityMatches({ ...record, pid: -1, pgid: -1 })).toBe(false)
  })

  it('allows only one concurrent lifecycle lock owner', async () => {
    const runtimeDir = await temporaryDirectory()
    let release!: () => void
    const held = withRuntimeLock(runtimeDir, () => new Promise<void>(resolve => { release = resolve }))
    await waitUntil(() => typeof release === 'function')

    await expect(withRuntimeLock(runtimeDir, async () => undefined)).rejects.toThrow(
      'Another devctl command is running',
    )
    release()
    await held
  })

  it('runs the real shell entrypoint for stopped status without starting services', async () => {
    const runtimeDir = await temporaryDirectory()
    const result = await runDevctl(['status', 'web'], runtimeDir)

    expect(result.exitCode).toBe(3)
    expect(result.stdout).toContain('Reporting devctl: stopped')
    expect(result.stdout).toContain('web')
    expect(result.stdout).toContain('supabase')
    expect(result.stderr).not.toContain('devctl:')
  })

  it('rejects unknown services through the real shell entrypoint', async () => {
    const runtimeDir = await temporaryDirectory()
    const result = await runDevctl(['start', 'database'], runtimeDir)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Unknown service: database')
  })

  it('refuses an existing unowned runtime directory and corrupted state', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'reporting-devctl-unowned-'))
    temporaryDirectories.add(parent)
    await expect(ensureRuntimeLayout(parent)).rejects.toThrow()

    const runtimeDir = path.join(parent, 'owned')
    await ensureRuntimeLayout(runtimeDir)
    await writeFile(path.join(runtimeDir, 'state.json'), '{broken', { mode: 0o600 })
    await expect(readState(runtimeDir)).rejects.toThrow('state is corrupted')
  })

  it('carries only project-declared dotenv keys into child environments', () => {
    expect(filterDotenv({
      CRON_SECRET: 'allowed',
      NODE_OPTIONS: '--require=/tmp/evil.js',
      BASH_ENV: '/tmp/evil.sh',
    }, new Set(['CRON_SECRET']))).toEqual({ CRON_SECRET: 'allowed' })
  })
})

async function temporaryDirectory() {
  const parent = await mkdtemp(path.join(tmpdir(), 'reporting-devctl-runtime-'))
  temporaryDirectories.add(parent)
  return path.join(parent, 'runtime')
}

async function runDevctl(args: string[], runtimeDir: string) {
  const child = spawn(path.join(process.cwd(), 'devctl.sh'), args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DEVCTL_RUNTIME_DIR: runtimeDir,
      NEXT_PUBLIC_SUPABASE_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk.toString() })
  child.stderr.on('data', chunk => { stderr += chunk.toString() })
  const [exitCode] = await once(child, 'exit') as [number | null]
  return { exitCode, stdout, stderr }
}

async function waitUntil(predicate: () => boolean) {
  const deadline = Date.now() + 2_000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for predicate')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
