import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalizeTimeZone, DEFAULT_TIME_ZONE } from '@/i18n/time-zone'
import type { Database } from '@/lib/types/database'
import { IdentityOnboardingError, identityStorageError } from './errors'

export interface PersonalProfile {
  fullName: string | null
  timeZone: string | null
}

function normalizeStoredTimeZone(value: string | null | undefined): string | null {
  if (value == null) return null
  return canonicalizeTimeZone(value) ?? DEFAULT_TIME_ZONE
}

export function normalizePersonalFullName(input: unknown): string {
  if (typeof input !== 'string') {
    throw new IdentityOnboardingError('invalid_profile', 'Enter your real name.', 400)
  }
  const fullName = input.normalize('NFKC').trim().replace(/[ \t]+/g, ' ')
  if (!fullName || fullName.length > 120 || /[\r\n\0-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(fullName)) {
    throw new IdentityOnboardingError('invalid_profile', 'Enter a valid real name.', 400)
  }
  return fullName
}

export async function loadPersonalProfile(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<PersonalProfile> {
  const result = await admin
    .from('user_profiles')
    .select('full_name, time_zone')
    .eq('user_id', userId)
    .maybeSingle()
  if (result.error) throw identityStorageError()
  return {
    fullName: result.data?.full_name ?? null,
    timeZone: normalizeStoredTimeZone(result.data?.time_zone),
  }
}

export async function savePersonalProfile(
  admin: SupabaseClient<Database>,
  params: { userId: string; fullName: unknown },
): Promise<Pick<PersonalProfile, 'fullName'>> {
  const fullName = normalizePersonalFullName(params.fullName)
  const result = await admin.rpc('update_user_profile', {
    p_user_id: params.userId,
    p_full_name: fullName,
  })
  if (result.error || !result.data) throw identityStorageError()
  return { fullName: result.data.full_name }
}

export async function savePersonalTimeZone(
  admin: SupabaseClient<Database>,
  params: { userId: string; timeZone: unknown },
): Promise<Pick<PersonalProfile, 'timeZone'>> {
  const timeZone = params.timeZone === null ? null : canonicalizeTimeZone(params.timeZone)
  if (params.timeZone !== null && timeZone === null) {
    throw new IdentityOnboardingError('invalid_profile', 'Select a valid time zone.', 400)
  }

  const result = await admin.rpc('update_user_time_zone', {
    p_user_id: params.userId,
    p_time_zone: timeZone,
  })
  if (result.error || !result.data) throw identityStorageError()
  return { timeZone: normalizeStoredTimeZone(result.data.time_zone) }
}
