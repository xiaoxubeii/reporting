#!/usr/bin/env node

import { randomBytes } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = new Map(process.argv.slice(2).flatMap((value, index, values) => (
  value.startsWith('--') && values[index + 1] && !values[index + 1].startsWith('--')
    ? [[value.slice(2), values[index + 1]]]
    : []
)))
const baseUrl = (args.get('base-url') ?? process.env.MINIFLUX_BASE_URL ?? '').replace(/\/+$/, '')
const secretDir = resolve(args.get('secret-dir') ?? '.miniflux-secrets')
const provisionerTokenPath = resolve(args.get('provisioner-token-file') ?? `${secretDir}/provisioner_token`)
const outputPath = resolve(args.get('output') ?? `${secretDir}/explore_token`)
const username = 'reporting_explore'
const description = 'Reporting Explore'

if (!/^https:\/\//.test(baseUrl) && !/^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(baseUrl)) {
  throw new Error('A valid HTTPS Miniflux URL or local 127.0.0.1 URL is required')
}

const provisionerToken = (await readFile(provisionerTokenPath, 'utf8')).trim()
if (!provisionerToken || provisionerToken.length > 2048) {
  throw new Error('The Miniflux provisioner token is unavailable')
}

const temporaryPassword = randomBytes(32).toString('base64url')
const users = await request('/v1/users', { method: 'GET' }, {
  'X-Auth-Token': provisionerToken,
})
if (!Array.isArray(users)) throw new Error('Miniflux returned an invalid user list')

const existing = users.find(value => value?.username === username)
let user
if (existing) {
  if (existing.is_admin !== false || !positiveId(existing.id)) {
    throw new Error('The configured Explore username is not a valid non-admin user')
  }
  user = await request(`/v1/users/${encodeURIComponent(existing.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ password: temporaryPassword, is_admin: false }),
  }, { 'X-Auth-Token': provisionerToken })
} else {
  user = await request('/v1/users', {
    method: 'POST',
    body: JSON.stringify({ username, password: temporaryPassword, is_admin: false }),
  }, { 'X-Auth-Token': provisionerToken })
}

if (user?.username !== username || user?.is_admin !== false || !positiveId(user?.id)) {
  throw new Error('Miniflux returned an invalid Explore user')
}

const authorization = `Basic ${Buffer.from(`${username}:${temporaryPassword}`).toString('base64')}`
const keys = await request('/v1/api-keys', { method: 'GET' }, { Authorization: authorization })
if (!Array.isArray(keys)) throw new Error('Miniflux returned an invalid API key list')
const key = keys.find(value => (
  value?.user_id === user.id
  && value?.description === description
  && typeof value?.token === 'string'
)) ?? await request('/v1/api-keys', {
  method: 'POST',
  body: JSON.stringify({ description }),
}, { Authorization: authorization })

if (key?.user_id !== user.id || key?.description !== description || typeof key?.token !== 'string' || !key.token.trim()) {
  throw new Error('Miniflux returned an invalid Explore API key')
}

const verified = await request('/v1/me', { method: 'GET' }, {
  'X-Auth-Token': key.token.trim(),
})
if (verified?.id !== user.id || verified?.username !== username || verified?.is_admin !== false) {
  throw new Error('Miniflux did not verify the Explore non-admin identity')
}

await mkdir(secretDir, { recursive: true, mode: 0o700 })
await chmod(secretDir, 0o700)
const temporaryOutputPath = `${outputPath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`
try {
  const handle = await open(temporaryOutputPath, 'wx', 0o600)
  try {
    await handle.writeFile(key.token.trim(), 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(temporaryOutputPath, outputPath)
  await chmod(outputPath, 0o600)
} finally {
  await rm(temporaryOutputPath, { force: true })
}
process.stdout.write(`Miniflux Explore token is ready at ${outputPath} (mode 0600).\n`)
process.stdout.write(`Configure MINIFLUX_EXPLORE_USER_ID=${user.id}.\n`)

async function request(path, init, credentials) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...credentials,
      },
    })
    if (!response.ok) throw new Error(`Miniflux Explore setup failed with status ${response.status}`)
    return response.status === 204 ? null : await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function positiveId(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}
