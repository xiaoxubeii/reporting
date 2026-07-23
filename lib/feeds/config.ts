import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { FeedApiError } from './errors'
import { normalizeMinifluxBaseUrl } from './url-policy'

export function automaticMinifluxProvisioningEnabled(): boolean {
  return process.env.MINIFLUX_AUTO_PROVISION?.trim().toLowerCase() === 'true'
}

export function configuredMinifluxBaseUrl(required: true): string
export function configuredMinifluxBaseUrl(required: false): string | null
export function configuredMinifluxBaseUrl(required: boolean): string | null {
  const raw = process.env.MINIFLUX_BASE_URL?.trim()
  const egressHardened = process.env.NODE_ENV !== 'production'
    || process.env.MINIFLUX_EGRESS_HARDENED === 'true'
  if (!raw || !egressHardened) return missingBaseUrl(required)
  try {
    return normalizeMinifluxBaseUrl(raw)
  } catch {
    return missingBaseUrl(required)
  }
}

export async function loadMinifluxProvisionerToken(): Promise<string> {
  const tokenFile = process.env.MINIFLUX_PROVISIONER_TOKEN_FILE?.trim()
  let token = ''
  if (tokenFile) {
    try {
      token = await readPrivateSecretFile(tokenFile)
    } catch {
      throw provisionerNotConfigured()
    }
  } else {
    token = process.env.MINIFLUX_PROVISIONER_TOKEN?.trim() ?? ''
  }
  if (!token || token.length > 2048) throw provisionerNotConfigured()
  return token
}

export async function loadMinifluxExploreToken(): Promise<string> {
  const tokenFile = process.env.MINIFLUX_EXPLORE_TOKEN_FILE?.trim()
  let token = ''
  if (tokenFile) {
    try {
      token = await readPrivateSecretFile(tokenFile)
    } catch {
      throw exploreNotConfigured()
    }
  } else {
    token = process.env.MINIFLUX_EXPLORE_TOKEN?.trim() ?? ''
  }
  if (!token || token.length > 2048) throw exploreNotConfigured()
  return token
}

export function loadMinifluxExploreUserId(): number {
  const raw = process.env.MINIFLUX_EXPLORE_USER_ID?.trim() ?? ''
  if (!/^\d+$/.test(raw)) throw exploreNotConfigured()
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) throw exploreNotConfigured()
  return value
}

async function readPrivateSecretFile(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.size > 4096 || (metadata.mode & 0o077) !== 0) {
      throw new Error('invalid secret file')
    }
    return (await handle.readFile('utf8')).trim()
  } finally {
    await handle.close()
  }
}

function missingBaseUrl(required: boolean): null {
  if (required) throw new FeedApiError('not_configured', 503, 'The feed service is not configured.')
  return null
}

function provisionerNotConfigured(): FeedApiError {
  return new FeedApiError(
    'not_configured',
    503,
    'Automatic feed account provisioning is not configured.',
  )
}

function exploreNotConfigured(): FeedApiError {
  return new FeedApiError('not_configured', 503, 'Curated Explore is not configured.')
}
