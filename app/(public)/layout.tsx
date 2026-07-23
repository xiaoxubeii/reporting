'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Menu, Github, LogIn, Play, Home, Building2, Mail, Upload, BarChart3, Briefcase, Send, StickyNote, Handshake, FileText, Crown, ShieldCheck, Settings, Scale, MessageCircle, PanelLeftClose, PanelLeftOpen, Monitor, Sun, Moon, Package, Tag, Star, Lightbulb, Microscope, Lock, Calculator } from 'lucide-react'

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function HemrockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M13 14L17 9L22 18H2.84444C2.46441 18 2.2233 17.5928 2.40603 17.2596L10.0509 3.31896C10.2429 2.96885 10.7476 2.97394 10.9325 3.32786L15.122 11.3476" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { SidebarProvider, useSidebar } from '@/components/sidebar-context'
import { useTheme } from 'next-themes'
import { APP_VERSION } from '@/lib/version'
import { useTranslations } from 'next-intl'
import { LanguageSwitcher } from '@/components/language-switcher'
import type englishMessages from '@/messages/en.json'

const THEME_CYCLE = ['system', 'light', 'dark'] as const
const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon }
type PublicChromeKey = keyof typeof englishMessages.PublicChrome

const TOP_ITEMS: { href: string; labelKey: PublicChromeKey; icon: LucideIcon }[] = [
  { href: '/', labelKey: 'home', icon: Home },
]

const PRODUCT_ITEMS: { href: string; labelKey: PublicChromeKey; icon: LucideIcon }[] = [
  { href: '/dashboard-explainer', labelKey: 'portfolio', icon: Building2 },
  { href: '/inbound-explainer', labelKey: 'inbound', icon: Mail },
  { href: '/import-explainer', labelKey: 'import', icon: Upload },
  { href: '/investments-explainer', labelKey: 'investments', icon: BarChart3 },
  { href: '/funds-explainer', labelKey: 'funds', icon: Briefcase },
  { href: '/asks-explainer', labelKey: 'asks', icon: Send },
  { href: '/notes-explainer', labelKey: 'notes', icon: StickyNote },
  { href: '/interactions-explainer', labelKey: 'interactions', icon: Handshake },
  { href: '/deals-explainer', labelKey: 'deals', icon: Lightbulb },
  { href: '/diligence-explainer', labelKey: 'diligence', icon: Microscope },
  { href: '/letters-explainer', labelKey: 'letters', icon: FileText },
  { href: '/lps-explainer', labelKey: 'lps', icon: Crown },
  { href: '/funds-explainer', labelKey: 'accounting', icon: Calculator },
  { href: '/lp-portal-explainer', labelKey: 'lpPortal', icon: Lock },
  { href: '/compliance-explainer', labelKey: 'compliance', icon: ShieldCheck },
  { href: '/settings-explainer', labelKey: 'settings', icon: Settings },
]

const BOTTOM_ITEMS: { href: string; labelKey: PublicChromeKey; icon: LucideIcon }[] = [
  { href: '/pricing', labelKey: 'pricing', icon: Tag },
  { href: '/contact', labelKey: 'contact', icon: MessageCircle },
  { href: '/license', labelKey: 'license', icon: Scale },
]

