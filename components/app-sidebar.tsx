'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, ClipboardCheck, ListChecks, Mail, Settings, PanelLeftClose, PanelLeftOpen, Monitor, Sun, Moon, Lock, Users, ArrowDownCircle, Crown, Lightbulb, Microscope, BookOpen, Rss, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'
import { useSidebar } from '@/components/sidebar-context'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ACCOUNTING_SECTIONS } from '@/lib/accounting/nav'
import { useVehicle, FUND_SUBPAGE_SLUGS } from '@/components/accounting-vehicle'
import type { FeatureKey, FeatureVisibilityMap } from '@/lib/types/features'
import { domainForFeature, type Domain } from '@/lib/access/domains'
import { useAccess } from '@/components/access-context'
import type { AccessLevel } from '@/lib/access/effective'

const THEME_CYCLE = ['system', 'light', 'dark'] as const
const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon }
import type englishMessages from '@/messages/en.json'

type NavigationKey = keyof typeof englishMessages.Navigation

interface NavChild {
  href: string
  label?: string
  labelKey?: NavigationKey
  adminOnly?: boolean
  featureKey?: FeatureKey
  /** Only where the featureKey can't imply it (or there is no featureKey). */
  domain?: Domain
  /** Notes moved from a top-level item into Portfolio, and its unread count moved with it. */
  badgeKey?: 'notes'
  /** Highlight only on the exact path, never on descendants. The Funds "Overview" child
   *  (/funds/<id>) is a prefix of every sibling, so a prefix match would light it everywhere. */
  exact?: boolean
}
interface NavItem {
  href: string
  labelKey: NavigationKey
  icon: LucideIcon
  badgeKey?: 'review' | 'settings' | 'notes'
  adminOnly?: boolean
  featureKey?: FeatureKey
  /** Only where the featureKey can't imply it (or there is no featureKey). */
  domain?: Domain
  beta?: boolean
  children?: NavChild[]
}

/**
 * Can this user reach this nav entry? Answered by the SAME resolver the middleware applies to the
 * API behind it, given the entry's OWN feature key.
 *
 * That last part is the whole trick. This used to consult a precomputed level per domain — but
 * that map had to pick one feature key per domain, and several span more than one. A fund with
 * `lps: admin` + `lp_tracking: everyone` hid Capital accounts from a member who could open the
 * page and whose API calls returned 200, because the map answered for `lps` and the entry meant
 * `lp_tracking`.
 *
 * The nav is an affordance, not a boundary — but it must not LIE. A link to a page whose every
 * request 403s is worse than no link, and a link to data the user shouldn't have is worse still.
 */
function canSee(
  entry: { adminOnly?: boolean; featureKey?: FeatureKey; domain?: Domain },
  isAdmin: boolean,
  access: (domain: Domain, feature?: FeatureKey) => AccessLevel,
): boolean {
  if (entry.adminOnly && !isAdmin) return false

  const domain = entry.domain ?? (entry.featureKey ? domainForFeature(entry.featureKey) : undefined)
  // No domain and no feature: an always-available entry (Settings).
  if (!domain) return true

  const level = access(domain, entry.featureKey)
  return level === 'read' || level === 'write'
}

