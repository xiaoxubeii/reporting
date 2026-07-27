'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Lock } from 'lucide-react'

interface DailyRow {
  date: string
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  estimated_cost: number
}

interface ProviderMTD {
  input_tokens: number
  output_tokens: number
  estimated_cost: number
}

interface UserSummary {
  userId: string
  email: string
  displayName: string | null
  actions: Record<string, number>
  total: number
}

interface RecentActivity {
  userId: string
  email: string
  displayName: string | null
  action: string
  metadata: Record<string, unknown>
  createdAt: string
}

interface ActivityData {
  userSummary: UserSummary[]
  recent: RecentActivity[]
}

interface MonthlyRow {
  month: string
  input_tokens: number
  output_tokens: number
  estimated_cost: number
}

interface UsageData {
  daily: DailyRow[]
  monthly: MonthlyRow[]
  mtd: Record<string, ProviderMTD | number> & { total_estimated_cost: number }
  activity?: ActivityData
}

function formatTokens(n: number, locale: string) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return new Intl.NumberFormat(locale).format(n)
}

function formatCost(n: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(n)
}

const KNOWN_ACTIONS = [
  'login',
  'logout',
  'company.create',
  'company.update',
  'company.summary',
  'company.document_upload',
  'import.data',
  'import.documents',
  'review.resolve',
  'requests.send',
  'settings.update',
  'note.create',
] as const

function categorizeActions(actions: Record<string, number>) {
  let logins = 0
  let companies = 0
  let imports = 0
  let other = 0
  for (const [action, count] of Object.entries(actions)) {
    if (action === 'login' || action === 'logout') logins += count
    else if (action.startsWith('company.')) companies += count
    else if (action.startsWith('import.')) imports += count
    else other += count
  }
  return { logins, companies, imports, other }
}

function relativeTime(dateString: string) {
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 60) return { unit: 'now' as const, count: 0 }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return { unit: 'minute' as const, count: minutes }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { unit: 'hour' as const, count: hours }
  const days = Math.floor(hours / 24)
  return { unit: 'day' as const, count: days }
}

