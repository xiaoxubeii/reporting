import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { FeedApiError } from '@/lib/feeds/errors'
import {
  parseDiscoveryKind,
  parseDiscoveryPagination,
} from '@/lib/feeds/discovery/contracts'
import { DiscoveryReadService } from '@/lib/feeds/discovery/read-service'
import { limitFeedAction, requireFeedRoute } from '@/lib/feeds/route-context'

const ROUTE = 'api/feeds/explore/discovery'
const ALLOWED_QUERY_KEYS = new Set(['kind', 'limit', 'offset'])
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const context = await requireFeedRoute(ROUTE, 'GET')
    if (context instanceof Response) return context
    const limited = await limitFeedAction(context, 'explore-discovery', 120, 60)
    if (limited) return limited

    const query = new URL(request.url).searchParams
    for (const key of Array.from(query.keys())) {
      if (!ALLOWED_QUERY_KEYS.has(key) || query.getAll(key).length !== 1) throw invalidQuery()
    }
    const kind = parseDiscoveryKind(query.get('kind'))
    const pagination = parseDiscoveryPagination(query)
    const page = await new DiscoveryReadService(context.admin).list({
      fundId: context.gate.fundId,
      kind,
      ...pagination,
    })
    return feedSuccess(page)
  } catch (error) {
    if (error instanceof Error && /discovery|pagination|Unsupported/.test(error.message)) {
      return feedFailure(invalidQuery())
    }
    return feedFailure(error)
  }
}

function invalidQuery(): FeedApiError {
  return new FeedApiError('invalid_request', 400, 'A valid discovery strategy and pagination are required.')
}