const NAV_ITEMS: NavItem[] = [
  { href: '/review', labelKey: 'review', icon: ClipboardCheck, badgeKey: 'review', domain: 'portfolio' },
  // The queue spans domains; gate the nav on portfolio (like Review) and let the list filter rows.
  { href: '/pending-actions', labelKey: 'pendingActions', icon: ListChecks, domain: 'portfolio' },
  { href: '/emails', labelKey: 'inbound', icon: Mail, domain: 'dealflow' },
  { href: '/deals', labelKey: 'deals', icon: Lightbulb, featureKey: 'deals' },
  {
    href: '/feeds', labelKey: 'feeds', icon: Rss, featureKey: 'feeds',
    children: [
      { href: '/feeds', labelKey: 'today', featureKey: 'feeds', exact: true },
      { href: '/feeds/sources', labelKey: 'followSources', featureKey: 'feeds' },
    ],
  },
  { href: '/search', labelKey: 'search', icon: Search, featureKey: 'search' },
  {
    href: '/diligence', labelKey: 'diligence', icon: Microscope, featureKey: 'diligence',
    children: [
      { href: '/diligence/inbox',     labelKey: 'inbox' },
      { href: '/diligence/analytics', labelKey: 'analytics', adminOnly: true },
      { href: '/experts', labelKey: 'experts' },
    ],
  },
  {
    href: '/dashboard', labelKey: 'portfolio', icon: Building2, domain: 'portfolio',
    children: [
      { href: '/import',       labelKey: 'import',       featureKey: 'imports' },
      { href: '/investments',  labelKey: 'investments',  featureKey: 'investments' },
      { href: '/requests',     labelKey: 'asks',         featureKey: 'asks' },
      { href: '/interactions', labelKey: 'interactions', featureKey: 'interactions' },
      // Letters are generated from PORTFOLIO data (the companies) and can be produced without
      // any LP tracking, so they live under Portfolio, not LPs.
      { href: '/letters',      labelKey: 'letters',      featureKey: 'lp_letters' },
      // Notes are about companies, so they belong under the portfolio rather than as a
      // top-level peer of it.
      { href: '/notes',        labelKey: 'notes',        featureKey: 'notes', badgeKey: 'notes' },
      { href: '/compliance',   labelKey: 'compliance',   featureKey: 'compliance' },
    ],
  },
  {
    href: '/lps', labelKey: 'lps', icon: Crown, featureKey: 'lps',
    children: [
      { href: '/lps/capital',   labelKey: 'capitalAccounts', featureKey: 'lp_tracking' },
      { href: '/lp-portal',     labelKey: 'documents',        featureKey: 'lp_portal' },
      // See the portal exactly as an LP does ("viewing as …"). Admin-only, and only where a
      // portal exists to preview.
      { href: '/lps/preview',   labelKey: 'previewPortal',   featureKey: 'lp_portal', adminOnly: true },
      { href: '/lp-activity',   labelKey: 'activity',         featureKey: 'lp_activity' },
    ],
  },
  {
    // Relabelled from "Accounting" to "Funds": the landing page is now the fund overview —
    // performance per vehicle, derived from the ledger — and the ledger pages are what you
    // click into. The old /funds page (typed-in numbers, estimated carry) redirects here.
    //
    // No `adminOnly` — the featureKey already gates it (defaults to 'off', and a fund
    // that turns it on to 'admin' still only shows it to admins). Hard-coding adminOnly
    // on top of that also hid it from the read-only demo viewer, who should see the books.
    href: '/funds', labelKey: 'funds', icon: BookOpen, featureKey: 'accounting',
    children: ACCOUNTING_SECTIONS.map(({ href, label, domain }) => ({ href, label, domain })),
  },
  { href: '/usage', labelKey: 'usage', icon: Users, adminOnly: true, domain: 'admin' },
  { href: '/settings', labelKey: 'settings', icon: Settings, badgeKey: 'settings' },
]

const ACCOUNTING_LABEL_KEYS: Record<string, NavigationKey> = {
  '/funds/status': 'admin',
  '/funds/bank': 'bankTransactions',
  '/funds/capital-accounts': 'capitalAccounts',
  '/funds/journal': 'journal',
  '/funds/periods': 'periodClose',
  '/funds/schedule-of-investments': 'scheduleOfInvestments',
  '/funds/statements': 'financialStatements',
}

interface AppSidebarProps {
  reviewBadge: number
  settingsBadge?: number
  notesBadge?: number
  isAdmin?: boolean
  updateAvailable?: boolean
  featureVisibility?: FeatureVisibilityMap
  onNavigate?: () => void
}

