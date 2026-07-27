import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { IdentityOnboardingError, identityStorageError } from './errors'

export interface PersonalProfile {
  fullName: string | null
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
    .select('full_name')
    .eq('user_id', userId)
    .maybeSingle()
  if (result.error) throw identityStorageError()
  return { fullName: result.data?.full_name ?? null }
}

export async function savePersonalProfile(
  admin: SupabaseClient<Database>,
  params: { userId: string; fullName: unknown },
): Promise<PersonalProfile> {
  const fullName = normalizePersonalFullName(params.fullName)
  const result = await admin.rpc('update_user_profile', {
    p_user_id: params.userId,
    p_full_name: fullName,
  })
  if (result.error || !result.data) throw identityStorageError()
  return { fullName: result.data.full_name }
}
