'use client'

import { useEffect } from 'react'

/** Remove service workers left behind by older deployments of the site. */
export function ServiceWorkerCleanup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    void navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(
        registrations.map(registration => registration.unregister()),
      ))
      // Cleanup is best-effort and must never break the application shell.
      .catch(() => undefined)
  }, [])

  return null
}
