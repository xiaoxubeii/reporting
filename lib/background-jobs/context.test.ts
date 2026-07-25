import { describe, expect, it, vi } from 'vitest'

import type { AccessContext } from '@/lib/access/effective'
import type { BackgroundJobRegistry } from './registry'
import { issueBackgroundJobToken } from './token'
import {
  revalidateBackgroundExecutionContext,
  requireBackgroundExecutionContext,
  type BackgroundJobContextRepository,
  type StoredBackgroundJob,
} from './context'

const SIGNING_KEY_FIXTURE = ['background-job-test', 'signing-key', '0123456789'].join('-')
const JOB_ID = '842e532a-b848-457a-9b8e-4d6d8da10caf'
const ATTEMPT_ID = '1cd393ce-753b-4021-9848-f41d5205a4c8'
const DEAL_ID = 'f13aa191-56ac-4fb8-8eaa-bce047791467'
const FUND_ID = '2621143a-c9c3-4079-b52d-a9a935332ff5'
const USER_ID = 'd5d51b4e-c84d-42d5-9aee-7eb69a062907'
const NOW = new Date('2026-07-25T13:00:00.000Z')

const ACCESS: AccessContext = {
  fundId: FUND_ID,
  userId: USER_ID,
  role: 'admin',
  features: { search: 'everyone' } as AccessContext['features'],
  grants: {},
  defaults: {},
}

const JOB: StoredBackgroundJob = {
  id: JOB_ID,
  kind: 'deal_research',
  payload: { dealId: DEAL_ID },
  fundId: FUND_ID,
  actorType: 'user',
  actorUserId: USER_ID,
  status: 'running',
  attemptId: ATTEMPT_ID,
  leaseExpiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
}

function repository(overrides: Partial<BackgroundJobContextRepository> = {}): BackgroundJobContextRepository {
  return {
    loadJob: vi.fn(async () => JOB),
    validateResource: vi.fn(async () => undefined),
    loadMembership: vi.fn(async () => ({ role: 'admin' })),
    loadAccess: vi.fn(async () => ACCESS),
    ...overrides,
  }
}

async function workerToken(overrides: Partial<Parameters<typeof issueBackgroundJobToken>[0]> = {}) {
  return issueBackgroundJobToken({
    jobId: JOB_ID,
    attemptId: ATTEMPT_ID,
    audience: 'reporting-deal-research-worker',
    tokenId: ATTEMPT_ID,
    leaseExpiresAt: new Date(NOW.getTime() + 300_000),
    now: NOW,
    secret: SIGNING_KEY_FIXTURE,
    ...overrides,
  })
}

