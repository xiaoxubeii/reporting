import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from '@/lib/crypto'
import { FeedApiError } from './errors'

export interface MinifluxCredential {
  apiToken: string
  externalUserId: number
  username: string
  lastVerifiedAt: string | null
  lastError: string | null
}

const CIPHERTEXT_VERSION = 'v1'

export async function assertMinifluxAccountAvailable(
  admin: SupabaseClient,
  userId: string,
  externalUserId: number,
): Promise<void> {
  const { data, error } = await admin.from('miniflux_connections')
    .select('user_id')
    .eq('external_user_id', externalUserId)
    .neq('user_id', userId)
    .maybeSingle()
  if (error) throw connectionStorageError(error, 'Unable to check feed account ownership')
  if (data) {
    throw new FeedApiError('invalid_request', 409, 'This Miniflux account is already connected to another Reporting user.')
  }
}

export async function saveMinifluxCredential(
  admin: SupabaseClient,
  params: { userId: string; apiToken: string; externalUserId: number; username: string },
): Promise<void> {
  const apiToken = params.apiToken.trim()
  const externalUserId = params.externalUserId
  const username = params.username.trim()
  if (!apiToken || apiToken.length > 2048) {
    throw new FeedApiError('invalid_request', 400, 'A valid Miniflux API token is required.')
  }
  if (!Number.isSafeInteger(externalUserId) || externalUserId <= 0 || !username) {
    throw new Error('Verified Miniflux user metadata is required')
  }

  const now = new Date().toISOString()
  const associatedData = credentialAssociatedData(params.userId, externalUserId)
  const { error } = await admin.from('miniflux_connections').upsert({
    user_id: params.userId,
    api_token_encrypted: `${CIPHERTEXT_VERSION}:${encrypt(apiToken, encryptionKey(), associatedData)}`,
    external_user_id: externalUserId,
    username,
    last_verified_at: now,
    last_error: null,
    updated_at: now,
  } as never, { onConflict: 'user_id' })
  if (error) {
    if (isMissingConnectionsTable(error)) throw connectionStorageNotConfigured()
    if ((error as { code?: string }).code === '23505') {
      throw new FeedApiError('invalid_request', 409, 'This Miniflux account is already connected to another Reporting user.')
    }
    throw new Error(`Unable to save feed connection: ${error.message}`)
  }
}

export async function getMinifluxCredential(admin: SupabaseClient, userId: string): Promise<MinifluxCredential | null> {
  const { data, error } = await admin.from('miniflux_connections')
    .select('api_token_encrypted, external_user_id, username, last_verified_at, last_error')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    if (isMissingConnectionsTable(error)) return null
    throw new Error(`Unable to read feed connection: ${error.message}`)
  }
  if (!data) return null
  try {
    const row = data as unknown as Record<string, string | null>
    const externalUserId = positiveId(row.external_user_id)
    const username = row.username?.trim()
    if (!externalUserId || !username) return null
    const encrypted = String(row.api_token_encrypted)
    const prefix = `${CIPHERTEXT_VERSION}:`
    if (!encrypted.startsWith(prefix)) return null
    return {
      apiToken: decrypt(
        encrypted.slice(prefix.length),
        encryptionKey(),
        credentialAssociatedData(userId, externalUserId),
      ),
      externalUserId,
      username,
      lastVerifiedAt: row.last_verified_at ?? null,
      lastError: row.last_error ?? null,
    }
  } catch {
    return null
  }
}

export async function getMinifluxConnectionMetadata(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin.from('miniflux_connections')
    .select('username, last_verified_at, last_error')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    if (isMissingConnectionsTable(error)) {
      return { connected: false, username: null, lastVerifiedAt: null, lastError: null }
    }
    throw new Error(`Unable to read feed connection: ${error.message}`)
  }
  const row = data as unknown as Record<string, string | null> | null
  return row ? {
    connected: true,
    username: row.username ?? null,
    lastVerifiedAt: row.last_verified_at ?? null,
    lastError: row.last_error ?? null,
  } : { connected: false, username: null, lastVerifiedAt: null, lastError: null }
}

export async function deleteMinifluxCredential(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.from('miniflux_connections').delete().eq('user_id', userId)
  if (error) throw connectionStorageError(error, 'Unable to delete feed connection')
}

function encryptionKey(): string {
  const value = process.env.ENCRYPTION_KEY
  if (!value) throw new FeedApiError('internal', 500, 'Feed credential encryption is not configured.')
  return value
}

function positiveId(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function credentialAssociatedData(userId: string, externalUserId: number): string {
  return `miniflux:${userId}:${externalUserId}:${CIPHERTEXT_VERSION}`
}

function isMissingConnectionsTable(error: { code?: string; message?: string }): boolean {
  return (error.code === 'PGRST205' || error.code === '42P01')
    && Boolean(error.message?.includes('miniflux_connections'))
}

function connectionStorageNotConfigured(): FeedApiError {
  return new FeedApiError(
    'not_configured',
    503,
    'Feed connection storage is not configured. Apply the Reporting Feeds migration.',
  )
}

function connectionStorageError(
  error: { code?: string; message?: string },
  context: string,
): Error {
  return isMissingConnectionsTable(error)
    ? connectionStorageNotConfigured()
    : new Error(`${context}: ${error.message ?? 'unknown database error'}`)
}
