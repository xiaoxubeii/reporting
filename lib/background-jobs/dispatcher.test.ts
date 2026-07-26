import { describe, expect, it, vi } from 'vitest'

import { dispatchBackgroundJobs, type BackgroundJobDispatcherRepository } from './dispatcher'
import { listBackgroundJobPolicies, type BackgroundJobRegistry } from './registry'
import type { ClaimedBackgroundJob } from './store'
import { verifyBackgroundJobToken } from './token'
import type { BackgroundJobPolicy } from './types'

const CRON_SECRET = 'cron-secret-value-that-is-long-enough-0123456789'
const TOKEN_SECRET = 'background-job-test-secret-value-0123456789'
const JOB_ID = '842e532a-b848-457a-9b8e-4d6d8da10caf'
const ATTEMPT_ID = '1cd393ce-753b-4021-9848-f41d5205a4c8'

const JOB: ClaimedBackgroundJob = {
  id: JOB_ID,
  kind: 'deal_research',
  payload: { dealId: 'f13aa191-56ac-4fb8-8eaa-bce047791467' },
  fundId: '2621143a-c9c3-4079-b52d-a9a935332ff5',
  actorType: 'system',
  actorUserId: null,
  status: 'running',
  attemptId: ATTEMPT_ID,
  leaseExpiresAt: new Date(Date.now() + 300_000).toISOString(),
  attempts: 1,
  maxAttempts: 3,
}

function repository(jobs: readonly ClaimedBackgroundJob[] = [JOB]): BackgroundJobDispatcherRepository {
  return {
    claimDue: vi.fn(async () => jobs),
    finalize: vi.fn(async () => true),
  }
}

const ENV = {
  BACKGROUND_JOB_TOKEN_SECRET: TOKEN_SECRET,
  BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://reporting.example',
}

