import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { requireFeedRoute } from '@/lib/feeds/route-context'
import { FeedService } from '@/lib/feeds/service'

const ROUTE = 'api/feeds/sources'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const context = await requireFeedRoute(ROUTE, 'GET')
    if (context instanceof Response) return context
    const search = new URL(request.url).searchParams.get('q')?.slice(0, 200) ?? null
    return feedSuccess(await new FeedService(context.admin).listSources(context.gate.userId, search))
  } catch (error) { return feedFailure(error) }
}