export function UsageDashboard() {
  const t = useTranslations('Usage')
  const locale = useLocale()
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/usage')
      .then(res => {
        if (!res.ok) throw new Error(t('errors.load'))
        return res.json()
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [t])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (!data) return null

  const providers = Object.entries(data.mtd)
    .filter(([key]) => key !== 'total_estimated_cost')
    .map(([name, stats]) => ({ name, ...(stats as ProviderMTD) }))

  const totalCost = data.mtd.total_estimated_cost as number
  const now = new Date()
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(now)

  const activity = data.activity

  return (
    <div className="p-4 md:py-8 md:pl-8 md:pr-4">
      <div className="mb-6 space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Lock className="h-4 w-4 text-amber-500" />{t('title')}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{t('monthToDate', { month: monthLabel })}</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex-1 min-w-0 w-full space-y-8">

      {/* MTD summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map(p => (
          <Card key={p.name}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium capitalize">{p.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-2xl font-bold">{formatCost(p.estimated_cost, locale)}</p>
              <p className="text-xs text-muted-foreground">
                {t('tokenSummary', {
                  input: formatTokens(p.input_tokens, locale),
                  output: formatTokens(p.output_tokens, locale),
                })}
              </p>
            </CardContent>
          </Card>
        ))}
        {providers.length > 1 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t('monthTotal')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCost(totalCost, locale)}</p>
              <p className="text-xs text-muted-foreground">{t('allProviders')}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Daily breakdown table */}
      <div>
        <h2 className="text-lg font-medium mb-3">{t('daily.title')}</h2>
        {data.daily.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('daily.empty')}</p>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium px-4 py-2.5">{t('columns.date')}</th>
                  <th className="text-left font-medium px-4 py-2.5">{t('columns.provider')}</th>
                  <th className="text-left font-medium px-4 py-2.5">{t('columns.model')}</th>
                  <th className="text-right font-medium px-4 py-2.5">{t('columns.inputTokens')}</th>
                  <th className="text-right font-medium px-4 py-2.5">{t('columns.outputTokens')}</th>
                  <th className="text-right font-medium px-4 py-2.5">{t('columns.cost')}</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-2.5">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${row.date}T00:00:00Z`))}</td>
                    <td className="px-4 py-2.5 capitalize">{row.provider}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{row.model}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatTokens(row.input_tokens, locale)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatTokens(row.output_tokens, locale)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCost(row.estimated_cost, locale)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-medium">
                  <td className="px-4 py-2.5" colSpan={3}>{t('total')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatTokens(data.daily.reduce((s, r) => s + r.input_tokens, 0), locale)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatTokens(data.daily.reduce((s, r) => s + r.output_tokens, 0), locale)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCost(data.daily.reduce((s, r) => s + r.estimated_cost, 0), locale)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Monthly summary table */}
      {data.monthly.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-3">{t('monthly.title')}</h2>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium px-4 py-2.5">{t('columns.month')}</th>
                  <th className="text-right font-medium px-4 py-2.5">{t('columns.inputTokens')}</th>
                  <th className="text-right font-medium px-4 py-2.5">{t('columns.outputTokens')}</th>
                  <th className="text-right font-medium px-4 py-2.5">{t('columns.cost')}</th>
                </tr>
              </thead>
              <tbody>
                {data.monthly.map((row) => {
                  const [y, m] = row.month.split('-')
                  const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(parseInt(y), parseInt(m) - 1)))
                  return (
                    <tr key={row.month} className="border-b last:border-0">
                      <td className="px-4 py-2.5">{label}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatTokens(row.input_tokens, locale)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatTokens(row.output_tokens, locale)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatCost(row.estimated_cost, locale)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-medium">
                  <td className="px-4 py-2.5">{t('total')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatTokens(data.monthly.reduce((s, r) => s + r.input_tokens, 0), locale)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatTokens(data.monthly.reduce((s, r) => s + r.output_tokens, 0), locale)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCost(data.monthly.reduce((s, r) => s + r.estimated_cost, 0), locale)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* User activity disabled notice */}
      {!activity && (
        <div className="rounded-lg border bg-muted/30 p-5">
          <p className="text-sm text-muted-foreground">{t.rich('activityDisabled', {
            settings: chunks => <a href="/settings" className="underline underline-offset-4 hover:text-foreground">{chunks}</a>,
          })}</p>
        </div>
      )}

      {/* User Activity Summary */}
      {activity && activity.userSummary.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-3">{t('userSummary.title')}</h2>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium px-4 py-2.5">{t('columns.user')}</th>
                  <th className="text-right font-medium px-4 py-2.5">{t('columns.logins')}</th>
                  <th className="text-right font-medium px-4 py-2.5">{t('columns.companies')}</th>
                  <th className="text-right font-medium px-4 py-2.5">{t('columns.imports')}</th>
                  <th className="text-right font-medium px-4 py-2.5">{t('columns.other')}</th>
                  <th className="text-right font-medium px-4 py-2.5">{t('total')}</th>
                </tr>
              </thead>
              <tbody>
                {activity.userSummary.map(u => {
                  const cats = categorizeActions(u.actions)
                  return (
                    <tr key={u.userId} className="border-b last:border-0">
                      <td className="px-4 py-2.5">
                        <div>{u.displayName || u.email}</div>
                        {u.displayName && (
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{cats.logins}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{cats.companies}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{cats.imports}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{cats.other}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{u.total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Activity Feed */}
      {activity && activity.recent.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-3">{t('recent.title')}</h2>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium px-4 py-2.5">{t('columns.time')}</th>
                  <th className="text-left font-medium px-4 py-2.5">{t('columns.user')}</th>
                  <th className="text-left font-medium px-4 py-2.5">{t('columns.action')}</th>
                </tr>
              </thead>
              <tbody>
                {activity.recent.map((entry, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{(() => {
                      const relative = relativeTime(entry.createdAt)
                      return t(`relative.${relative.unit}`, { count: relative.count })
                    })()}</td>
                    <td className="px-4 py-2.5">{entry.displayName || entry.email}</td>
                    <td className="px-4 py-2.5">{KNOWN_ACTIONS.includes(entry.action as (typeof KNOWN_ACTIONS)[number])
                      ? t(`actions.${entry.action as (typeof KNOWN_ACTIONS)[number]}`)
                      : entry.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
    </div>
    </div>
  )
}
