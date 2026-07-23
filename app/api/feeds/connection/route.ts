import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { FeedApiError } from '@/lib/feeds/errors'
import { limitFeedAction, readJsonObject, requireFeedRoute } from '@/lib/feeds/route-context'
import { FeedService } from '@/lib/feeds/service'
import { automaticMinifluxProvisioningEnabled } from '@/lib/feeds/config'
import { ensureMinifluxConnection } from '@/lib/feeds/provisioning'

const ROUTE = 'api/feeds/connection'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const context = await requireFeedRoute(ROUTE, 'GET')
    if (context instanceof Response) return context
    const managed = automaticMinifluxProvisioningEnabled()
    const status = await new FeedService(context.admin).connectionStatus(context.gate.userId)
    return feedSuccess({ ...status, managed, canManage: true })
  } catch (error) { return feedFailure(error) }
}

export async function POST(request: Request) {
  try {
    const context = await requireFeedRoute(ROUTE, 'POST')
    if (context instanceof Response) return context
    const managed = automaticMinifluxProvisioningEnabled()
    const limited = await limitFeedAction(context, managed ? 'provision' : 'connect', managed ? 3 : 5, 300)
    if (limited) return limited
    const body = await readJsonObject(request)
    if (managed) {
      if (body.apiToken !== undefined) {
        throw new FeedApiError('invalid_request', 409, 'This feed account is managed automatically.')
      }
      await ensureMinifluxConnection(context.admin, context.gate.userId)
      const status = await new FeedService(context.admin).connectionStatus(context.gate.userId)
      return feedSuccess({ ...status, managed: true, canManage: true })
    }
    if (typeof body.apiToken !== 'string' || !body.apiToken.trim() || body.apiToken.length > 2048) {
      throw new FeedApiError('invalid_request', 400, 'A valid Miniflux API token is required.')
    }
    const status = await new FeedService(context.admin).connect(context.gate.userId, body.apiToken.trim())
    return feedSuccess({ ...status, managed: false, canManage: true })
  } catch (error) { return feedFailure(error) }
}

export async function DELETE() {
  try {
    const context = await requireFeedRoute(ROUTE, 'DELETE')
    if (context instanceof Response) return context
    if (automaticMinifluxProvisioningEnabled()) {
      throw new FeedApiError('invalid_request', 409, 'This feed account is managed automatically.')
    }
    const limited = await limitFeedAction(context, 'disconnect', 5, 300)
    if (limited) return limited
    await new FeedService(context.admin).disconnect(context.gate.userId)
    return feedSuccess({ disconnected: true })
  } catch (error) { return feedFailure(error) }
}
