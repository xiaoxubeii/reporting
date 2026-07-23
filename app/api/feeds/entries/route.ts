import { feedFailure, feedSuccess } from '@/lib/feeds/envelope'
import { requireFeedRoute } from '@/lib/feeds/route-context'
import { FeedService } from '@/lib/feeds/service'

const ROUTE = 'api/feeds/entries'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const context = await requireFeedRoute(ROUTE, 'GET')
    if (context instanceof Response) return context
    const query = new URL(request.url).searchParams
    const limit = integer(query.get('limit'), 20, 1, 100)
    const offset = integer(query.get('offset'), 0, 0, 100_000)
    const search = query.get('q')?.trim().slice(0, 200) || null
    const filter = feedFilter(query.get('filter'))
    const data = await new FeedService(context.admin).listEntries({
      userId: context.gate.userId,
      limit,
      offset,
      search,
      ...(filter ? { filter } : {}),
    })
    return feedSuccess(data)
  } catch (error) { return feedFailure(error) }
}

function feedFilter(value: string | null): 'all' | 'unread' | 'saved' | null {
  return value === 'all' || value === 'unread' || value === 'saved' ? value : null
}

function integer(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value === null ? fallback : Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}
