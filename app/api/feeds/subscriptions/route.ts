import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { FeedApiError } from '@/lib/feeds/errors'
import { limitFeedAction, readJsonObject, requireFeedRoute } from '@/lib/feeds/route-context'
import { FeedService } from '@/lib/feeds/service'

const ROUTE = 'api/feeds/subscriptions'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const context = await requireFeedRoute(ROUTE, 'POST')
    if (context instanceof Response) return context
    const limited = await limitFeedAction(context, 'follow', 30, 60)
    if (limited) return limited
    const body = await readJsonObject(request)
    if (typeof body.feedUrl !== 'string' || body.feedUrl.length > 4096) throw new FeedApiError('invalid_request', 400, 'A valid feed URL is required.')
    const subscription = await new FeedService(context.admin).follow(context.gate.userId, {
      feedUrl: body.feedUrl,
      title: optionalString(body.title),
      siteUrl: optionalString(body.siteUrl),
      format: optionalString(body.format),
      topic: optionalString(body.topic),
    })
    return feedSuccess({ subscription }, { status: 201 })
  } catch (error) { return feedFailure(error) }
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
