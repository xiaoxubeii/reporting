import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { assertSafeEmailHeader, normalizeUserMailboxLocalPart } from './domain'
import { FundEmailError } from './errors'

export type SharedMailboxKind = 'pitch' | 'expert'

export interface FundEmailMailbox {
  id: string
  fundId: string
  localPart: string
  displayName: string
  kind: 'user' | 'pitch' | 'expert' | 'shared'
  userId: string | null
  active: boolean
}

export interface FundEmailMailboxStore {
  hasMembership(fundId: string, userId: string): Promise<boolean>
  ensureReserved(fundId: string): Promise<void>
  setUserMailbox(input: {
    fundId: string
    userId: string
    localPart: string
    displayName: string
  }): Promise<FundEmailMailbox>
  getUserMailbox(fundId: string, userId: string): Promise<FundEmailMailbox | null>
  getSharedMailbox(fundId: string, localPart: SharedMailboxKind): Promise<FundEmailMailbox | null>
}

interface MailboxDependencies {
  store?: FundEmailMailboxStore
}

export async function ensureReservedFundMailboxes(
  admin: SupabaseClient<Database>,
  fundId: string,
  dependencies: MailboxDependencies = {},
): Promise<void> {
  await (dependencies.store ?? createSupabaseFundEmailMailboxStore(admin)).ensureReserved(fundId)
}

export async function setCurrentUserMailbox(
  admin: SupabaseClient<Database>,
  params: { fundId: string; userId: string; localPart: string; displayName: string },
  dependencies: MailboxDependencies = {},
): Promise<FundEmailMailbox> {
  const store = dependencies.store ?? createSupabaseFundEmailMailboxStore(admin)
  await requireMembership(store, params.fundId, params.userId)
  const localPart = normalizeUserMailboxLocalPart(params.localPart)
  const displayName = assertSafeEmailHeader(params.displayName, 'sender name', 120)
  return store.setUserMailbox({ ...params, localPart, displayName })
}

export async function resolveFundSenderMailbox(
  admin: SupabaseClient<Database>,
  params: { fundId: string; userId: string; fallback: SharedMailboxKind },
  dependencies: MailboxDependencies = {},
): Promise<FundEmailMailbox> {
  const store = dependencies.store ?? createSupabaseFundEmailMailboxStore(admin)
  await requireMembership(store, params.fundId, params.userId)
  const owned = await store.getUserMailbox(params.fundId, params.userId)
  if (owned?.active && owned.kind === 'user') return owned

  let fallback = await store.getSharedMailbox(params.fundId, params.fallback)
  if (!fallback) {
    await store.ensureReserved(params.fundId)
    fallback = await store.getSharedMailbox(params.fundId, params.fallback)
  }
  if (!fallback?.active || fallback.fundId !== params.fundId) {
    throw new FundEmailError('storage_unavailable', 'Fund sender mailbox is unavailable.', 503)
  }
  return fallback
}

async function requireMembership(
  store: FundEmailMailboxStore,
  fundId: string,
  userId: string,
): Promise<void> {
  if (!await store.hasMembership(fundId, userId)) {
    throw new FundEmailError('membership_required', 'Current Fund membership is required.', 403)
  }
}

export function createSupabaseFundEmailMailboxStore(admin: SupabaseClient<Database>): FundEmailMailboxStore {
  return {
    async hasMembership(fundId, userId) {
      const result = await admin
        .from('fund_members')
        .select('id')
        .eq('fund_id', fundId)
        .eq('user_id', userId)
        .maybeSingle()
      if (result.error) throw storageUnavailable()
      return Boolean(result.data)
    },
    async ensureReserved(fundId) {
      const result = await admin.rpc('fund_email_ensure_reserved_mailboxes', {
        p_fund_id: fundId,
      })
      if (result.error) throw storageUnavailable()
    },
    async setUserMailbox(input) {
      const result = await admin.rpc('fund_email_set_user_mailbox', {
        p_fund_id: input.fundId,
        p_user_id: input.userId,
        p_local_part: input.localPart,
        p_display_name: input.displayName,
      })
      if (result.error) {
        if (result.error.code === '23505') {
          throw new FundEmailError('connection_conflict', 'This mailbox name is unavailable.', 409)
        }
        if (result.error.code === '42501') {
          throw new FundEmailError('membership_required', 'Current Fund membership is required.', 403)
        }
        throw storageUnavailable()
      }
      if (!result.data) throw storageUnavailable()
      return mapMailbox(result.data)
    },
    async getUserMailbox(fundId, userId) {
      const result = await admin
        .from('fund_email_mailboxes')
        .select(MAILBOX_COLUMNS)
        .eq('fund_id', fundId)
        .eq('user_id', userId)
        .eq('kind', 'user')
        .maybeSingle()
      if (result.error) throw storageUnavailable()
      return result.data ? mapMailbox(result.data) : null
    },
    async getSharedMailbox(fundId, localPart) {
      const result = await admin
        .from('fund_email_mailboxes')
        .select(MAILBOX_COLUMNS)
        .eq('fund_id', fundId)
        .eq('local_part', localPart)
        .eq('kind', localPart)
        .maybeSingle()
      if (result.error) throw storageUnavailable()
      return result.data ? mapMailbox(result.data) : null
    },
  }
}

const MAILBOX_COLUMNS = 'id,fund_id,local_part,display_name,kind,user_id,active' as const

type MailboxProjection = Pick<
  Database['public']['Tables']['fund_email_mailboxes']['Row'],
  'id' | 'fund_id' | 'local_part' | 'display_name' | 'kind' | 'user_id' | 'active'
>

function mapMailbox(row: MailboxProjection): FundEmailMailbox {
  return {
    id: row.id,
    fundId: row.fund_id,
    localPart: row.local_part,
    displayName: row.display_name,
    kind: assertMailboxKind(row.kind),
    userId: row.user_id,
    active: row.active,
  }
}

function assertMailboxKind(value: string): FundEmailMailbox['kind'] {
  if (value === 'user' || value === 'pitch' || value === 'expert' || value === 'shared') return value
  throw storageUnavailable()
}

function storageUnavailable(): FundEmailError {
  return new FundEmailError('storage_unavailable', 'Fund email storage is unavailable.', 503)
}
