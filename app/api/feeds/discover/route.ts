import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { FeedApiError } from '@/lib/feeds/errors'
import { limitFeedAction, readJsonObject, requireFeedRoute } from '@/lib/feeds/route-context'
import { FeedService } from '@/lib/feeds/service'

const ROUTE = 'api/feeds/discover'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const context = await requireFeedRoute(ROUTE, 'POST')
    if (context instanceof Response) return context
    const limited = await limitFeedAction(context, 'discover', 30, 60)
    if (limited) return limited
    const body = await readJsonObject(request)
    if (typeof body.url !== 'string' || body.url.length > 4096) throw new FeedApiError('invalid_request', 400, 'A valid website or RSS URL is required.')
    const results = await new FeedService(context.admin).discover(context.gate.userId, body.url)
    return feedSuccess({ results })
  } catch (error) { return feedFailure(error) }
}
