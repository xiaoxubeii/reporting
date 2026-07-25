import type { SupabaseClient } from '@supabase/supabase-js'

import { hasAccess, loadAccessContext, type AccessContext } from '@/lib/access/effective'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSupabaseBackgroundJobResourceValidator } from './authority'
import { backgroundJobRegistry, type BackgroundJobRegistry } from './registry'
import { parseBearerJobToken, verifyBackgroundJobToken } from './token'
import type {
  BackgroundJobActorType,
  BackgroundJobAudience,
  BackgroundJobKind,
  BackgroundJobPayload,
  BackgroundJobScope,
} from './types'

export interface StoredBackgroundJob {
  readonly id: string
  readonly kind: string
  readonly payload: unknown
  readonly fundId: string
  readonly actorType: BackgroundJobActorType
  readonly actorUserId: string | null
  readonly status: string
  readonly attemptId: string | null
  readonly leaseExpiresAt: string | null
}

export interface BackgroundJobContextRepository {
  loadJob(jobId: string): Promise<StoredBackgroundJob | null>
  validateResource(input: Readonly<{
    kind: string
    payload: BackgroundJobPayload
    fundId: string
  }>): Promise<void>
  loadMembership(userId: string, fundId: string): Promise<{ readonly role: string } | null>
  loadAccess(fundId: string, userId: string, role: string): Promise<AccessContext>
}

export type BackgroundExecutionActor =
  | Readonly<{ type: 'user'; userId: string }>
  | Readonly<{ type: 'system' }>

export interface BackgroundExecutionContext {
  readonly jobId: string
  readonly attemptId: string
  readonly tokenId: string
  readonly audience: BackgroundJobAudience
  readonly scope: BackgroundJobScope
  readonly kind: BackgroundJobKind
  readonly fundId: string
  readonly actor: BackgroundExecutionActor
  readonly payload: BackgroundJobPayload
  readonly sourceMode: 'user' | 'public'
  readonly leaseExpiresAt: string
  readonly access: AccessContext | null
}

interface RequireBackgroundExecutionContextInput {
  readonly authorization: string | null
  readonly audience: BackgroundJobAudience
  readonly requiredScope: BackgroundJobScope
  readonly requiredKind?: BackgroundJobKind
  readonly now?: Date
  readonly secret?: string
  readonly repository?: BackgroundJobContextRepository
  readonly registry?: BackgroundJobRegistry
}

export async function requireBackgroundExecutionContext(
  input: RequireBackgroundExecutionContextInput,
): Promise<BackgroundExecutionContext> {
  try {
    const token = parseBearerJobToken(input.authorization)
    const verified = await verifyBackgroundJobToken(token, {
      audience: input.audience,
      now: input.now,
      secret: input.secret,
    })
    return await restoreLiveContext({
      jobId: verified.jobId,
      attemptId: verified.attemptId,
      tokenId: verified.tokenId,
      audience: input.audience,
      requiredScope: input.requiredScope,
      requiredKind: input.requiredKind,
      now: input.now ?? new Date(),
      repository: input.repository ?? createSupabaseBackgroundJobContextRepository(),
      registry: input.registry ?? backgroundJobRegistry,
    })
  } catch {
    throw new Error('Background execution is not authorized')
  }
}

/** Re-resolve live authority immediately before a privileged side effect. */
export async function revalidateBackgroundExecutionContext(
  context: BackgroundExecutionContext,
  input: Readonly<{
    now?: Date
    repository?: BackgroundJobContextRepository
    registry?: BackgroundJobRegistry
  }> = {},
): Promise<BackgroundExecutionContext> {
  try {
    const fresh = await restoreLiveContext({
      jobId: context.jobId,
      attemptId: context.attemptId,
      tokenId: context.tokenId,
      audience: context.audience,
      requiredScope: context.scope,
      requiredKind: context.kind,
      now: input.now ?? new Date(),
      repository: input.repository ?? createSupabaseBackgroundJobContextRepository(),
      registry: input.registry ?? backgroundJobRegistry,
    })
    if (
      fresh.kind !== context.kind
      || fresh.fundId !== context.fundId
      || !samePayload(fresh.payload, context.payload)
      || fresh.audience !== context.audience
      || fresh.scope !== context.scope
      || fresh.sourceMode !== context.sourceMode
      || fresh.actor.type !== context.actor.type
      || (fresh.actor.type === 'user' && (
        context.actor.type !== 'user' || fresh.actor.userId !== context.actor.userId
      ))
    ) {
      throw new Error('Execution authority changed')
    }
    return fresh
  } catch {
    throw new Error('Background execution is not authorized')
  }
}