describe('background job dispatcher', () => {
  it('fails closed before claiming when Cron authentication is absent or wrong', async () => {
    for (const authorization of [null, 'Bearer wrong']) {
      const repo = repository()
      await expect(dispatchBackgroundJobs({ authorization, cronSecret: CRON_SECRET, repository: repo, env: ENV }))
        .rejects.toMatchObject({ status: 401 })
      expect(repo.claimDue).not.toHaveBeenCalled()
    }
  })

  it('validates fixed internal transport configuration before claiming work', async () => {
    for (const env of [
      { ...ENV, BACKGROUND_JOB_TOKEN_SECRET: 'short' },
      { ...ENV, BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://attacker.example/path' },
    ]) {
      const repo = repository()
      await expect(dispatchBackgroundJobs({
        authorization: `Bearer ${CRON_SECRET}`, cronSecret: CRON_SECRET, repository: repo, env,
      })).rejects.toThrow()
      expect(repo.claimDue).not.toHaveBeenCalled()
    }
  })

  it('rejects reuse of the Cron secret as the Job Token signing secret before claiming', async () => {
    const repo = repository()
    await expect(dispatchBackgroundJobs({
      authorization: `Bearer ${CRON_SECRET}`,
      cronSecret: CRON_SECRET,
      repository: repo,
      env: { ...ENV, BACKGROUND_JOB_TOKEN_SECRET: CRON_SECRET },
    })).rejects.toMatchObject({ status: 500 })
    expect(repo.claimDue).not.toHaveBeenCalled()
  })

  it('claims, signs, and POSTs only to the registered same-origin worker without redirects', async () => {
    const repo = repository()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: 'done' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    const result = await dispatchBackgroundJobs({
      authorization: `Bearer ${CRON_SECRET}`,
      cronSecret: CRON_SECRET,
      repository: repo,
      fetchImpl,
      env: ENV,
    })

    expect(result).toEqual({ claimed: 1, completed: 1, retried: 0, failed: 0 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit]
    expect(url).toBe('https://reporting.example/api/internal/background-jobs/deal-research/run')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', body: undefined })
    expect((init.headers as Record<string, string>).authorization).toMatch(/^Bearer /)
    expect(repo.finalize).toHaveBeenCalledWith(expect.objectContaining({
      jobId: JOB_ID,
      attemptId: ATTEMPT_ID,
      status: 'completed',
    }))
  })

  it('enumerates an injected two-kind registry through the same generic HTTP path', async () => {
    const notifyPolicy = Object.freeze({
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
    } satisfies BackgroundJobPolicy)
    const policies = Object.freeze([...listBackgroundJobPolicies(), notifyPolicy])
    const registry: BackgroundJobRegistry = Object.freeze({
      list: () => policies,
      get: (kind: string) => {
        const policy = policies.find(candidate => candidate.kind === kind)
        if (!policy) throw new Error('unsupported')
        return policy
      },
    })
    const notifyJob: ClaimedBackgroundJob = Object.freeze({
      ...JOB,
      id: '58b8bc57-77c9-48cc-aa09-4fdd63331e71',
      kind: notifyPolicy.kind,
      payload: Object.freeze({ messageId: 'message-1' }),
      attemptId: '7f4be42e-370a-4b5c-ad23-3a72819511f0',
      maxAttempts: notifyPolicy.maxAttempts,
    })
    const repo = repository([JOB, notifyJob])
    const calls: Array<Readonly<{ url: string; authorization: string }>> = []
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(Object.freeze({
        url: String(url),
        authorization: String((init?.headers as Record<string, string>).authorization),
      }))
      return new Response(JSON.stringify({ status: 'done' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const result = await dispatchBackgroundJobs({
      authorization: `Bearer ${CRON_SECRET}`,
      cronSecret: CRON_SECRET,
      repository: repo,
      registry,
      fetchImpl,
      env: ENV,
    })

    expect(result).toEqual({ claimed: 2, completed: 2, retried: 0, failed: 0 })
    expect(repo.claimDue).toHaveBeenCalledWith(policies.map(policy => policy.kind), 3)
    expect(calls.map(call => call.url).sort()).toEqual([
      'https://reporting.example/api/internal/background-jobs/deal-research/run',
      'https://reporting.example/api/internal/background-jobs/test-notify/run',
    ].sort())
    for (const { policy, job } of [
      { policy: registry.get('deal_research'), job: JOB },
      { policy: notifyPolicy, job: notifyJob },
    ]) {
      const call = calls.find(candidate => candidate.url.endsWith(policy.workerPath))!
      await expect(verifyBackgroundJobToken(call.authorization.replace('Bearer ', ''), {
        audience: policy.workerAudience,
        secret: TOKEN_SECRET,
      })).resolves.toMatchObject({
        jobId: job.id,
        attemptId: job.attemptId,
      })
    }
  })

  it('claims no more jobs than can run concurrently and rejects a non-JSON or malformed 2xx worker response', async () => {
    const jobs = Array.from({ length: 5 }, (_, index) => ({
      ...JOB,
      id: `842e532a-b848-457a-9b8e-${String(index).padStart(12, '0')}`,
      attemptId: `1cd393ce-753b-4021-9848-${String(index).padStart(12, '0')}`,
    }))
    const repo = repository(jobs)
    await dispatchBackgroundJobs({
      authorization: `Bearer ${CRON_SECRET}`,
      cronSecret: CRON_SECRET,
      repository: repo,
      fetchImpl: vi.fn(async () => new Response('<html>proxy</html>', {
        status: 200, headers: { 'content-type': 'text/html' },
      })),
      env: ENV,
    })
    expect(repo.claimDue).toHaveBeenCalledWith(
      listBackgroundJobPolicies().map(policy => policy.kind),
      3,
    )
    expect(repo.finalize).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }))
  })

  it('retries network/timeout/5xx/429 failures and terminally fails non-retryable 4xx', async () => {
    for (const response of [
      () => Promise.reject(new Error('network secret must not escape')),
      () => Promise.resolve(new Response('busy', { status: 503 })),
      () => Promise.resolve(new Response('slow', { status: 429 })),
    ]) {
      const repo = repository()
      const result = await dispatchBackgroundJobs({
        authorization: `Bearer ${CRON_SECRET}`,
        cronSecret: CRON_SECRET,
        repository: repo,
        fetchImpl: vi.fn(response),
        env: ENV,
      })
      expect(result.retried).toBe(1)
      expect(repo.finalize).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }))
      expect(JSON.stringify(vi.mocked(repo.finalize).mock.calls)).not.toContain('network secret')
    }

    const repo = repository()
    const result = await dispatchBackgroundJobs({
      authorization: `Bearer ${CRON_SECRET}`,
      cronSecret: CRON_SECRET,
      repository: repo,
      fetchImpl: vi.fn(async () => new Response('forbidden', { status: 403 })),
      env: ENV,
    })
    expect(result.failed).toBe(1)
    expect(repo.finalize).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('treats a validated skipped worker result as a completed job', async () => {
    const repo = repository()
    const result = await dispatchBackgroundJobs({
      authorization: `Bearer ${CRON_SECRET}`,
      cronSecret: CRON_SECRET,
      repository: repo,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ status: 'skipped' }), {
        status: 422, headers: { 'content-type': 'application/json' },
      })),
      env: ENV,
    })
    expect(result.completed).toBe(1)
    expect(repo.finalize).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }))
  })

  it('does not retry once the attempt limit is reached and honors CAS finalization', async () => {
    const repo = repository([{ ...JOB, attempts: 3, maxAttempts: 3 }])
    vi.mocked(repo.finalize).mockResolvedValue(false)
    const result = await dispatchBackgroundJobs({
      authorization: `Bearer ${CRON_SECRET}`,
      cronSecret: CRON_SECRET,
      repository: repo,
      fetchImpl: vi.fn(async () => new Response('busy', { status: 503 })),
      env: ENV,
    })
    expect(result).toEqual({ claimed: 1, completed: 0, retried: 0, failed: 0 })
    expect(repo.finalize).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })
})
