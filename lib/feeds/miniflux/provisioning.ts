import { createHash, randomBytes } from 'node:crypto'
import { MinifluxClient, MinifluxError } from './client'
import { normalizeMinifluxBaseUrl } from '../url-policy'

export const MANAGED_API_KEY_DESCRIPTION = 'Reporting'

interface ProvisionerOptions {
  baseUrl: string
  provisionerToken: string
  timeoutMs?: number
}

interface MinifluxUser {
  id: number
  username: string
  isAdmin: boolean
}

export interface ProvisionedMinifluxCredential {
  apiToken: string
  externalUserId: number
  username: string
}

export function managedMinifluxUsername(reportingUserId: string): string {
  const digest = createHash('sha256').update(`reporting:${reportingUserId}`).digest('hex')
  return `reporting_${digest.slice(0, 24)}`
}

export class MinifluxProvisioner {
  private readonly baseUrl: string
  private readonly provisionerToken: string
  private readonly timeoutMs: number

  constructor(options: ProvisionerOptions) {
    this.baseUrl = normalizeMinifluxBaseUrl(options.baseUrl)
    this.provisionerToken = options.provisionerToken.trim()
    this.timeoutMs = options.timeoutMs ?? 10_000
    if (!this.provisionerToken) throw new Error('Miniflux provisioner token is required')
  }

  async provision(reportingUserId: string): Promise<ProvisionedMinifluxCredential> {
    const username = managedMinifluxUsername(reportingUserId)
    const temporaryPassword = randomBytes(32).toString('base64url')
    const users = await this.adminRequest('/v1/users', { method: 'GET' })
    if (!Array.isArray(users)) throw invalidResponse('user list')

    const existing = users.find(value => isRecord(value) && value.username === username)
    const user = existing
      ? await this.resetManagedUser(existing, username, temporaryPassword)
      : await this.createManagedUser(username, temporaryPassword)

    const authorization = `Basic ${Buffer.from(`${username}:${temporaryPassword}`).toString('base64')}`
    const keys = await this.userRequest('/v1/api-keys', authorization, { method: 'GET' })
    if (!Array.isArray(keys)) throw invalidResponse('API key list')
    const matchingKey = keys
      .map(apiKeyRecord)
      .find(key => key && key.userId === user.id && key.description === MANAGED_API_KEY_DESCRIPTION)
    const apiToken = matchingKey?.token ?? await this.createManagedApiKey(user.id, authorization)

    const verified = await new MinifluxClient({
      baseUrl: this.baseUrl,
      apiKey: apiToken,
      timeoutMs: this.timeoutMs,
    }).verifyConnection()
    if (verified.id !== user.id || verified.username !== username || verified.isAdmin) {
      throw invalidResponse('managed user identity')
    }
    return { apiToken, externalUserId: verified.id, username: verified.username }
  }

  private async createManagedUser(username: string, password: string): Promise<MinifluxUser> {
    const value = await this.adminRequest('/v1/users', {
      method: 'POST',
      body: JSON.stringify({ username, password, is_admin: false }),
    })
    return managedUser(value, username, false)
  }

  private async resetManagedUser(value: unknown, username: string, password: string): Promise<MinifluxUser> {
    const current = managedUser(value, username)
    if (current.isAdmin) throw invalidResponse('managed user role')
    const updated = await this.adminRequest(`/v1/users/${encodeURIComponent(current.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ password, is_admin: false }),
    })
    return managedUser(updated, username, false)
  }

  private async createManagedApiKey(userId: number, authorization: string): Promise<string> {
    const value = await this.userRequest('/v1/api-keys', authorization, {
      method: 'POST',
      body: JSON.stringify({ description: MANAGED_API_KEY_DESCRIPTION }),
    })
    const key = apiKeyRecord(value)
    if (!key || key.userId !== userId || key.description !== MANAGED_API_KEY_DESCRIPTION) {
      throw invalidResponse('API key')
    }
    return key.token
  }

  private adminRequest(path: string, init: RequestInit): Promise<unknown> {
    return this.request(path, init, { 'X-Auth-Token': this.provisionerToken })
  }

  private userRequest(path: string, authorization: string, init: RequestInit): Promise<unknown> {
    return this.request(path, init, { Authorization: authorization })
  }

  private async request(path: string, init: RequestInit, credentials: Record<string, string>): Promise<unknown> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...credentials,
        },
      })
      if (!response.ok) throw errorForStatus(response.status)
      if (response.status === 204) return null
      try {
        return await response.json()
      } catch {
        throw invalidResponse('JSON')
      }
    } catch (error) {
      if (error instanceof MinifluxError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new MinifluxError('unavailable', 'Miniflux provisioning timed out')
      }
      throw new MinifluxError('unavailable', 'Miniflux provisioning is unavailable')
    } finally {
      clearTimeout(timeout)
    }
  }
}

function managedUser(value: unknown, expectedUsername: string, fallbackIsAdmin?: boolean): MinifluxUser {
  if (!isRecord(value)) throw invalidResponse('user')
  const id = positiveId(value.id)
  const username = scalarString(value.username)
  const isAdmin = typeof value.is_admin === 'boolean' ? value.is_admin : fallbackIsAdmin
  if (!id || username !== expectedUsername || typeof isAdmin !== 'boolean') throw invalidResponse('user')
  return { id, username, isAdmin }
}

function apiKeyRecord(value: unknown): { userId: number; description: string; token: string } | null {
  if (!isRecord(value)) return null
  const userId = positiveId(value.user_id)
  const description = scalarString(value.description)
  const token = scalarString(value.token)
  return userId && description && token ? { userId, description, token } : null
}

function errorForStatus(status: number): MinifluxError {
  if (status === 401 || status === 403) {
    return new MinifluxError('authentication', 'Miniflux provisioning authentication failed', status)
  }
  if (status === 429) return new MinifluxError('rate_limited', 'Miniflux provisioning rate limit reached', status)
  return new MinifluxError('upstream', 'Miniflux provisioning request failed', status)
}

function invalidResponse(resource: string): MinifluxError {
  return new MinifluxError('invalid_response', `Miniflux returned an invalid ${resource} response`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positiveId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function scalarString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
