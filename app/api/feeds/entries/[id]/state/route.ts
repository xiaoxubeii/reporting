import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { FeedApiError } from '@/lib/feeds/errors'
import { limitFeedAction, readJsonObject, requireFeedRoute } from '@/lib/feeds/route-context'
import { FeedService } from '@/lib/feeds/service'

const ROUTE = 'api/feeds/entries/[id]/state'
export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await requireFeedRoute(ROUTE, 'PATCH')
    if (context instanceof Response) return context
    const limited = await limitFeedAction(context, 'state', 180, 60)
    if (limited) return limited
    const body = await readJsonObject(request)
    const isRead = optionalBoolean(body.isRead, 'isRead')
    const isSaved = optionalBoolean(body.isSaved, 'isSaved')
    const entryId = positiveId(params.id)
    if (!entryId) throw new FeedApiError('invalid_request', 400, 'A valid Miniflux entry id is required.')
    const state = await new FeedService(context.admin).updateEntryState({
      userId: context.gate.userId,
      entryId,
      isRead,
      isSaved,
    })
    return feedSuccess({ state })
  } catch (error) { return feedFailure(error) }
}

function positiveId(value: string): number | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new FeedApiError('invalid_request', 400, `${name} must be a boolean.`)
  return value
}
