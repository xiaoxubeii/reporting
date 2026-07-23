import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { requireFeedRoute } from '@/lib/feeds/route-context'
import { FeedService } from '@/lib/feeds/service'
import { FeedApiError } from '@/lib/feeds/errors'

const ROUTE = 'api/feeds/entries/[id]'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await requireFeedRoute(ROUTE, 'GET')
    if (context instanceof Response) return context
    const entryId = positiveId(params.id)
    if (!entryId) throw new FeedApiError('invalid_request', 400, 'A valid Miniflux entry id is required.')
    const entry = await new FeedService(context.admin).getEntry(context.gate.userId, entryId)
    return feedSuccess({ entry })
  } catch (error) { return feedFailure(error) }
}

function positiveId(value: string): number | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
