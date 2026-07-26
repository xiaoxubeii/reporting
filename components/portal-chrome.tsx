'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LanguageSwitcher } from '@/components/language-switcher'
import type englishMessages from '@/messages/en.json'

type PortalChromeKey = keyof typeof englishMessages.PortalChrome

const TABS: { href: string; labelKey: PortalChromeKey; match?: string[] }[] = [
  { href: '/portal/overview', labelKey: 'overview' },
  // "Library" is the combined reports + letters + documents page at /portal/snapshots.
  { href: '/portal/snapshots', labelKey: 'library', match: ['/portal/snapshots', '/portal/letters', '/portal/documents'] },
  { href: '/portal/settings', labelKey: 'settings' },
  { href: '/portal/contact', labelKey: 'contact' },
]

/**
 * Portal header + tab nav, wrapping the portal pages. Onboarding
 * (/portal/welcome) is a standalone setup screen, so it renders the page bare —
 * no header, no tabs.
 */
export function PortalChrome({ fundName, logoUrl, userEmail, children }: { fundName: string; logoUrl: string | null; userEmail: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const translate = useTranslations('PortalChrome')

  if (pathname === '/portal/welcome') {
    return (
      <div className="flex flex-col min-h-screen">
        <header className="border-b bg-background/80">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-7 w-auto max-w-[140px] object-contain rounded" />
            ) : null}
            <span className="font-medium text-sm text-muted-foreground tracking-tight truncate">{fundName}</span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4">
          <div className="pt-3 pb-2 flex items-center justify-between gap-3">
            <Link href="/portal/overview" className="flex items-center gap-2 min-w-0">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-7 w-auto max-w-[140px] object-contain rounded shrink-0" />
              ) : null}
              <span className="font-medium text-sm text-muted-foreground tracking-tight truncate">{fundName}</span>
            </Link>
            <div className="flex items-center gap-3">
              {userEmail && <span className="text-xs text-muted-foreground truncate hidden sm:block max-w-[200px]">{userEmail}</span>}
              <LanguageSwitcher compact />
              <form action="/api/auth/logout" method="POST">
                <Button type="submit" variant="outline" size="sm" className="text-muted-foreground gap-2">
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">{translate('signOut')}</span>
                </Button>
              </form>
            </div>
          </div>
          <nav className="flex items-center gap-4 -mb-px pt-2 overflow-x-auto">
            {TABS.map(tab => {
              const active = (tab.match ?? [tab.href]).some(m => pathname === m || pathname.startsWith(m + '/'))
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`text-sm py-2 border-b-2 whitespace-nowrap ${active ? 'border-foreground text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  {translate(tab.labelKey)}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
