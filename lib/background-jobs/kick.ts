import { backgroundJobInternalUrl } from './config'

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

/** Best-effort nudge; the persistent scheduler remains the recovery path. */
export async function kickBackgroundJobDispatcher(
  env: RuntimeEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const secret = env.CRON_SECRET
  if (!secret) return

  let url: string
  try {
    url = backgroundJobInternalUrl('/api/cron/background-jobs', env)
  } catch {
    return
  }

  try {
    await fetchImpl(url, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
      redirect: 'error',
    })
  } catch {
    // The request commonly times out locally while the server keeps processing.
  }
}
