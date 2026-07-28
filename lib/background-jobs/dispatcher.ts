import { timingSafeEqual } from 'node:crypto'

import { backgroundJobInternalUrl, backgroundJobSecret } from './config'
import {
  backgroundJobRegistry,
  validateBackgroundJobRegistry,
  type BackgroundJobRegistry,
} from './registry'
import {
  claimDueBackgroundJobs,
  finalizeBackgroundJob,
  type ClaimedBackgroundJob,
  type FinalizeBackgroundJobInput,
} from './store'
import { issueBackgroundJobToken } from './token'
import type { BackgroundJobKind } from './types'

const MAX_CONCURRENCY = 3
const CLAIM_LIMIT = MAX_CONCURRENCY
const MAX_RESPONSE_BYTES = 64 * 1024

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

export interface BackgroundJobDispatcherRepository {
  claimDue(kinds: readonly BackgroundJobKind[], limit: number): Promise<readonly ClaimedBackgroundJob[]>
  finalize(input: FinalizeBackgroundJobInput): Promise<boolean>
}

export interface DispatchBackgroundJobsInput {
  readonly authorization: string | null
  readonly cronSecret?: string
  readonly repository?: BackgroundJobDispatcherRepository
  readonly registry?: BackgroundJobRegistry
  readonly fetchImpl?: typeof fetch
  readonly env?: RuntimeEnvironment
}

export interface DispatchBackgroundJobsResult {
  readonly claimed: number
  readonly completed: number
  readonly retried: number
  readonly failed: number
}

export class BackgroundJobDispatcherError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export async function dispatchBackgroundJobs(
  input: DispatchBackgroundJobsInput,
): Promise<DispatchBackgroundJobsResult> {
  const cronSecret = input.cronSecret ?? process.env.CRON_SECRET
  requireCronAuthorization(input.authorization, cronSecret)
  const env = input.env ?? process.env
  const registry = input.registry ?? backgroundJobRegistry
  const policies = validateBackgroundJobRegistry(registry)
  requireSeparatedSecrets(cronSecret, backgroundJobSecret(env))
  for (const policy of policies) backgroundJobInternalUrl(policy.workerPath, env)
  const repository = input.repository ?? {
    claimDue: (kinds, limit) => claimDueBackgroundJobs(kinds, limit),
    finalize: finalizeBackgroundJob,
  }
  const jobs = await repository.claimDue(policies.map(policy => policy.kind), CLAIM_LIMIT)
  const counts = { claimed: jobs.length, completed: 0, retried: 0, failed: 0 }

  for (let offset = 0; offset < jobs.length; offset += MAX_CONCURRENCY) {
    const results = await Promise.all(jobs.slice(offset, offset + MAX_CONCURRENCY).map(job => (
      dispatchOne(job, repository, registry, input.fetchImpl ?? fetch, env)
    )))
    for (const result of results) {
      if (result) counts[result] += 1
    }
  }
  return Object.freeze(counts)
}

async function dispatchOne(
  job: ClaimedBackgroundJob,
  repository: BackgroundJobDispatcherRepository,
  registry: BackgroundJobRegistry,
  fetchImpl: typeof fetch,
  env: RuntimeEnvironment,
): Promise<'completed' | 'retried' | 'failed' | null> {
  let disposition: 'completed' | 'pending' | 'failed'
  let error: string | null = null
  try {
    const policy = registry.get(job.kind)
    policy.parsePayload(job.payload)
    const token = await issueBackgroundJobToken({
      jobId: job.id,
      attemptId: job.attemptId,
      audience: policy.workerAudience,
      tokenId: job.attemptId,
      leaseExpiresAt: new Date(job.leaseExpiresAt),
      secret: env.BACKGROUND_JOB_TOKEN_SECRET,
    })
    const response = await fetchImpl(backgroundJobInternalUrl(policy.workerPath, env), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
      body: undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(policy.requestTimeoutMs),
      cache: 'no-store',
    })
    const responseText = await readBoundedResponse(response)
    const terminalStatus = workerTerminalStatus(response, responseText)
    if (terminalStatus) {
      disposition = 'completed'
    } else if (response.ok) {
      throw new Error('Worker returned an invalid success response')
    } else if (isRetryableStatus(response.status) && job.attempts < job.maxAttempts) {
      disposition = 'pending'
      error = `Worker returned retryable HTTP ${response.status}`
    } else {
      disposition = 'failed'
      error = `Worker returned HTTP ${response.status}`
    }
  } catch {
    if (job.attempts < job.maxAttempts) {
      disposition = 'pending'
      error = 'Worker request failed and will be retried'
    } else {
      disposition = 'failed'
      error = 'Worker request failed at the retry limit'
    }
  }

  const updated = await repository.finalize({
    jobId: job.id,
    attemptId: job.attemptId,
    status: disposition,
    error,
    retryAfterSeconds: disposition === 'pending' ? Math.min(300, Math.max(5, job.attempts * 15)) : 0,
  })
  if (!updated) return null
  if (disposition === 'completed') return 'completed'
  return disposition === 'pending' ? 'retried' : 'failed'
}

function requireCronAuthorization(authorization: string | null, secret: string | undefined): void {
  if (!secret || /[\u0000-\u001f\u007f]/.test(secret) || new TextEncoder().encode(secret).byteLength < 32) {
    throw new BackgroundJobDispatcherError(500, 'CRON_SECRET is not configured')
  }
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(authorization ?? '')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new BackgroundJobDispatcherError(401, 'Unauthorized')
  }
}

function requireSeparatedSecrets(cronSecret: string | undefined, tokenSecret: string): void {
  if (!cronSecret) throw new BackgroundJobDispatcherError(500, 'CRON_SECRET is not configured')
  const cron = Buffer.from(cronSecret)
  const token = Buffer.from(tokenSecret)
  if (cron.length === token.length && timingSafeEqual(cron, token)) {
    throw new BackgroundJobDispatcherError(500, 'Background job secrets must be distinct')
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

async function readBoundedResponse(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  let bytes = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) return new TextDecoder().decode(concatBytes(chunks, bytes))
      bytes += chunk.value.byteLength
      if (bytes > MAX_RESPONSE_BYTES) throw new Error('Worker response exceeded size limit')
      chunks.push(chunk.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

function workerTerminalStatus(response: Response, text: string): 'done' | 'skipped' | 'failed' | null {
  if (response.status !== 200 && response.status !== 422) return null
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') return null
  let value: unknown
  try { value = JSON.parse(text) } catch { return null }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const status = (value as { status?: unknown }).status
  if (response.status === 200 && status === 'done') return 'done'
  if (response.status === 422 && status === 'skipped') return 'skipped'
  if (response.status === 422 && status === 'failed') return 'failed'
  return null
}

function concatBytes(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}
