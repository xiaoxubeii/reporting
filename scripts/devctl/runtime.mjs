import { createHash, randomBytes } from 'node:crypto'
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  unlink,
} from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'

const STATE_VERSION = 1
const OWNER_MARKER = '.reporting-devctl-runtime'

export async function ensureRuntimeLayout(runtimeDir) {
  const resolved = path.resolve(runtimeDir)
  if (resolved === path.parse(resolved).root) throw new Error('Refusing to use a filesystem root as DEVCTL_RUNTIME_DIR')
  await ensureOwnedRuntimeDirectory(resolved)
  await Promise.all(['logs', 'secrets'].map(async name => {
    const directory = path.join(resolved, name)
    try {
      await mkdir(directory, { mode: 0o700 })
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
    await assertDirectory(directory, { ownerOnly: true })
    await chmod(directory, 0o700)
  }))
}

export async function readState(runtimeDir) {
  try {
    const statePath = path.join(runtimeDir, 'state.json')
    await assertRegularFile(statePath)
    const parsed = JSON.parse(await readSafeFile(statePath))
    if (!isState(parsed)) throw new Error('devctl state is invalid; inspect or remove the protected runtime state')
    return parsed
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    if (error instanceof SyntaxError) throw new Error('devctl state is corrupted; inspect or remove the protected runtime state')
    throw error
  }
}

export async function writeState(runtimeDir, state) {
  await ensureRuntimeLayout(runtimeDir)
  const target = path.join(runtimeDir, 'state.json')
  const temporary = path.join(runtimeDir, `.state.${process.pid}.${randomBytes(6).toString('hex')}.tmp`)
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify({ ...state, version: STATE_VERSION }, null, 2)}\n`, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(temporary, target)
  await chmod(target, 0o600)
}

export async function clearState(runtimeDir) {
  try {
    await unlink(path.join(runtimeDir, 'state.json'))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

export async function readOrCreateSecret(runtimeDir, name, suppliedValue) {
  if (typeof suppliedValue === 'string' && suppliedValue.trim().length >= 16) {
    return suppliedValue.trim()
  }
  await ensureRuntimeLayout(runtimeDir)
  const target = path.join(runtimeDir, 'secrets', name)
  try {
    await assertRegularFile(target, { ownerOnly: true })
    const existing = (await readSafeFile(target)).trim()
    if (existing.length >= 32) return existing
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const secret = randomBytes(32).toString('hex')
  const temporary = `${target}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
  try {
    await handle.writeFile(secret, 'utf8')
  } finally {
    await handle.close()
  }
  await rename(temporary, target)
  return secret
}

export async function readExistingSecret(runtimeDir, name, suppliedValue) {
  if (typeof suppliedValue === 'string' && suppliedValue.trim().length >= 16) {
    return suppliedValue.trim()
  }
  const target = path.join(runtimeDir, 'secrets', name)
  try {
    await assertRegularFile(target, { ownerOnly: true })
    const existing = (await readSafeFile(target)).trim()
    return existing.length >= 32 ? existing : undefined
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

export async function withRuntimeLock(runtimeDir, callback) {
  await ensureRuntimeLayout(runtimeDir)
  const lockDir = path.join(runtimeDir, 'lock')
  await acquireLock(lockDir)
  try {
    return await callback()
  } finally {
    await rm(lockDir, { recursive: true, force: true })
  }
}

async function acquireLock(lockDir) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await mkdir(lockDir, { mode: 0o700 })
      const handle = await open(path.join(lockDir, 'owner'), 'wx', 0o600)
      await handle.writeFile(String(process.pid), 'utf8')
      await handle.close()
      return
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      const owner = await readLockOwner(lockDir)
      if (owner && processExists(owner)) {
        throw new Error(`Another devctl command is running with PID ${owner}`)
      }
      await rm(lockDir, { recursive: true, force: true })
    }
  }
  throw new Error('Unable to acquire the devctl lifecycle lock')
}

async function readLockOwner(lockDir) {
  try {
    const value = (await readFile(path.join(lockDir, 'owner'), 'utf8')).trim()
    return /^\d+$/.test(value) && Number(value) > 1 ? Number(value) : null
  } catch {
    return null
  }
}

