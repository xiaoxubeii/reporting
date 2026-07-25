import type { SupabaseClient } from '@supabase/supabase-js'

import { createAdminClient } from '@/lib/supabase/admin'
import { backgroundJobPolicy, parseBackgroundJobPayload } from './registry'
import type { BackgroundJobActorType, BackgroundJobKind } from './types'

export type BackgroundJobToolCallClaim =
  | Readonly<{ state: 'claimed' }>
  | Readonly<{ state: 'cached'; status: 'completed' | 'failed'; response: unknown }>
  | Readonly<{ state: 'in_progress' | 'conflict' | 'limit' | 'inactive' }>

export interface ClaimedBackgroundJob {
  readonly id: string
  readonly kind: BackgroundJobKind
  readonly payload: unknown
  readonly fundId: string
  readonly actorType: BackgroundJobActorType
  readonly actorUserId: string | null
  readonly status: 'running'
  readonly attemptId: string
  readonly leaseExpiresAt: string
  readonly attempts: number
  readonly maxAttempts: number
}

export interface EnqueueBackgroundJobInput {
  readonly kind: BackgroundJobKind
  readonly payload: unknown
  readonly fundId: string
  readonly actor: Readonly<{ type: 'user'; userId: string }> | Readonly<{ type: 'system' }>
  readonly dedupeKey: string
  readonly availableAt?: Date
}

export interface FinalizeBackgroundJobInput {
  readonly jobId: string
  readonly attemptId: string
  readonly status: 'pending' | 'completed' | 'failed' | 'cancelled'
  readonly error?: string | null
  readonly retryAfterSeconds?: number
}

export async function enqueueBackgroundJob(
  input: EnqueueBackgroundJobInput,
  admin: SupabaseClient = createAdminClient(),
): Promise<{ readonly id: string; readonly status: string }> {
  const policy = backgroundJobPolicy(input.kind)
  const payload = parseBackgroundJobPayload(input.kind, input.payload)
  if (!policy.actors.includes(input.actor.type)) throw new Error('Background job actor is not allowed')
  if (!input.dedupeKey || input.dedupeKey.length > 240) throw new Error('Invalid background job dedupe key')

  const { data, error } = await admin.rpc('background_job_enqueue' as never, {
    p_kind: input.kind,
    p_payload: payload,
    p_fund_id: input.fundId,
    p_actor_type: input.actor.type,
    p_actor_user_id: input.actor.type === 'user' ? input.actor.userId : null,
    p_dedupe_key: input.dedupeKey,
    p_max_attempts: policy.maxAttempts,
    p_lease_seconds: policy.leaseSeconds,
    p_available_at: (input.availableAt ?? new Date()).toISOString(),
  } as never)
  if (error) throw error
  const row = data as unknown as { id?: unknown; status?: unknown } | null
  if (typeof row?.id !== 'string' || typeof row.status !== 'string') throw new Error('Background job enqueue returned no job')
  return Object.freeze({ id: row.id, status: row.status })
}

export async function claimDueBackgroundJobs(
  kinds: readonly BackgroundJobKind[],
  limit = 5,
  admin: SupabaseClient = createAdminClient(),
): Promise<readonly ClaimedBackgroundJob[]> {
  if (kinds.length < 1 || kinds.length > 100 || new Set(kinds).size !== kinds.length) {
    throw new Error('Invalid background job kinds')
  }
  for (const kind of kinds) backgroundJobPolicy(kind)
  const { data, error } = await admin.rpc('background_job_claim_due' as never, {
    p_kinds: kinds,
    p_limit: limit,
  } as never)
  if (error) throw error
  return Object.freeze(((data ?? []) as unknown[]).map(mapClaimedJob))
}

export async function finalizeBackgroundJob(
  input: FinalizeBackgroundJobInput,
  admin: SupabaseClient = createAdminClient(),
): Promise<boolean> {
  const { data, error } = await admin.rpc('background_job_finalize' as never, {
    p_job_id: input.jobId,
    p_attempt_id: input.attemptId,
    p_status: input.status,
    p_error: input.error ?? null,
    p_retry_after_seconds: input.retryAfterSeconds ?? 0,
  } as never)
  if (error) throw error
  return data === true
}

/** Atomically admit at most one HTTP worker request for a leased attempt. */
export async function claimBackgroundJobWorkerAttempt(
  input: Readonly<{ jobId: string; attemptId: string }>,
  admin: SupabaseClient = createAdminClient(),
): Promise<boolean> {
  const { data, error } = await admin.rpc('background_job_claim_worker_attempt' as never, {
    p_job_id: input.jobId,
    p_attempt_id: input.attemptId,
  } as never)
  if (error) throw error
  return data === true
}

export async function claimBackgroundJobToolCall(
  input: {
    readonly jobId: string
    readonly attemptId: string
    readonly toolName: string
    readonly toolCallId: string
    readonly requestHash: string
    readonly maxCalls: number
  },
  admin: SupabaseClient = createAdminClient(),
): Promise<BackgroundJobToolCallClaim> {
  const { data, error } = await admin.rpc('background_job_claim_tool_call' as never, {
    p_job_id: input.jobId,
    p_attempt_id: input.attemptId,
    p_tool_name: input.toolName,
    p_tool_call_id: input.toolCallId,
    p_request_hash: input.requestHash,
    p_max_calls: input.maxCalls,
  } as never)
  if (error) throw error
  const result = data as unknown as Record<string, unknown> | null
  if (!result || typeof result.state !== 'string') throw new Error('Invalid tool-call claim response')
  if (result.state === 'claimed') return Object.freeze({ state: 'claimed' })
  if (result.state === 'cached' && (result.status === 'completed' || result.status === 'failed')) {
    return Object.freeze({ state: 'cached', status: result.status as 'completed' | 'failed', response: result.response })
  }
  if (result.state === 'in_progress' || result.state === 'conflict' || result.state === 'limit' || result.state === 'inactive') {
    return Object.freeze({ state: result.state })
  }
  throw new Error('Invalid tool-call claim response')
}

export async function completeBackgroundJobToolCall(
  input: {
    readonly jobId: string
    readonly attemptId: string
    readonly toolName: string
    readonly toolCallId: string
    readonly requestHash: string
    readonly response: unknown
    readonly isError: boolean
  },
  admin: SupabaseClient = createAdminClient(),
): Promise<boolean> {
  const { data, error } = await admin.rpc('background_job_complete_tool_call' as never, {
    p_job_id: input.jobId,
    p_attempt_id: input.attemptId,
    p_tool_name: input.toolName,
    p_tool_call_id: input.toolCallId,
    p_request_hash: input.requestHash,
    p_response: input.response,
    p_is_error: input.isError,
  } as never)
  if (error) throw error
  return data === true
}

function mapClaimedJob(value: unknown): ClaimedBackgroundJob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid claimed background job')
  const row = value as Record<string, unknown>
  const kind = String(row.kind)
  const policy = backgroundJobPolicy(kind)
  parseBackgroundJobPayload(policy.kind, row.payload)
  if (row.status !== 'running' || typeof row.attempt_id !== 'string' || typeof row.lease_expires_at !== 'string') {
    throw new Error('Invalid claimed background job')
  }
  return Object.freeze({
    id: String(row.id),
    kind: policy.kind,
    payload: row.payload,
    fundId: String(row.fund_id),
    actorType: row.actor_type as BackgroundJobActorType,
    actorUserId: typeof row.actor_user_id === 'string' ? row.actor_user_id : null,
    status: 'running',
    attemptId: row.attempt_id,
    leaseExpiresAt: row.lease_expires_at,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
  })
}