async function restoreLiveContext(input: Readonly<{
  jobId: string
  attemptId: string
  tokenId: string
  audience: BackgroundJobAudience
  requiredScope: BackgroundJobScope
  requiredKind?: BackgroundJobKind
  now: Date
  repository: BackgroundJobContextRepository
  registry: BackgroundJobRegistry
}>): Promise<BackgroundExecutionContext> {
  const job = await input.repository.loadJob(input.jobId)
  if (!isCurrentAttempt(job, input.attemptId, input.now)) throw new Error('Inactive attempt')
  if (input.requiredKind !== undefined && job.kind !== input.requiredKind) throw new Error('Unexpected job kind')

  const policy = input.registry.get(job.kind)
  const hop = resolvePolicyHop(policy, input.audience, input.requiredScope)
  if (hop === 'worker' && input.tokenId !== input.attemptId) throw new Error('Worker token id is not attempt-bound')
  if (!policy.actors.includes(job.actorType)) throw new Error('Actor is not allowed')
  const payload = policy.parsePayload(job.payload)
  await input.repository.validateResource({ kind: policy.kind, payload, fundId: job.fundId })

  let actor: BackgroundExecutionActor
  let access: AccessContext | null = null
  let sourceMode: BackgroundExecutionContext['sourceMode']
  if (job.actorType === 'user') {
    if (!job.actorUserId) throw new Error('Missing user actor')
    const membership = await input.repository.loadMembership(job.actorUserId, job.fundId)
    if (!membership) throw new Error('Membership was revoked')
    const liveAccess = await input.repository.loadAccess(job.fundId, job.actorUserId, membership.role)
    access = liveAccess
    if (liveAccess.fundId !== job.fundId || liveAccess.userId !== job.actorUserId) throw new Error('Access context mismatch')
    if (!policy.requiredUserAccess.every(requirement => (
      hasAccess(liveAccess, requirement.domain, requirement.need, requirement.feature)
    ))) throw new Error('Required user access was revoked')
    actor = Object.freeze({ type: 'user', userId: job.actorUserId })
    sourceMode = policy.search?.allowPersonalSources ? 'user' : 'public'
  } else {
    if (job.actorUserId !== null) throw new Error('System work must not proxy a user')
    actor = Object.freeze({ type: 'system' })
    sourceMode = 'public'
  }

  return Object.freeze({
    jobId: job.id,
    attemptId: input.attemptId,
    tokenId: input.tokenId,
    audience: input.audience,
    scope: input.requiredScope,
    kind: policy.kind,
    fundId: job.fundId,
    actor,
    payload,
    sourceMode,
    leaseExpiresAt: job.leaseExpiresAt,
    access,
  })
}

function isCurrentAttempt(
  job: StoredBackgroundJob | null,
  attemptId: string,
  now: Date,
): job is StoredBackgroundJob & { readonly attemptId: string; readonly leaseExpiresAt: string } {
  if (!job || job.status !== 'running' || job.attemptId !== attemptId || !job.leaseExpiresAt) return false
  const leaseExpiresAt = Date.parse(job.leaseExpiresAt)
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt > now.getTime()
}

export function createSupabaseBackgroundJobContextRepository(
  admin: SupabaseClient = createAdminClient(),
): BackgroundJobContextRepository {
  const validateResource = createSupabaseBackgroundJobResourceValidator(admin)
  return {
    async loadJob(jobId) {
      const { data, error } = await admin
        .from('background_jobs' as never)
        .select('id, kind, payload, fund_id, actor_type, actor_user_id, status, attempt_id, lease_expires_at')
        .eq('id', jobId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as unknown as Record<string, unknown>
      return {
        id: String(row.id),
        kind: String(row.kind),
        payload: row.payload,
        fundId: String(row.fund_id),
        actorType: row.actor_type as BackgroundJobActorType,
        actorUserId: typeof row.actor_user_id === 'string' ? row.actor_user_id : null,
        status: String(row.status),
        attemptId: typeof row.attempt_id === 'string' ? row.attempt_id : null,
        leaseExpiresAt: typeof row.lease_expires_at === 'string' ? row.lease_expires_at : null,
      }
    },
    validateResource(input) {
      return validateResource(input)
    },
    async loadMembership(userId, fundId) {
      const { data, error } = await admin
        .from('fund_members')
        .select('role')
        .eq('user_id', userId)
        .eq('fund_id', fundId)
        .maybeSingle()
      if (error) throw error
      return data ? { role: data.role } : null
    },
    loadAccess(fundId, userId, role) {
      return loadAccessContext(admin, fundId, userId, role)
    },
  }
}

function resolvePolicyHop(
  policy: ReturnType<BackgroundJobRegistry['get']>,
  audience: BackgroundJobAudience,
  requiredScope: BackgroundJobScope,
): 'worker' | 'search' {
  if (policy.workerAudience === audience && policy.workerScope === requiredScope) return 'worker'
  if (policy.search?.audience === audience && policy.search.scope === requiredScope) return 'search'
  throw new Error('Background job hop is not registered')
}

function samePayload(left: BackgroundJobPayload, right: BackgroundJobPayload): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
