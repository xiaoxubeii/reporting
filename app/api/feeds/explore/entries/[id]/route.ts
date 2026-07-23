import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { ExploreFeedService } from '@/lib/feeds/explore-service'
import { limitFeedAction, requireFeedRoute } from '@/lib/feeds/route-context'

const ROUTE = 'api/feeds/explore/entries/[id]'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await requireFeedRoute(ROUTE, 'GET')
    if (context instanceof Response) return context
    const limited = await limitFeedAction(context, 'explore-entry-detail', 120, 60)
    if (limited) return limited
    const entry = await new ExploreFeedService(context.admin).getEntry(params.id)
    return feedSuccess({ entry })
  } catch (error) {
    return feedFailure(error)
  }
}
