const HEALTH_TIMEOUT_MS = 2_000

type SearchEnvironment = Record<string, string | undefined>
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export function configuredSearxngUrl(
  environment: SearchEnvironment = process.env,
): string | null {
  const raw = environment.REPORTING_SEARXNG_URL?.trim()
  if (!raw) return null

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('REPORTING_SEARXNG_URL must be a valid loopback HTTP URL.')
  }

  if (url.protocol !== 'http:' || !isNumericLoopback(url.hostname)) {
    throw new Error('REPORTING_SEARXNG_URL must use HTTP on a numeric loopback host.')
  }
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('REPORTING_SEARXNG_URL cannot contain credentials, path, query, or fragment.')
  }
  return url.origin
}

export async function checkSearxngAvailability(
  baseUrl: string,
  fetcher: FetchLike = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher(`${baseUrl}/healthz`, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      headers: { Accept: 'text/plain' },
    })
    if (response.body) await response.body.cancel().catch(() => undefined)
    return response.status === 200
  } catch {
    return false
  }
}

function isNumericLoopback(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '[::1]'
}
