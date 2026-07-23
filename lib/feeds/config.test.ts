import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  automaticMinifluxProvisioningEnabled,
  loadMinifluxExploreToken,
  loadMinifluxExploreUserId,
  loadMinifluxProvisionerToken,
} from './config'

const original = { ...process.env }
const tempPaths: string[] = []

afterEach(async () => {
  process.env = { ...original }
  await Promise.all(tempPaths.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('Miniflux automatic provisioning configuration', () => {
  it('is opt-in and accepts a case-insensitive true value', () => {
    delete process.env.MINIFLUX_AUTO_PROVISION
    expect(automaticMinifluxProvisioningEnabled()).toBe(false)
    process.env.MINIFLUX_AUTO_PROVISION = ' TRUE '
    expect(automaticMinifluxProvisioningEnabled()).toBe(true)
  })

  it('prefers a mounted provisioner token file over the direct secret', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reporting-miniflux-'))
    tempPaths.push(directory)
    const tokenFile = join(directory, 'token')
    await writeFile(tokenFile, ' file-token \n', { mode: 0o600 })
    process.env.MINIFLUX_PROVISIONER_TOKEN_FILE = tokenFile
    process.env.MINIFLUX_PROVISIONER_TOKEN = 'direct-token'
    await expect(loadMinifluxProvisionerToken()).resolves.toBe('file-token')
  })

  it('fails with a safe configuration error when the secret file is unreadable', async () => {
    process.env.MINIFLUX_PROVISIONER_TOKEN_FILE = '/missing/reporting-miniflux-token'
    const error = await loadMinifluxProvisionerToken().catch(value => value)
    expect(error).toMatchObject({ code: 'not_configured', status: 503 })
    expect(error.message).not.toContain('/missing/')
  })
})

describe('Miniflux Explore collector configuration', () => {
  it('prefers a mounted collector token file over the direct secret', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reporting-miniflux-explore-'))
    tempPaths.push(directory)
    const tokenFile = join(directory, 'token')
    await writeFile(tokenFile, ' collector-file-token \n', { mode: 0o600 })
    process.env.MINIFLUX_EXPLORE_TOKEN_FILE = tokenFile
    process.env.MINIFLUX_EXPLORE_TOKEN = 'collector-direct-token'

    await expect(loadMinifluxExploreToken()).resolves.toBe('collector-file-token')
  })

  it.each([
    ['missing', undefined],
    ['empty', '   '],
    ['oversized', 's'.repeat(2049)],
  ])('fails safely when the collector token is %s', async (_label, token) => {
    delete process.env.MINIFLUX_EXPLORE_TOKEN_FILE
    if (token === undefined) delete process.env.MINIFLUX_EXPLORE_TOKEN
    else process.env.MINIFLUX_EXPLORE_TOKEN = token

    const error = await loadMinifluxExploreToken().catch(value => value)
    expect(error).toMatchObject({ code: 'not_configured', status: 503 })
    expect(error.message).toBe('Curated Explore is not configured.')
    expect(error.message).not.toContain(token?.slice(0, 20) ?? 'undefined')
  })

  it('does not leak an unreadable secret-file path or direct fallback token', async () => {
    process.env.MINIFLUX_EXPLORE_TOKEN_FILE = '/missing/private/collector-token'
    process.env.MINIFLUX_EXPLORE_TOKEN = 'must-not-be-used'

    const error = await loadMinifluxExploreToken().catch(value => value)
    expect(error).toMatchObject({ code: 'not_configured', status: 503 })
    expect(error.message).not.toContain('/missing/')
    expect(error.message).not.toContain('must-not-be-used')
  })

  it('requires the exact configured non-admin collector user id', () => {
    process.env.MINIFLUX_EXPLORE_USER_ID = '42'
    expect(loadMinifluxExploreUserId()).toBe(42)

    for (const value of ['', '0', '-1', '1.5', 'not-a-number']) {
      process.env.MINIFLUX_EXPLORE_USER_ID = value
      expect(() => loadMinifluxExploreUserId()).toThrowError(/Curated Explore is not configured/)
    }
  })

  it('rejects collector secret files that are not private regular files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reporting-miniflux-explore-permissions-'))
    tempPaths.push(directory)
    const tokenFile = join(directory, 'token')
    await writeFile(tokenFile, 'collector-token', { mode: 0o644 })
    await chmod(tokenFile, 0o644)
    process.env.MINIFLUX_EXPLORE_TOKEN_FILE = tokenFile

    await expect(loadMinifluxExploreToken()).rejects.toMatchObject({
      code: 'not_configured', status: 503,
    })
  })
})
