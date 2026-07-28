import { loadMinifluxProvisionerToken } from '../../../lib/feeds/config'
import { managedMinifluxUsername } from '../../../lib/feeds/miniflux/provisioning'

export async function deleteLocalManagedMinifluxUser(userId: string): Promise<void> {
  const rawBaseUrl = process.env.MINIFLUX_BASE_URL?.trim()
  if (!rawBaseUrl) throw new Error('MINIFLUX_BASE_URL is required')
  const baseUrl = new URL(rawBaseUrl)
  if (!['127.0.0.1', 'localhost'].includes(baseUrl.hostname)) {
    throw new Error('E2E may only alter local Miniflux')
  }
  const token = await loadMinifluxProvisionerToken()
  const headers = { Accept: 'application/json', 'X-Auth-Token': token }
  const usersResponse = await fetch(new URL('/v1/users', baseUrl), { headers })
  if (!usersResponse.ok) throw new Error(`Unable to list local Miniflux users: ${usersResponse.status}`)
  const users = await usersResponse.json() as Array<{ id?: unknown; username?: unknown }>
  const user = users.find(candidate => candidate.username === managedMinifluxUsername(userId))
  if (!user || typeof user.id !== 'number') throw new Error('Managed Miniflux E2E user was not found')
  const deleted = await fetch(new URL(`/v1/users/${user.id}`, baseUrl), { method: 'DELETE', headers })
  if (!deleted.ok) throw new Error(`Unable to delete local Miniflux user: ${deleted.status}`)
}
