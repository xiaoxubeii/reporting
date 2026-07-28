import { enqueueBackgroundJob } from '@/lib/background-jobs/store'
import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { FeedApiError } from '@/lib/feeds/errors'
import { resolveDiscoveryAIProvider } from '@/lib/feeds/discovery/provider'
import {
  assertSameOriginMutation,
  limitFeedAction,
  readJsonObject,
  requireFeedRoute,
} from '@/lib/feeds/route-context'

const ROUTE = 'api/feeds/explore/discovery/refresh'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request)
    const context = await requireFeedRoute(ROUTE, 'POST')
    if (context instanceof Response) return context
    const limited = await limitFeedAction(context, 'explore-discovery-refresh', 3, 300)
    if (limited) return limited
    const body = await readJsonObject(request)
    if (Object.keys(body).length > 0) {
      throw new FeedApiError('invalid_request', 400, 'Discovery refresh does not accept Fund or provider input.')
    }
    try {
      await resolveDiscoveryAIProvider(context.admin, context.gate.fundId)
    } catch {
      throw new FeedApiError('not_configured', 409, 'Discovery AI is not configured for this Fund.')
    }
    const job = await enqueueBackgroundJob({
      kind: 'feed_discovery',
      payload: Object.freeze({}),
      fundId: context.gate.fundId,
      actor: Object.freeze({ type: 'system' }),
      dedupeKey: `feed_discovery:${context.gate.fundId}`,
    }, context.admin)
    return feedSuccess({ jobId: job.id, status: job.status }, { status: 202 })
  } catch (error) {
    return feedFailure(error)
  }
}
