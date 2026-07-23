import type { SupabaseClient } from '@supabase/supabase-js'
import { FeedApiError } from './errors'

export async function claimMinifluxProvisioningLease(
  admin: SupabaseClient,
  params: { userId: string; ownerId: string },
): Promise<boolean> {
  const { data, error } = await admin.rpc('try_claim_miniflux_provisioning_lease', {
    p_user_id: params.userId,
    p_owner_id: params.ownerId,
    p_ttl_seconds: 120,
  })
  if (error) throw leaseStorageError(error)
  return data === true
}

export async function releaseMinifluxProvisioningLease(
  admin: SupabaseClient,
  params: { userId: string; ownerId: string },
): Promise<void> {
  const { error } = await admin.rpc('release_miniflux_provisioning_lease', {
    p_user_id: params.userId,
    p_owner_id: params.ownerId,
  })
  if (error) throw leaseStorageError(error)
}

function leaseStorageError(error: { code?: string }): Error {
  if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') {
    return new FeedApiError(
      'not_configured',
      503,
      'Automatic feed account provisioning storage is not configured.',
    )
  }
  return new Error('Unable to coordinate feed account provisioning')
}
