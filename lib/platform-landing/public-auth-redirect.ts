import type { PublicRootSurface } from '@/lib/platform-landing/public-root'

interface LegacyPublicAuthCheckOptions {
  readonly surface: PublicRootSurface
  readonly getUser: () => Promise<{ data: { user: unknown | null } }>
  readonly replace: (destination: string) => void
  readonly revealPublicShell: () => void
}

const noCleanup = () => undefined

export function startLegacyPublicAuthCheck({
  surface,
  getUser,
  replace,
  revealPublicShell,
}: LegacyPublicAuthCheckOptions): () => void {
  if (surface === 'tenant-home') return noCleanup

  const controller = new AbortController()

  void getUser()
    .then(({ data: { user } }) => {
      if (controller.signal.aborted) return
      if (user) {
        replace('/dashboard')
      } else {
        revealPublicShell()
      }
    })
    .catch(() => {
      if (!controller.signal.aborted) revealPublicShell()
    })

  return () => controller.abort()
}
