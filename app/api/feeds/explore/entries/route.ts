import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { FeedApiError } from '@/lib/feeds/errors'
import { ExploreFeedService } from '@/lib/feeds/explore-service'
import { limitFeedAction, requireFeedRoute } from '@/lib/feeds/route-context'

const ROUTE = 'api/feeds/explore/entries'
const MAX_SEARCH_LENGTH = 200
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const context = await requireFeedRoute(ROUTE, 'GET')
    if (context instanceof Response) return context
    const limited = await limitFeedAction(context, 'explore-entries', 120, 60)
    if (limited) return limited
    const query = new URL(request.url).searchParams
    const page = await new ExploreFeedService(context.admin).listEntries({
      categoryRef: optionalReference(query.get('category')),
      search: optionalSearch(query.get('q')),
      limit: boundedInteger(query.get('limit'), 20, 1, 100, 'limit'),
      offset: boundedInteger(query.get('offset'), 0, 0, 100_000, 'offset'),
    })
    return feedSuccess(page)
  } catch (error) {
    return feedFailure(error)
  }
}

function boundedInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) throw invalidQuery(name)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw invalidQuery(name)
  return parsed
}

function optionalReference(value: string | null): string | null {
  if (value === null || value === '') return null
  if (value.length > 64 || /[\u0000-\u001F\u007F]/.test(value)) throw invalidQuery('category')
  return value
}

function optionalSearch(value: string | null): string | null {
  if (value === null) return null
  const cleaned = value.trim()
  if (!cleaned) return null
  if (cleaned.length > MAX_SEARCH_LENGTH || /[\u0000-\u001F\u007F]/.test(cleaned)) {
    throw invalidQuery('q')
  }
  return cleaned
}

function invalidQuery(name: string): FeedApiError {
  return new FeedApiError('invalid_request', 400, `A valid Explore ${name} is required.`)
}
