import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { ExploreFeedService } from '@/lib/feeds/explore-service'
import { limitFeedAction, requireFeedRoute } from '@/lib/feeds/route-context'

const ROUTE = 'api/feeds/explore/following'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const context = await requireFeedRoute(ROUTE, 'GET')
    if (context instanceof Response) return context
    const limited = await limitFeedAction(context, 'explore-following', 120, 60)
    if (limited) return limited
    const sourceIds = await new ExploreFeedService(context.admin)
      .listFollowedSourceRefs(context.gate.userId)
    return feedSuccess({ sourceIds })
  } catch (error) {
    return feedFailure(error)
  }
}
