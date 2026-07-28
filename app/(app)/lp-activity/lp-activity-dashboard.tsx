'use client'

import { useEffect, useMemo, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Loader2, LogIn, Eye, ArrowDownCircle, Search } from 'lucide-react'

interface ActivityEvent {
  id: string
  createdAt: string
  eventType: 'login' | 'view' | 'download' | string
  targetType: 'portal' | 'snapshot' | 'letter' | 'document' | string
  targetId: string | null
  targetTitle: string | null
  personId: string | null
  personName: string
  personEmail: string | null
  personKind: string | null
  investorName: string | null
}

interface Person {
  id: string
  name: string
  email: string | null
  kind: string | null
  logins: number
  views: number
  downloads: number
  total: number
  lastSeen: string
}

interface Summary {
  totalEvents: number
  logins: number
  views: number
  downloads: number
  activePeople: number
}

interface ActivityData {
  events: ActivityEvent[]
  people: Person[]
  summary: Summary
  days: number
  truncated: boolean
}

const RANGE_OPTIONS = [7, 30, 90, 365, 3650] as const

const EVENT_META: Record<string, { icon: typeof Eye; className: string }> = {
  login: { icon: LogIn, className: 'text-blue-600 dark:text-blue-400' },
  view: { icon: Eye, className: 'text-emerald-600 dark:text-emerald-400' },
  download: { icon: ArrowDownCircle, className: 'text-violet-600 dark:text-violet-400' },
}

const KNOWN_EVENTS = ['login', 'view', 'download'] as const
const KNOWN_TARGETS = ['portal', 'snapshot', 'letter', 'document'] as const

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return { unit: 'now' as const, count: 0 }
  if (mins < 60) return { unit: 'minute' as const, count: mins }
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return { unit: 'hour' as const, count: hrs }
  const days = Math.floor(hrs / 24)
  if (days < 30) return { unit: 'day' as const, count: days }
  return { unit: 'date' as const, count: 0 }
}

export function LpActivityDashboard() {
  const t = useTranslations('LPActivity')
  const format = useFormatter()
  const locale = useLocale()
  const formatNumber = (value: number) => new Intl.NumberFormat(locale).format(value)
  const formatRelative = (iso: string) => {
    const relative = relativeTime(iso)
    return relative.unit === 'date'
      ? format.dateTime(new Date(iso), {
          month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
        })
      : t(`relative.${relative.unit}`, { count: relative.count })
  }
  const [data, setData] = useState<ActivityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [days, setDays] = useState(90)
  const [search, setSearch] = useState('')
  const [personFilter, setPersonFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [targetFilter, setTargetFilter] = useState('all')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/lp-activity?days=${days}`)
      .then(res => { if (!res.ok) throw new Error(t('errors.load')); return res.json() })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [days, t])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.events.filter(e => {
      if (personFilter !== 'all' && e.personId !== personFilter) return false
      if (eventFilter !== 'all' && e.eventType !== eventFilter) return false
      if (targetFilter !== 'all' && e.targetType !== targetFilter) return false
      if (q) {
        const hay = `${e.personName} ${e.personEmail ?? ''} ${e.targetTitle ?? ''} ${e.investorName ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data, search, personFilter, eventFilter, targetFilter])

  const selectClass = 'h-8 rounded-md border border-input bg-background px-2 text-sm'

  return (
    <div className="p-4 md:py-8 md:pl-8 md:pr-4">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        {t('description')}
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-12">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 text-destructive text-sm p-4">{error}</div>
      )}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{t('summary.activePeople')}</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{formatNumber(data.summary.activePeople)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{t('summary.logins')}</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{formatNumber(data.summary.logins)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{t('summary.views')}</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{formatNumber(data.summary.views)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{t('summary.downloads')}</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{formatNumber(data.summary.downloads)}</div></CardContent>
            </Card>
          </div>

          {/* Per-person rollup */}
          {data.people.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold mb-2">{t('people.title')}</h2>
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">{t('columns.person')}</th>
                      <th className="px-4 py-2.5 font-medium">{t('columns.role')}</th>
                      <th className="px-4 py-2.5 font-medium text-right">{t('summary.logins')}</th>
                      <th className="px-4 py-2.5 font-medium text-right">{t('summary.views')}</th>
                      <th className="px-4 py-2.5 font-medium text-right">{t('summary.downloads')}</th>
                      <th className="px-4 py-2.5 font-medium">{t('columns.lastActive')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.people.map(p => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => setPersonFilter(p.id === personFilter ? 'all' : p.id)}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{p.name}</div>
                          {p.email && p.email !== p.name && <div className="text-xs text-muted-foreground">{p.email}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.kind === 'authorized_user' ? t('roles.authorizedUser') : t('roles.lp')}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{p.logins}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{p.views}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{p.downloads}</td>
                        <td className="px-4 py-2.5 text-muted-foreground" title={formatDateTime(p.lastSeen, locale)}>{formatRelative(p.lastSeen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('filters.search')} className="h-8 pl-8 text-sm" />
            </div>
            <select className={selectClass} value={personFilter} onChange={e => setPersonFilter(e.target.value)}>
              <option value="all">{t('filters.allPeople')}</option>
              {data.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className={selectClass} value={eventFilter} onChange={e => setEventFilter(e.target.value)}>
              <option value="all">{t('filters.allEvents')}</option>
              <option value="login">{t('summary.logins')}</option>
              <option value="view">{t('summary.views')}</option>
              <option value="download">{t('summary.downloads')}</option>
            </select>
            <select className={selectClass} value={targetFilter} onChange={e => setTargetFilter(e.target.value)}>
              <option value="all">{t('filters.allTypes')}</option>
              <option value="snapshot">{t('targets.snapshotPlural')}</option>
              <option value="letter">{t('targets.letterPlural')}</option>
              <option value="document">{t('targets.documentPlural')}</option>
              <option value="portal">{t('targets.portal')}</option>
            </select>
            <select className={selectClass} value={days} onChange={e => setDays(Number(e.target.value))}>
              {RANGE_OPTIONS.map(value => <option key={value} value={value}>{t(`ranges.${value}`)}</option>)}
            </select>
          </div>

          {/* Event feed */}
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">{t('columns.when')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('columns.person')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('columns.action')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('columns.item')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('columns.investor')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const meta = EVENT_META[e.eventType]
                  const Icon = meta?.icon ?? Eye
                  return (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap" title={formatDateTime(e.createdAt, locale)}>{formatRelative(e.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{e.personName}</div>
                        {e.personKind === 'authorized_user' && <div className="text-xs text-muted-foreground">{t('roles.authorizedUser')}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 ${meta?.className ?? ''}`}>
                          <Icon className="h-3.5 w-3.5" /> {KNOWN_EVENTS.includes(e.eventType as (typeof KNOWN_EVENTS)[number])
                            ? t(`events.${e.eventType as (typeof KNOWN_EVENTS)[number]}`)
                            : e.eventType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {e.eventType === 'login' ? (
                          <span className="text-muted-foreground">{t('loggedIn')}</span>
                        ) : (
                          <>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1.5">{KNOWN_TARGETS.includes(e.targetType as (typeof KNOWN_TARGETS)[number])
                              ? t(`targets.${e.targetType as (typeof KNOWN_TARGETS)[number]}`)
                              : e.targetType}</span>
                            {e.targetTitle ?? '—'}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{e.investorName ?? '—'}</td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">{t('empty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            {data.truncated
              ? t('showingTruncated', { shown: filtered.length, total: data.events.length })
              : t('showing', { shown: filtered.length, total: data.events.length })}
          </div>
        </>
      )}

    </div>
  )
}