function NavLink({ href, label, icon: Icon, collapsed, isActive, onNavigate, className = '', activeStyle = 'default' }: {
  href: string; label: string; icon: LucideIcon; collapsed: boolean; isActive: boolean; onNavigate?: () => void; className?: string; activeStyle?: 'default' | 'text-only'
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={`relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
        collapsed ? 'md:justify-center md:px-0' : ''
      } ${
        isActive
          ? activeStyle === 'text-only'
            ? 'text-foreground font-medium'
            : 'bg-accent text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      } ${className}`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className={`${collapsed ? 'md:hidden' : ''}`}>{label}</span>
    </Link>
  )
}

function PublicSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { collapsed, toggle } = useSidebar()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [productOpen, setProductOpen] = useState(false)
  const t = useTranslations('PublicChrome')
  const tTheme = useTranslations('Theme')
  const tNavigation = useTranslations('Navigation')
  useEffect(() => setMounted(true), [])

  // Auto-open product section if current page is a product page
  useEffect(() => {
    if (PRODUCT_ITEMS.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))) {
      setProductOpen(true)
    }
  }, [pathname])

  const currentTheme = (THEME_CYCLE.includes(theme as typeof THEME_CYCLE[number]) ? theme : 'system') as typeof THEME_CYCLE[number]
  const ThemeIcon = mounted ? THEME_ICONS[currentTheme] : Monitor
  const themeLabel = mounted ? tTheme(currentTheme) : tTheme('system')

  function cycleTheme() {
    const idx = THEME_CYCLE.indexOf(currentTheme)
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length])
  }

  return (
    <div className="flex flex-col flex-1">
      <nav className={`flex-1 p-2 space-y-0.5 ${collapsed ? 'md:px-1' : ''}`}>
        {/* Demo link - shown only on mobile (sidebar drawer) */}
        <a
          href="https://portfolio.hemrock.com/demo"
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavigate}
          title={collapsed ? t('tryDemo') : undefined}
          className={`md:hidden flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-accent ${
            collapsed ? 'md:justify-center md:px-0' : ''
          }`}
        >
          <Play className="h-5 w-5 shrink-0" />
          <span>{t('tryDemo')}</span>
        </a>

        {TOP_ITEMS.map(({ href, labelKey, icon }) => (
          <NavLink
            key={href}
            href={href}
            label={t(labelKey)}
            icon={icon}
            collapsed={collapsed}
            isActive={pathname === href}
            onNavigate={onNavigate}
            activeStyle={href === '/' ? 'text-only' : 'default'}
          />
        ))}

        {/* Collapsible Product section */}
        <div>
          <button
            onClick={() => setProductOpen(!productOpen)}
            title={collapsed ? t('product') : undefined}
            className={`flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:text-foreground hover:bg-accent ${
              collapsed ? 'md:justify-center md:px-0' : ''
            } ${productOpen ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
          >
            <Package className="h-5 w-5 shrink-0" />
            <span className={`flex-1 text-left ${collapsed ? 'md:hidden' : ''}`}>{t('product')}</span>
          </button>
          {productOpen && (
            <div className={`space-y-0.5 ${collapsed ? '' : 'ml-5 border-l border-border pl-2'}`}>
              {PRODUCT_ITEMS.map(({ href, labelKey, icon }) => (
                <NavLink
                  key={href}
                  href={href}
                  label={t(labelKey)}
                  icon={icon}
                  collapsed={collapsed}
                  isActive={pathname === href || pathname.startsWith(href + '/')}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </div>

        {BOTTOM_ITEMS.map(({ href, labelKey, icon }) => (
          <NavLink
            key={href}
            href={href}
            label={t(labelKey)}
            icon={icon}
            collapsed={collapsed}
            isActive={pathname === href || (href !== '/' && pathname.startsWith(href + '/'))}
            onNavigate={onNavigate}
          />
        ))}

        <a
          href="https://github.com/tdavidson/reporting"
          target="_blank"
          rel="noopener noreferrer"
          title={collapsed ? 'GitHub' : undefined}
          className={`flex w-full items-center gap-3 px-3 py-2 rounded-md text-xs transition-colors text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent ${
            collapsed ? 'md:justify-center md:px-0' : ''
          }`}
        >
          <Github className="h-5 w-5 shrink-0" />
          <span className={`flex-1 text-left ${collapsed ? 'md:hidden' : ''}`}>GitHub</span>
        </a>

        <a
          href="https://x.com/tdavidson"
          target="_blank"
          rel="noopener noreferrer"
          title={collapsed ? 'tdavidson' : undefined}
          className={`flex w-full items-center gap-3 px-3 py-2 rounded-md text-xs transition-colors text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent ${
            collapsed ? 'md:justify-center md:px-0' : ''
          }`}
        >
          <XIcon className="h-5 w-5 shrink-0" />
          <span className={`flex-1 text-left ${collapsed ? 'md:hidden' : ''}`}>tdavidson</span>
        </a>

        <button
          onClick={cycleTheme}
          title={collapsed ? themeLabel : undefined}
          className={`flex w-full items-center gap-3 px-3 py-2 rounded-md text-xs transition-colors text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent ${
            collapsed ? 'md:justify-center md:px-0' : ''
          }`}
        >
          <ThemeIcon className="h-5 w-5 shrink-0" />
          <span className={`flex-1 text-left ${collapsed ? 'md:hidden' : ''}`}>
            {themeLabel}
          </span>
        </button>

        <div className={collapsed ? 'md:hidden' : undefined}>
          <LanguageSwitcher className="w-full" />
        </div>
        {collapsed && (
          <div className="hidden md:block">
            <LanguageSwitcher compact />
          </div>
        )}

        <button
          onClick={toggle}
          title={collapsed ? tNavigation('showSidebar') : tNavigation('hideSidebar')}
          aria-label={collapsed ? tNavigation('showSidebar') : tNavigation('hideSidebar')}
          className={`hidden md:flex w-full items-center gap-3 px-3 py-2 rounded-md text-xs transition-colors text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent ${
            collapsed ? 'md:justify-center md:px-0' : ''
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5 shrink-0" />
          ) : (
            <PanelLeftClose className="h-5 w-5 shrink-0" />
          )}
          <span className={`flex-1 text-left ${collapsed ? 'md:hidden' : ''}`}>
            {collapsed ? tNavigation('showSidebar') : tNavigation('hideSidebar')}
          </span>
        </button>
      </nav>
    </div>
  )
}

function PublicShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const { collapsed } = useSidebar()
  const [starCount, setStarCount] = useState<number | null>(null)
  const t = useTranslations('PublicChrome')

  useEffect(() => {
    fetch('/api/github-stars')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.stars != null) setStarCount(d.stars) })
      .catch(() => {})
  }, [])

  return (
    <>
      <header className="relative flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex items-center gap-3">
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
          <a href="https://www.hemrock.com" target="_blank" rel="noopener noreferrer" aria-label="Hemrock">
            <HemrockIcon className="h-7 w-7 text-foreground" />
          </a>
          {!collapsed && (
            <>
              <a href="https://www.hemrock.com" target="_blank" rel="noopener noreferrer" className="font-medium text-sm text-muted-foreground tracking-tight truncate hover:text-foreground transition-colors">
                Hemrock
              </a>
              <span className="hidden md:inline-block text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-1.5 py-0.5 rounded">v{APP_VERSION}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <Button variant="outline" size="sm" asChild className="text-muted-foreground gap-2 hidden sm:inline-flex">
            <a href="https://portfolio.hemrock.com/demo" target="_blank" rel="noopener noreferrer">
              <Play className="h-4 w-4" />
              {t('tryDemo')}
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild className="text-muted-foreground gap-2">
            <a href="https://github.com/tdavidson/reporting" target="_blank" rel="noopener noreferrer">
              <Github className="h-4 w-4" />
              {starCount != null && starCount >= 10 && (
                <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  {starCount}
                </span>
              )}
              <span className="hidden sm:inline">{t('viewOnGitHub')}</span>
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild className="text-muted-foreground gap-2">
            <Link href="/auth">
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">{t('signIn')}</span>
            </Link>
          </Button>
        </div>

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
            <PublicSidebar onNavigate={() => setDrawerOpen(false)} />
          </SheetContent>
        </Sheet>
      </header>

      <div className="flex flex-1">
        <aside
          className={`hidden md:flex flex-col shrink-0 pt-6 transition-all duration-200 ${
            collapsed ? 'w-16' : 'w-56'
          }`}
        >
          <PublicSidebar />
        </aside>

        <main className={`flex-1 min-w-0 flex flex-col ${collapsed ? 'md:pl-4' : ''}`}>
          <div className="flex-1">
            {children}
          </div>
        </main>
      </div>
    </>
  )
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.replace('/dashboard')
      } else {
        setAuthChecked(true)
      }
    })
  }, [router])

  if (!authChecked) return null

  const fathomSiteId = process.env.NEXT_PUBLIC_FATHOM_SITE_ID

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="w-full max-w-screen-xl mx-auto flex flex-col flex-1">
        <SidebarProvider>
          <PublicShell>{children}</PublicShell>
        </SidebarProvider>
      </div>
      {fathomSiteId && (
        <script src="https://cdn.usefathom.com/script.js" data-site={fathomSiteId} defer />
      )}
    </div>
  )
}
