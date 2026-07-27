'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Menu, LogOut, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { AppSidebar } from '@/components/app-sidebar'
import { LpPortalSwitchLink } from '@/components/lp-portal-switch-link'
import { useSidebar } from '@/components/sidebar-context'
import type { FeatureVisibilityMap } from '@/lib/types/features'

interface AppHeaderProps {
  fundName: string
  fundLogo?: string | null
  userEmail: string
  reviewBadge: number
  settingsBadge?: number
  notesBadge?: number
  isAdmin?: boolean
  featureVisibility?: FeatureVisibilityMap
}

export function AppHeader({ fundName, fundLogo, userEmail, reviewBadge, settingsBadge, notesBadge, isAdmin, featureVisibility }: AppHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const { collapsed } = useSidebar()
  const t = useTranslations('Header')

  return (
    <header className="relative flex items-center justify-between px-4 py-3 shrink-0">
      {/* Left: hamburger + logo + fund name */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button
          ref={menuButtonRef}
          variant="ghost"
          size="sm"
          className="md:hidden p-1.5"
          onClick={() => setDrawerOpen(true)}
          aria-label={t('openMenu')}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">{t('openMenu')}</span>
        </Button>
        {fundLogo ? (
          <img
            src={fundLogo}
            alt=""
            className="h-7 w-7 rounded object-contain"
          />
        ) : (
          <div className="h-7 w-7 rounded bg-muted flex items-center justify-center">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        {!collapsed && (
          <span className="min-w-0 truncate text-sm font-medium tracking-tight text-muted-foreground">{fundName}</span>
        )}
      </div>

      {/* Fund name aligned above page content when sidebar collapsed */}
      {collapsed && (
        <span className="pointer-events-none absolute left-24 right-96 top-1/2 hidden -translate-y-1/2 truncate text-sm font-medium tracking-tight text-muted-foreground/70 md:block">
          {fundName}
        </span>
      )}

      {/* Right: user + sign out */}
      <div className="flex shrink-0 items-center gap-3">
        <LpPortalSwitchLink />
        <span className="text-xs text-muted-foreground truncate hidden sm:block max-w-[200px]">
          {userEmail}
        </span>
        <form action="/api/auth/logout" method="POST">
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="text-muted-foreground gap-2"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{t('signOut')}</span>
          </Button>
        </form>
      </div>

      {/* Mobile drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          closeLabel={t('closeMenu')}
          dialogTitle={t('menuTitle')}
          dialogDescription={t('menuDescription')}
          onCloseAutoFocus={event => {
            event.preventDefault()
            menuButtonRef.current?.focus()
          }}
          className="p-0 pt-12 w-64"
        >
          <AppSidebar
            reviewBadge={reviewBadge}
            settingsBadge={settingsBadge}
            notesBadge={notesBadge}
            isAdmin={isAdmin}
            featureVisibility={featureVisibility}
            onNavigate={() => setDrawerOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </header>
  )
}
