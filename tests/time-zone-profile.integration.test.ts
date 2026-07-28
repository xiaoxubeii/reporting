import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

const enabled = process.env.TIME_ZONE_PROFILE_INTEGRATION === 'true'
if (enabled) loadIntegrationEnvironment()
const createdUserIds: string[] = []

describe.runIf(enabled)('timezone profile PostgreSQL integration', () => {
  it('preserves full_name, supports nullable service RPC updates, and denies cross-user writes', async () => {
    const admin = createAdminClient()
    const password = `Integration-${randomUUID()}!`
    const users = await Promise.all([0, 1].map(index => admin.auth.admin.createUser({
      email: `timezone-${index}-${randomUUID()}@example.invalid`, password, email_confirm: true,
    })))
    for (const result of users) {
      if (result.error || !result.data.user) throw new Error('Unable to create timezone integration user')
      createdUserIds.push(result.data.user.id)
    }
    const [ownerId, otherId] = createdUserIds
    const seededProfile = await admin.from('user_profiles').upsert({
      user_id: ownerId,
      full_name: 'Preserved Name',
    })
    expect(seededProfile.error).toBeNull()

    const manual = await admin.rpc('update_user_time_zone', { p_user_id: ownerId, p_time_zone: 'Asia/Shanghai' })
    expect(manual.error).toBeNull()
    expect(manual.data).toMatchObject({ full_name: 'Preserved Name', time_zone: 'Asia/Shanghai' })
    const automatic = await admin.rpc('update_user_time_zone', { p_user_id: ownerId, p_time_zone: null })
    expect(automatic.error).toBeNull()
    expect(automatic.data).toMatchObject({ full_name: 'Preserved Name', time_zone: null })

    const url = required('NEXT_PUBLIC_SUPABASE_URL')
    const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    const owner = createClient(url, anonKey)
    const other = createClient(url, anonKey)
    const [ownerSession, otherSession] = await Promise.all([
      owner.auth.signInWithPassword({ email: users[0].data.user!.email!, password }),
      other.auth.signInWithPassword({ email: users[1].data.user!.email!, password }),
    ])
    expect(ownerSession.error).toBeNull()
    expect(otherSession.error).toBeNull()
    expect((await owner.from('user_profiles').select('user_id,time_zone').eq('user_id', ownerId).single()).data?.user_id).toBe(ownerId)
    expect((await other.from('user_profiles').select('user_id').eq('user_id', ownerId)).data).toEqual([])
    expect((await owner.from('user_profiles').update({ time_zone: 'UTC' }).eq('user_id', ownerId)).error).not.toBeNull()
    expect((await owner.rpc('update_user_time_zone', { p_user_id: otherId, p_time_zone: 'UTC' })).error).not.toBeNull()
    await owner.auth.signOut(); await other.auth.signOut()
  })
})

afterAll(async () => {
  if (!enabled) return
  const admin = createAdminClient()
  for (const userId of createdUserIds.reverse()) await admin.auth.admin.deleteUser(userId)
})

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function loadIntegrationEnvironment(): void {
  const allowed = new Set(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])
  const environmentFile = process.env.TIME_ZONE_PROFILE_ENV_FILE ?? '.env.local'
  for (const rawLine of readFileSync(environmentFile, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (!allowed.has(key) || process.env[key]) continue
    process.env[key] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
  }
}
