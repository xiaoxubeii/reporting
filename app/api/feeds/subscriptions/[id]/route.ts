import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { FeedApiError } from '@/lib/feeds/errors'
import { limitFeedAction, requireFeedRoute } from '@/lib/feeds/route-context'
import { FeedService } from '@/lib/feeds/service'

const ROUTE = 'api/feeds/subscriptions/[id]'
export const dynamic = 'force-dynamic'

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await requireFeedRoute(ROUTE, 'DELETE')
    if (context instanceof Response) return context
    const limited = await limitFeedAction(context, 'unfollow', 30, 60)
    if (limited) return limited
    const feedId = positiveId(params.id)
    if (!feedId) throw new FeedApiError('invalid_request', 400, 'A valid Miniflux feed id is required.')
    await new FeedService(context.admin).unfollow(context.gate.userId, feedId)
    return feedSuccess({ unfollowed: true })
  } catch (error) { return feedFailure(error) }
}

function positiveId(value: string): number | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