export async function readProcessIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return null
  try {
    const [statValue, commandValue] = await Promise.all([
      readFile(`/proc/${pid}/stat`, 'utf8'),
      readFile(`/proc/${pid}/cmdline`),
    ])
    const closingParenthesis = statValue.lastIndexOf(')')
    if (closingParenthesis < 0) return null
    const fields = statValue.slice(closingParenthesis + 2).trim().split(/\s+/)
    const startTime = fields[19]
    const pgid = Number(fields[2])
    if (!startTime || !Number.isInteger(pgid) || pgid <= 1) return null
    return Object.freeze({
      pid,
      pgid,
      startTime,
      commandHash: createHash('sha256').update(commandValue).digest('hex'),
    })
  } catch {
    return null
  }
}

export async function processIdentityMatches(record) {
  if (record?.kind !== 'process') return false
  const identity = await readProcessIdentity(record.pid)
  return Boolean(identity
    && identity.startTime === record.startTime
    && identity.commandHash === record.commandHash
    && identity.pgid === record.pgid
    && record.pgid === record.pid)
}

export function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function isState(value) {
  if (!value || typeof value !== 'object') return false
  if (Object.keys(value).some(key => !['version', 'rootDir', 'basePort', 'ports', 'services', 'createdAt'].includes(key))) return false
  if (value.version !== STATE_VERSION || typeof value.rootDir !== 'string') return false
  if (!Number.isInteger(value.basePort) || value.basePort < 1024 || value.basePort > 65_526) return false
  const names = ['web', 'cron', 'miniflux', 'searxng']
  if (!value.ports || Object.keys(value.ports).length !== names.length || names.some((name, offset) => value.ports[name] !== value.basePort + offset)) return false
  if (!value.services || typeof value.services !== 'object') return false
  return Object.entries(value.services).every(([name, record]) => names.includes(name) && isServiceRecord(record, value.ports[name]))
}

function isServiceRecord(record, expectedPort) {
  if (!record || typeof record !== 'object' || record.port !== expectedPort) return false
  if (record.kind === 'process') {
    return Object.keys(record).every(key => ['kind', 'pid', 'pgid', 'startTime', 'commandHash', 'port'].includes(key))
      && Number.isInteger(record.pid) && record.pid > 1
      && record.pgid === record.pid
      && /^\d+$/.test(record.startTime)
      && /^[0-9a-f]{64}$/.test(record.commandHash)
  }
  return record.kind === 'compose'
    && Object.keys(record).every(key => ['kind', 'project', 'port'].includes(key))
    && typeof record.project === 'string'
    && /^[a-z0-9][a-z0-9_-]{0,127}$/.test(record.project)
}

async function ensureOwnedRuntimeDirectory(directory) {
  let directoryCreated = false
  try {
    await assertDirectory(directory)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    await mkdir(directory, { recursive: true, mode: 0o700 })
    directoryCreated = true
  }
  await assertDirectory(directory, { ownerOnly: true })
  const markerPath = path.join(directory, OWNER_MARKER)
  if (directoryCreated) {
    const handle = await open(markerPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    await handle.writeFile('reporting-devctl-v1\n', 'utf8')
    await handle.close()
  }
  await assertRegularFile(markerPath, { ownerOnly: true })
  const marker = (await readSafeFile(markerPath)).trim()
  if (marker !== 'reporting-devctl-v1') throw new Error('DEVCTL_RUNTIME_DIR is not owned by Reporting devctl')
  if (directoryCreated) await chmod(directory, 0o700)
}

async function assertDirectory(target, options = {}) {
  const info = await lstat(target)
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Unsafe devctl directory: ${target}`)
  if (info.uid !== process.getuid?.()) throw new Error(`devctl directory is owned by another user: ${target}`)
  if (options.ownerOnly && (info.mode & 0o077) !== 0) throw new Error(`devctl directory permissions are too broad: ${target}`)
}

async function assertRegularFile(target, options = {}) {
  const info = await lstat(target)
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`Unsafe devctl file: ${target}`)
  if (info.uid !== process.getuid?.()) throw new Error(`devctl file is owned by another user: ${target}`)
  if (options.ownerOnly && (info.mode & 0o077) !== 0) throw new Error(`devctl file permissions are too broad: ${target}`)
}

async function readSafeFile(target) {
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    return await handle.readFile('utf8')
  } finally {
    await handle.close()
  }
}