export function AppSidebar({ reviewBadge, settingsBadge, notesBadge, isAdmin, updateAvailable, featureVisibility, onNavigate }: AppSidebarProps) {
  const pathname = usePathname()
  const access = useAccess()
  const { collapsed, toggle } = useSidebar()
  const { theme, setTheme } = useTheme()
  const t = useTranslations('Navigation')
  const tTheme = useTranslations('Theme')
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // The Funds subnav is fund-first: every child points at /funds/<id>/<page>, with an
  // "Overview" entry for the fund's lead page. Which fund? The one in the URL when we're
  // under a fund, else the selected vehicle from context (its id, or its name for a legacy
  // vehicle with no registry id). Null until a fund is known — then the children are empty.
  const { vehicleId, group } = useVehicle()
  const fundMatch = pathname.match(/^\/funds\/([^/]+)/)
  const pathFundSeg = fundMatch && !FUND_SUBPAGE_SLUGS.has(fundMatch[1]) ? fundMatch[1] : null
  const fundSeg = pathFundSeg ?? vehicleId ?? (group ? encodeURIComponent(group) : null)
  const fundsChildren: NavChild[] = fundSeg
    ? [
        { href: `/funds/${fundSeg}`, labelKey: 'overview', exact: true },
        ...ACCOUNTING_SECTIONS.map(s => ({
          href: `/funds/${fundSeg}/${s.href.slice('/funds/'.length)}`,
          label: s.label,
          labelKey: ACCOUNTING_LABEL_KEYS[s.href],
          domain: s.domain,
        })),
      ]
    : []

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
        {NAV_ITEMS.filter(item => {
          if (!canSee(item, !!isAdmin, access)) return false
          if (item.badgeKey === 'review' && reviewBadge === 0) return false
          return true
        }).map((item) => {
          const { href, labelKey, icon: Icon, badgeKey, adminOnly, featureKey, beta } = item
          const label = t(labelKey)
          // The Funds children are computed per-render from the current fund (fund-first hrefs);
          // every other section uses its static children.
          const children = item.href === '/funds' ? fundsChildren : item.children
          // The parent row is highlighted ONLY when it is the exact current page — never
          // merely because a child is open. Otherwise the highlight was inconsistent: Funds
          // (/funds) and Diligence (/diligence) nest their children under their own path, so a
          // prefix match lit the parent AND the child (two "you are here" pills at once),
          // while Portfolio — whose children live at unrelated paths like /investments — never
          // lit the parent. Exact-match makes every section behave the same: one pill, on the
          // page you're actually on, with section context coming from the expanded children.
          const isActive = pathname === href
          const badgeCount = badgeKey === 'review' ? reviewBadge
            : badgeKey === 'settings' ? (settingsBadge ?? 0)
            : badgeKey === 'notes' ? (notesBadge ?? 0)
            : 0
          const showLock = adminOnly || (featureKey && featureVisibility?.[featureKey] === 'admin')

          // Children visibility — drop children that the user can't access (admin
          // gate or per-feature visibility), then show only when the parent or any
          // visible child route is active.
          const visibleChildren = (children ?? []).filter(c => canSee(c, !!isAdmin, access))
          const childActive = visibleChildren.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))
          // A parent can share its href with a concrete default child (for example,
          // Feeds -> Today). In that case, the child owns the selected state so the
          // sidebar never renders two nested active pills for the same page.
          const parentIsActive = isActive && !visibleChildren.some(c =>
            c.exact ? pathname === c.href : pathname === c.href || pathname.startsWith(c.href + '/')
          )
          // Also keep the section open on any page UNDER its own path (e.g. /funds/allocation-terms,
          // a Funds page that isn't a listed child) — it's still this section, just not in the nav.
          const underSection = pathname.startsWith(href + '/')
          const showChildren = !collapsed && visibleChildren.length > 0 && (isActive || childActive || underSection)

          return (
            <div key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                title={collapsed ? label : undefined}
                className={`relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  collapsed ? 'md:justify-center md:px-0' : ''
                } ${
                  parentIsActive
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className={`${collapsed ? 'md:hidden' : ''}`}>{label}</span>
                {badgeCount > 0 && (
                  collapsed ? (
                    <span className="hidden md:block absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-500" />
                  ) : (
                    <span className="rounded-full bg-amber-500 text-white text-[10px] font-semibold leading-none px-1.5 py-0.5 min-w-[18px] text-center">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )
                )}
                {beta && !showLock && (
                  collapsed ? (
                    <span className="hidden md:block absolute top-1 right-1 h-2 w-2 rounded-full bg-blue-500" />
                  ) : (
                    <span className="text-[9px] font-medium text-blue-500 bg-blue-500/10 rounded px-1 py-0.5 leading-none uppercase tracking-wider self-center">{t('beta')}</span>
                  )
                )}
                {showLock && !beta && !collapsed && (
                  <Lock className="h-3 w-3 text-amber-500 shrink-0 md:block hidden" />
                )}
                {showLock && !beta && collapsed && (
                  <span className="hidden md:block absolute top-1 right-1">
                    <Lock className="h-2.5 w-2.5 text-amber-500" />
                  </span>
                )}
                {beta && showLock && !collapsed && (
                  <>
                    <span className="text-[9px] font-medium text-blue-500 bg-blue-500/10 rounded px-1 py-0.5 leading-none uppercase tracking-wider self-center hidden md:inline">{t('beta')}</span>
                    <Lock className="h-3 w-3 text-amber-500 shrink-0 md:block hidden" />
                  </>
                )}
                {beta && showLock && collapsed && (
                  <span className="hidden md:block absolute top-1 right-1">
                    <Lock className="h-2.5 w-2.5 text-blue-500" />
                  </span>
                )}
              </Link>

              {showChildren && (
                <div className="ml-5 border-l border-border pl-2 mt-0.5 space-y-0.5">
                  {visibleChildren.map(child => {
                    const childIsActive = child.exact
                      ? pathname === child.href
                      : pathname === child.href || pathname.startsWith(child.href + '/')
                    const childShowLock = child.adminOnly || (child.featureKey && featureVisibility?.[child.featureKey] === 'admin')
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                          childIsActive
                            ? 'bg-accent text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        }`}
                      >
                        <span>{child.labelKey ? t(child.labelKey) : child.label}</span>
                        {childShowLock && <Lock className="h-3 w-3 text-amber-500 shrink-0" />}
                        {child.badgeKey === 'notes' && (notesBadge ?? 0) > 0 && (
                          <span className="ml-auto text-[10px] font-medium rounded-full bg-muted-foreground/15 px-1.5 py-0.5 tabular-nums">
                            {notesBadge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Update available, admin only */}
        {isAdmin && updateAvailable && (() => {
          const isActive = pathname === '/updates' || pathname.startsWith('/updates/')
          return (
            <Link
              href="/updates"
              onClick={onNavigate}
              title={collapsed ? t('updates') : undefined}
              className={`relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                collapsed ? 'md:justify-center md:px-0' : ''
              } ${
                isActive
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-amber-600 dark:text-amber-400 hover:text-foreground hover:bg-accent'
              }`}
            >
              <ArrowDownCircle className="h-5 w-5 shrink-0" />
              <span className={`${collapsed ? 'md:hidden' : ''}`}>{t('updates')}</span>
              {collapsed ? (
                <span className="hidden md:block absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-500" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
              )}
            </Link>
          )
        })()}

        {/* Theme toggle */}
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

        {/* Language selector: full label on mobile/expanded sidebar, icon-only when desktop-collapsed. */}
        <div className={collapsed ? 'md:hidden' : undefined}>
          <LanguageSwitcher className="w-full" />
        </div>
        {collapsed && (
          <div className="hidden md:block">
            <LanguageSwitcher compact className="h-9 w-full" />
          </div>
        )}

        {/* Hide Sidebar toggle, only shown on desktop */}
        <button
          onClick={toggle}
          title={collapsed ? t('showSidebar') : t('hideSidebar')}
          aria-label={collapsed ? t('showSidebar') : t('hideSidebar')}
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
            {collapsed ? t('showSidebar') : t('hideSidebar')}
          </span>
        </button>
      </nav>
    </div>
  )
}
