import { MinifluxError } from './miniflux/client'

export type FeedErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_request'
  | 'not_configured'
  | 'not_found'
  | 'authentication'
  | 'rate_limited'
  | 'upstream'
  | 'internal'

export class FeedApiError extends Error {
  constructor(
    public readonly code: FeedErrorCode,
    public readonly status: number,
    public readonly safeMessage: string,
  ) {
    super(safeMessage)
    this.name = 'FeedApiError'
  }
}

export function toFeedApiError(error: unknown): FeedApiError {
  if (error instanceof FeedApiError) return error
  if (error instanceof MinifluxError) {
    if (error.code === 'authentication') return new FeedApiError('authentication', 502, 'The feed connection needs to be reconnected.')
    if (error.code === 'rate_limited') return new FeedApiError('rate_limited', 429, 'The feed service is busy. Please retry shortly.')
    if (error.code === 'not_found') return new FeedApiError('not_found', 404, 'The requested feed resource was not found.')
    return new FeedApiError('upstream', 502, 'Feed service is temporarily unavailable.')
  }
  console.error('[feeds] unexpected error')
  return new FeedApiError('internal', 500, 'Unable to complete the feed request.')
}
