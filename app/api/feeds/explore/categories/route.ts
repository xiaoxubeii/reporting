import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { ExploreFeedService } from '@/lib/feeds/explore-service'
import { limitFeedAction, requireFeedRoute } from '@/lib/feeds/route-context'

const ROUTE = 'api/feeds/explore/categories'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const context = await requireFeedRoute(ROUTE, 'GET')
    if (context instanceof Response) return context
    const limited = await limitFeedAction(context, 'explore-categories', 120, 60)
    if (limited) return limited
    const categories = await new ExploreFeedService(context.admin).listCategories()
    return feedSuccess({ categories })
  } catch (error) {
    return feedFailure(error)
  }
}
