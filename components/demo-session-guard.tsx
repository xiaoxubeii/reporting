'use client'

import { useEffect } from 'react'

/**
 * Ends a demo session before the user leaves this application for another origin.
 * Browser unload events also fire for reloads and direct internal navigation, so
 * using them here destroys the viewer session while the user is still browsing.
 */
export function DemoSessionGuard() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest<HTMLAnchorElement>('a[href]')
      if (!anchor) return
      if (anchor.target && anchor.target.toLowerCase() !== '_self') return
      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin === window.location.origin) return
      navigator.sendBeacon('/api/auth/logout')
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  return null
}
