'use client'

import { LanguageSwitcher } from '@/components/language-switcher'
import { cn } from '@/lib/utils'

/**
 * Language control for full-screen routes that do not render the public,
 * authenticated-app, or portal chrome.
 */
export function StandaloneLocaleControl({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'fixed right-4 top-4 z-50 rounded-md border bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80',
        className,
      )}
    >
      <LanguageSwitcher compact />
    </div>
  )
}
