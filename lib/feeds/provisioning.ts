import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import {
  assertMinifluxAccountAvailable,
  getMinifluxCredential,
  saveMinifluxCredential,
} from './credentials'
import { configuredMinifluxBaseUrl, loadMinifluxProvisionerToken } from './config'
import { MinifluxClient } from './miniflux/client'
import { MinifluxProvisioner } from './miniflux/provisioning'
import { FeedApiError } from './errors'
import { claimMinifluxProvisioningLease, releaseMinifluxProvisioningLease } from './provisioning-lease'

export async function ensureMinifluxConnection(
  admin: SupabaseClient,
  userId: string,
): Promise<{ externalUserId: number; username: string }> {
  const baseUrl = configuredMinifluxBaseUrl(true)
  const existing = await validExistingConnection(admin, userId, baseUrl)
  if (existing) return existing

  const ownerId = randomUUID()
  const acquired = await claimMinifluxProvisioningLease(admin, { userId, ownerId })
  if (!acquired) {
    const completed = await validExistingConnection(admin, userId, baseUrl)
    if (completed) return completed
    throw new FeedApiError('upstream', 409, 'Feed account provisioning is already in progress. Retry shortly.')
  }

  try {
    const completed = await validExistingConnection(admin, userId, baseUrl)
    if (completed) return completed
    const provisioner = new MinifluxProvisioner({
      baseUrl,
      provisionerToken: await loadMinifluxProvisionerToken(),
    })
    const provisioned = await provisioner.provision(userId)
    await assertMinifluxAccountAvailable(admin, userId, provisioned.externalUserId)
    await saveMinifluxCredential(admin, { userId, ...provisioned })
    return { externalUserId: provisioned.externalUserId, username: provisioned.username }
  } finally {
    await releaseMinifluxProvisioningLease(admin, { userId, ownerId }).catch(() => {
      console.error('[feeds] unable to release provisioning lease')
    })
  }
}

async function validExistingConnection(
  admin: SupabaseClient,
  userId: string,
  baseUrl: string,
): Promise<{ externalUserId: number; username: string } | null> {
  const existing = await getMinifluxCredential(admin, userId)
  if (!existing) return null
  try {
    const verified = await new MinifluxClient({ baseUrl, apiKey: existing.apiToken }).verifyConnection()
    return !verified.isAdmin && verified.id === existing.externalUserId && verified.username === existing.username
      ? { externalUserId: verified.id, username: verified.username }
      : null
  } catch {
    return null
  }
}
