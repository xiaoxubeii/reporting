import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { FeedApiError } from '@/lib/feeds/errors'
import { ExploreFeedService } from '@/lib/feeds/explore-service'
import {
  assertSameOriginMutation,
  limitFeedAction,
  readJsonObject,
  requireFeedRoute,
} from '@/lib/feeds/route-context'

const ROUTE = 'api/feeds/explore/sources/[id]/follow'
export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOriginMutation(request)
    const body = await readJsonObject(request)
    if (Object.keys(body).length > 0) {
      throw new FeedApiError('invalid_request', 400, 'Explore Follow does not accept source metadata.')
    }
    const context = await requireFeedRoute(ROUTE, 'POST')
    if (context instanceof Response) return context
    const limited = await limitFeedAction(context, 'explore-follow', 30, 60)
    if (limited) return limited
    const subscription = await new ExploreFeedService(context.admin).followSource(
      context.gate.userId,
      params.id,
    )
    return feedSuccess({ subscription }, { status: 201 })
  } catch (error) {
    return feedFailure(error)
  }
}
