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
    const context = await requireFeedRoute(ROUTE, 'POST')
    if (context instanceof Response) return context
    const limited = await limitFeedAction(context, 'explore-follow', 30, 60)
    if (limited) return limited
    const body = await readJsonObject(request)
    if (Object.keys(body).some(key => key !== 'topic')) {
      throw new FeedApiError('invalid_request', 400, 'Explore Follow does not accept source metadata.')
    }
    const topic = personalTopic(body.topic)
    const subscription = await new ExploreFeedService(context.admin).followSource(
      context.gate.userId,
      params.id,
      topic,
    )
    return feedSuccess({ subscription }, { status: 201 })
  } catch (error) {
    return feedFailure(error)
  }
}

function personalTopic(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.length > 100 || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new FeedApiError('invalid_request', 400, 'A valid personal feed category is required.')
  }
  return value.trim() || null
}
