import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { MinifluxClient } from '@/lib/feeds/miniflux/client'
import { MinifluxProvisioner, managedMinifluxUsername } from '@/lib/feeds/miniflux/provisioning'

const enabled = process.env.MINIFLUX_INTEGRATION === 'true'
if (enabled) loadIntegrationEnvironment()
const reportingUserId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
let createdUserId: number | null = null

describe.runIf(enabled)('Miniflux provisioning integration', () => {
  it('creates one non-admin identity and reuses its API key on retry', async () => {
    const baseUrl = required('MINIFLUX_BASE_URL')
    const token = await provisionerToken()
    const provisioner = new MinifluxProvisioner({ baseUrl, provisionerToken: token })

    const first = await provisioner.provision(reportingUserId)
    createdUserId = first.externalUserId
    const second = await provisioner.provision(reportingUserId)
    const verified = await new MinifluxClient({ baseUrl, apiKey: second.apiToken }).verifyConnection()

    expect(second).toEqual(first)
    expect(verified).toEqual({
      id: first.externalUserId,
      username: managedMinifluxUsername(reportingUserId),
      isAdmin: false,
    })
  })
})

afterAll(async () => {
  if (!enabled || !createdUserId) return
  const response = await fetch(`${required('MINIFLUX_BASE_URL').replace(/\/+$/, '')}/v1/users/${createdUserId}`, {
    method: 'DELETE',
    redirect: 'manual',
    headers: { 'X-Auth-Token': await provisionerToken() },
  })
  if (!response.ok && response.status !== 404) throw new Error(`Disposable Miniflux cleanup failed: ${response.status}`)
})

async function provisionerToken(): Promise<string> {
  const file = process.env.MINIFLUX_PROVISIONER_TOKEN_FILE?.trim()
  const token = file ? (await readFile(file, 'utf8')).trim() : required('MINIFLUX_PROVISIONER_TOKEN')
  if (!token) throw new Error('Miniflux provisioner token is required')
  return token
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function loadIntegrationEnvironment(): void {
  const allowed = new Set([
    'MINIFLUX_BASE_URL',
    'MINIFLUX_ALLOW_INSECURE_HTTP',
    'MINIFLUX_PROVISIONER_TOKEN_FILE',
  ])
  for (const rawLine of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (!allowed.has(key) || process.env[key]) continue
    process.env[key] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
  }
}
