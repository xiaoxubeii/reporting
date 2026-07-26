import {
  requireBackgroundExecutionContext,
  type BackgroundExecutionContext,
} from './context'
import { claimBackgroundJobWorkerAttempt } from './store'
import type {
  BackgroundJobAudience,
  BackgroundJobKind,
  BackgroundJobScope,
} from './types'
import {
  runFeedDiscoveryRefresh,
  type DiscoveryRefreshOutcome,
} from '@/lib/feeds/discovery/refresh'

export interface FeedDiscoveryWorkerDependencies {
  restoreContext(
    authorization: string | null,
    audience: BackgroundJobAudience,
    requiredScope: BackgroundJobScope,
    requiredKind: BackgroundJobKind,
  ): Promise<BackgroundExecutionContext>
  claimExecution(context: BackgroundExecutionContext): Promise<boolean>
  runRefresh(fundId: string): Promise<DiscoveryRefreshOutcome>
}

export interface FeedDiscoveryWorkerResult {
  readonly status: number
  readonly body: Readonly<{ status?: string; error?: string }>
}

export async function executeFeedDiscoveryWorker(
  request: Request,
  dependencies: FeedDiscoveryWorkerDependencies = createDependencies(),
): Promise<FeedDiscoveryWorkerResult> {
  if (!await hasEmptyBody(request)) {
    return { status: 400, body: { error: 'Worker request body must be empty' } }
  }

  let context: BackgroundExecutionContext
  try {
    context = await dependencies.restoreContext(
      request.headers.get('authorization'),
      'reporting-feed-discovery-worker',
      'feed-discovery:execute',
      'feed_discovery',
    )
  } catch {
    return { status: 401, body: { error: 'Unauthorized' } }
  }
  if (
    context.kind !== 'feed_discovery'
    || context.scope !== 'feed-discovery:execute'
    || context.actor.type !== 'system'
  ) {
    return { status: 401, body: { error: 'Unauthorized' } }
  }
  if (!await dependencies.claimExecution(context)) {
    return { status: 409, body: { error: 'Background attempt is already executing' } }
  }

  const outcome = await dependencies.runRefresh(context.fundId)
  if (outcome.state === 'failed') return { status: 503, body: { status: 'failed' } }
  if (outcome.state === 'skipped') return { status: 422, body: { status: 'skipped' } }
  return { status: 200, body: { status: 'done' } }
}

function createDependencies(): FeedDiscoveryWorkerDependencies {
  return {
    restoreContext(authorization, audience, requiredScope, requiredKind) {
      return requireBackgroundExecutionContext({ authorization, audience, requiredScope, requiredKind })
    },
    claimExecution(context) {
      return claimBackgroundJobWorkerAttempt({ jobId: context.jobId, attemptId: context.attemptId })
    },
    runRefresh(fundId) {
      return runFeedDiscoveryRefresh(fundId)
    },
  }
}

async function hasEmptyBody(request: Request): Promise<boolean> {
  if (!request.body) return true
  const reader = request.body.getReader()
  try {
    const first = await reader.read()
    return first.done === true
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
