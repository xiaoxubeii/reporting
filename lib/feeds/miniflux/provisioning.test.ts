import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MANAGED_API_KEY_DESCRIPTION,
  MinifluxProvisioner,
  managedMinifluxUsername,
} from './provisioning'

const REPORTING_USER_ID = '11111111-2222-4333-8444-555555555555'
const PERSONAL_CREDENTIAL = ['personal', 'credential'].join('-')
const EXISTING_CREDENTIAL = ['existing', 'credential'].join('-')
const ADMIN_CREDENTIAL = ['admin', 'credential'].join('-')

function response(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('Miniflux automatic provisioning', () => {
  it('derives a stable non-email username from the reporting user id', () => {
    const username = managedMinifluxUsername(REPORTING_USER_ID)
    expect(username).toMatch(/^reporting_[a-f0-9]{24}$/)
    expect(username).not.toContain('@')
    expect(managedMinifluxUsername(REPORTING_USER_ID)).toBe(username)
    expect(managedMinifluxUsername('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).not.toBe(username)
  })

  it('creates a non-admin user, signs in with a temporary password, and returns only the personal API key', async () => {
    const username = managedMinifluxUsername(REPORTING_USER_ID)
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.endsWith('/v1/users') && init.method === 'GET') return response([])
      if (url.endsWith('/v1/users') && init.method === 'POST') {
        expect(JSON.parse(String(init.body))).toMatchObject({ username, is_admin: false })
        return response({ id: 44, username, is_admin: false }, 201)
      }
      if (url.endsWith('/v1/api-keys') && init.method === 'GET') return response([])
      if (url.endsWith('/v1/api-keys') && init.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ description: MANAGED_API_KEY_DESCRIPTION })
        return response({ id: 8, user_id: 44, description: MANAGED_API_KEY_DESCRIPTION, token: PERSONAL_CREDENTIAL }, 201)
      }
      if (url.endsWith('/v1/me')) return response({ id: 44, username, is_admin: false })
      throw new Error(`Unexpected request: ${init.method} ${url}`)
    }))

    const result = await new MinifluxProvisioner({
      baseUrl: 'https://feeds.example.com',
      provisionerToken: ADMIN_CREDENTIAL,
    }).provision(REPORTING_USER_ID)

    expect(result).toEqual({ apiToken: PERSONAL_CREDENTIAL, externalUserId: 44, username })
    const adminCalls = calls.filter(call => call.url.endsWith('/v1/users'))
    expect(adminCalls.every(call => (call.init.headers as Record<string, string>)['X-Auth-Token'] === ADMIN_CREDENTIAL)).toBe(true)
    const userCalls = calls.filter(call => call.url.endsWith('/v1/api-keys'))
    expect(userCalls.every(call => (call.init.headers as Record<string, string>).Authorization?.startsWith('Basic '))).toBe(true)
    expect(JSON.stringify(calls.filter(call => !call.url.endsWith('/v1/me')))).not.toContain(PERSONAL_CREDENTIAL)
    expect(JSON.stringify(result)).not.toContain(ADMIN_CREDENTIAL)
  })

  it('reconciles an existing managed user and reuses its Reporting API key on retry', async () => {
    const username = managedMinifluxUsername(REPORTING_USER_ID)
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      if (url.endsWith('/v1/users') && init.method === 'GET') {
        return response([{ id: 44, username, is_admin: false }])
      }
      if (url.endsWith('/v1/users/44') && init.method === 'PUT') {
        return response({ id: 44, username, is_admin: false })
      }
      if (url.endsWith('/v1/api-keys') && init.method === 'GET') {
        return response([{ id: 8, user_id: 44, description: MANAGED_API_KEY_DESCRIPTION, token: EXISTING_CREDENTIAL }])
      }
      if (url.endsWith('/v1/me')) return response({ id: 44, username, is_admin: false })
      throw new Error(`Unexpected request: ${init.method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(new MinifluxProvisioner({
      baseUrl: 'https://feeds.example.com', provisionerToken: ADMIN_CREDENTIAL,
    }).provision(REPORTING_USER_ID)).resolves.toMatchObject({ apiToken: EXISTING_CREDENTIAL, externalUserId: 44 })

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/(users|api-keys)$/),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('fails with a safe error and never includes upstream bodies or administrator tokens', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error_message: `${ADMIN_CREDENTIAL} secret body` }, 500)))
    const error = await new MinifluxProvisioner({
      baseUrl: 'https://feeds.example.com', provisionerToken: ADMIN_CREDENTIAL,
    }).provision(REPORTING_USER_ID).catch(value => value)

    expect(error.message).not.toContain(ADMIN_CREDENTIAL)
    expect(error.message).not.toContain('secret body')
  })
})