describe('requireBackgroundExecutionContext', () => {
  it('restores an immutable user context from live job, resource, membership, and access state', async () => {
    const token = await workerToken()
    const context = await requireBackgroundExecutionContext({
      authorization: `Bearer ${token}`,
      audience: 'reporting-deal-research-worker',
      requiredScope: 'deal-research:execute',
      now: NOW,
      secret: SIGNING_KEY_FIXTURE,
      repository: repository(),
    })

    expect(context).toMatchObject({
      jobId: JOB_ID,
      attemptId: ATTEMPT_ID,
      kind: 'deal_research',
      fundId: FUND_ID,
      actor: { type: 'user', userId: USER_ID },
      payload: { dealId: DEAL_ID },
      sourceMode: 'public',
      audience: 'reporting-deal-research-worker',
      scope: 'deal-research:execute',
    })
    expect(Object.isFrozen(context)).toBe(true)
    expect(Object.isFrozen(context.actor)).toBe(true)
    expect(Object.isFrozen(context.payload)).toBe(true)
  })

  it('restores system work without a member proxy and limits it to public sources', async () => {
    const token = await workerToken()
    const repo = repository({
      loadJob: vi.fn(async () => ({ ...JOB, actorType: 'system' as const, actorUserId: null })),
    })
    const context = await requireBackgroundExecutionContext({
      authorization: `Bearer ${token}`,
      audience: 'reporting-deal-research-worker',
      requiredScope: 'deal-research:execute',
      now: NOW,
      secret: SIGNING_KEY_FIXTURE,
      repository: repo,
    })

    expect(context.actor).toEqual({ type: 'system' })
    expect(context.sourceMode).toBe('public')
    expect(repo.loadMembership).not.toHaveBeenCalled()
    expect(repo.loadAccess).not.toHaveBeenCalled()
  })

  it('rejects stale, terminal, expired, malformed, cross-fund, disabled, and revoked jobs', async () => {
    const token = await workerToken()
    const invalidJobs: Array<StoredBackgroundJob | null> = [
      null,
      { ...JOB, status: 'completed' },
      { ...JOB, attemptId: '8540d636-d12b-4bc1-87bb-058bcc7420cf' },
      { ...JOB, leaseExpiresAt: NOW.toISOString() },
      { ...JOB, payload: { dealId: 'bad' } },
      { ...JOB, kind: 'unsupported' },
    ]
    for (const job of invalidJobs) {
      await expect(requireBackgroundExecutionContext({
        authorization: `Bearer ${token}`,
        audience: 'reporting-deal-research-worker',
        requiredScope: 'deal-research:execute',
        now: NOW,
        secret: SIGNING_KEY_FIXTURE,
        repository: repository({ loadJob: vi.fn(async () => job) }),
      })).rejects.toThrow('Background execution is not authorized')
    }

    for (const overrides of [
      { validateResource: vi.fn(async () => { throw new Error('cross-fund') }) },
      { validateResource: vi.fn(async () => { throw new Error('disabled') }) },
      { loadMembership: vi.fn(async () => null) },
      { loadAccess: vi.fn(async () => ({ ...ACCESS, features: { search: 'off' } as AccessContext['features'] })) },
      { loadAccess: vi.fn(async () => ({ ...ACCESS, role: 'viewer' as const })) },
    ]) {
      await expect(requireBackgroundExecutionContext({
        authorization: `Bearer ${token}`,
        audience: 'reporting-deal-research-worker',
        requiredScope: 'deal-research:execute',
        now: NOW,
        secret: SIGNING_KEY_FIXTURE,
        repository: repository(overrides),
      })).rejects.toThrow('Background execution is not authorized')
    }
  })

  it('does not touch storage when bearer verification fails', async () => {
    const repo = repository()
    await expect(requireBackgroundExecutionContext({
      authorization: 'Bearer invalid.token.value',
      audience: 'reporting-deal-research-worker',
      requiredScope: 'deal-research:execute',
      now: NOW,
      secret: SIGNING_KEY_FIXTURE,
      repository: repo,
    })).rejects.toThrow('Background execution is not authorized')
    expect(repo.loadJob).not.toHaveBeenCalled()
  })

  it('revalidates the live attempt and user access immediately before a privileged write', async () => {
    const context = await requireBackgroundExecutionContext({
      authorization: `Bearer ${await workerToken()}`,
      audience: 'reporting-deal-research-worker',
      requiredScope: 'deal-research:execute',
      now: NOW,
      secret: SIGNING_KEY_FIXTURE,
      repository: repository(),
    })
    await expect(revalidateBackgroundExecutionContext(context, {
      now: NOW,
      repository: repository({ loadMembership: vi.fn(async () => null) }),
    })).rejects.toThrow('Background execution is not authorized')
  })

  it('restores a second registered kind without Deal Research logic in the generic core', async () => {
    const policy = Object.freeze({
      kind: 'test_notify',
      actors: Object.freeze(['system'] as const),
      parsePayload(value: unknown) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
        const messageId = (value as Record<string, unknown>).messageId
        if (typeof messageId !== 'string') throw new Error('invalid')
        return Object.freeze({ messageId })
      },
      workerPath: '/api/internal/background-jobs/test-notify/run',
      workerAudience: 'reporting-test-notify-worker' as const,
      workerScope: 'test-notify:execute' as const,
      requiredUserAccess: Object.freeze([]),
      maxAttempts: 2,
      leaseSeconds: 120,
      requestTimeoutMs: 60_000,
    })
    const registry: BackgroundJobRegistry = Object.freeze({
      list: () => Object.freeze([policy]),
      get: (kind: string) => {
        if (kind !== policy.kind) throw new Error('unsupported')
        return policy
      },
    })
    const notifyJob = Object.freeze({
      ...JOB,
      kind: policy.kind,
      payload: Object.freeze({ messageId: 'message-1' }),
      actorType: 'system' as const,
      actorUserId: null,
    })
    const repo = repository({
      loadJob: vi.fn(async () => notifyJob),
      validateResource: vi.fn(async () => undefined),
    })
    const token = await issueBackgroundJobToken({
      jobId: JOB_ID,
      attemptId: ATTEMPT_ID,
      tokenId: ATTEMPT_ID,
      audience: policy.workerAudience,
      leaseExpiresAt: new Date(NOW.getTime() + 300_000),
      now: NOW,
      secret: SIGNING_KEY_FIXTURE,
    })

    const context = await requireBackgroundExecutionContext({
      authorization: `Bearer ${token}`,
      audience: policy.workerAudience,
      requiredScope: policy.workerScope,
      now: NOW,
      secret: SIGNING_KEY_FIXTURE,
      repository: repo,
      registry,
    })

    expect(context).toMatchObject({
      kind: policy.kind,
      payload: { messageId: 'message-1' },
      audience: policy.workerAudience,
      scope: policy.workerScope,
      actor: { type: 'system' },
    })
    expect(repo.validateResource).toHaveBeenCalledWith({
      kind: policy.kind,
      payload: { messageId: 'message-1' },
      fundId: FUND_ID,
    })
  })

  it('rejects an unregistered audience and scope pair before resource access', async () => {
    const repo = repository()
    await expect(requireBackgroundExecutionContext({
      authorization: `Bearer ${await workerToken()}`,
      audience: 'reporting-deal-research-worker',
      requiredScope: 'search:execute',
      now: NOW,
      secret: SIGNING_KEY_FIXTURE,
      repository: repo,
    })).rejects.toThrow('Background execution is not authorized')
    expect(repo.validateResource).not.toHaveBeenCalled()
  })

  it('rejects a worker token when the endpoint expects a different registered job kind', async () => {
    const repo = repository()
    await expect(requireBackgroundExecutionContext({
      authorization: `Bearer ${await workerToken()}`,
      audience: 'reporting-deal-research-worker',
      requiredScope: 'deal-research:execute',
      requiredKind: 'test_notify',
      now: NOW,
      secret: SIGNING_KEY_FIXTURE,
      repository: repo,
    })).rejects.toThrow('Background execution is not authorized')
    expect(repo.validateResource).not.toHaveBeenCalled()
  })
})
