#!/usr/bin/env node

import { chmod, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = new Map(process.argv.slice(2).flatMap((value, index, values) => (
  value.startsWith('--') && values[index + 1] && !values[index + 1].startsWith('--')
    ? [[value.slice(2), values[index + 1]]]
    : []
)))
const baseUrl = (args.get('base-url') ?? process.env.MINIFLUX_BASE_URL ?? '').replace(/\/+$/, '')
const secretDir = resolve(args.get('secret-dir') ?? '.miniflux-secrets')
const tokenPath = resolve(args.get('output') ?? `${secretDir}/provisioner_token`)
const description = 'Reporting provisioner'

if (!/^https:\/\//.test(baseUrl) && !/^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(baseUrl)) {
  throw new Error('A valid HTTPS Miniflux URL or local 127.0.0.1 URL is required')
}

const username = (await readFile(`${secretDir}/admin_username`, 'utf8')).trim()
const password = (await readFile(`${secretDir}/admin_password`, 'utf8')).trim()
if (!username || !password) throw new Error('Miniflux bootstrap credentials are unavailable')
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    redirect: 'manual',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authorization,
    },
  })
  if (!response.ok) throw new Error(`Miniflux provisioner setup failed with status ${response.status}`)
  return response.status === 204 ? null : response.json()
}

const existing = await request('/v1/api-keys')
if (!Array.isArray(existing)) throw new Error('Miniflux returned an invalid API key list')
const key = existing.find(value => value?.description === description && typeof value?.token === 'string')
  ?? await request('/v1/api-keys', {
    method: 'POST',
    body: JSON.stringify({ description }),
  })
if (!key || typeof key.token !== 'string' || !key.token.trim()) {
  throw new Error('Miniflux did not return a provisioner API key')
}

await writeFile(tokenPath, key.token.trim(), { mode: 0o600 })
await chmod(tokenPath, 0o600)
process.stdout.write(`Miniflux provisioner token is ready at ${tokenPath} (mode 0600).\n`)
