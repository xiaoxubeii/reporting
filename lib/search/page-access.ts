import type { AccessContext } from '@/lib/access/effective'
import { hasAccess } from '@/lib/access/effective'

interface FeedConnectionReader {
  connectionStatus(
    userId: string,
    options?: { readonly verifyUpstream?: boolean },
  ): Promise<{ readonly connected: boolean }>
}

/**
 * Resolve the personal-feed availability shown on Search without crossing the
 * Feeds authorization boundary. In particular, callers without Feeds read
 * access must never reach FeedService, because it decrypts their Miniflux
 * credential while checking connection health.
 */
export async function resolveSearchFeedStatus(
  access: AccessContext,
  userId: string,
  reader: FeedConnectionReader,
): Promise<{ readonly connected: boolean } | null> {
  if (!hasAccess(access, 'dealflow', 'read', 'feeds')) return null

  try {
    const status = await reader.connectionStatus(userId, { verifyUpstream: false })
    return Object.freeze({ connected: status.connected })
  } catch {
    return null
  }
}
