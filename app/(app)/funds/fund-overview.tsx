'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, Landmark, ClipboardList, ArrowRight, Search, X } from 'lucide-react'
import { useCurrency } from '@/components/currency-context'
import { useVehicle, useFundSeg } from '@/components/accounting-vehicle'
import { Card, CardContent } from '@/components/ui/card'
import { SortTh, nextSort, compareVals, type SortState } from '@/components/sortable-th'
import { formatCompactMoney, formatMoney, formatNumber, formatPercent } from './format'

// The fund overview: performance per vehicle, DERIVED FROM THE LEDGER.
//
// This is what used to be the Funds page, where the numbers were typed in — commitments,
// called capital and distributions were hand-entered `fund_cash_flows` rows, cash-on-hand was
// a hand-entered figure, and carry was ESTIMATED with a heuristic because there was no way to
// know the real number.
//
// There is now. Every figure here comes from the capital accounts, and an LP's account is
// already net of the carry the close accrued to the GP — so "net to LP" is exact rather than
// approximated, and there is nothing to type in and nothing to keep in sync.

interface Metrics {
  committed: number; paidIn: number; uncalled: number; distributions: number
  nav: number; totalValue: number
  dpi: number | null; rvpi: number | null; tvpi: number | null; irr: number | null
}
interface Vehicle {
  vehicle: string
  /** Stable registry id — the detail page routes on it. Null for legacy portfolio_group-only vehicles. */
  id: string | null
  vintageYear: number | null
  source: 'ledger' | 'events'
  lpCount: number
  fund: Metrics
  lp: Metrics
  // Absent when the viewer lacks gp_economics — the API omits them rather than zeroing them, so
  // "no carry" and "not allowed to see the carry" stay distinguishable. `lp` is already net of it.
  gp?: Metrics
  carryAccrued?: number
}

type Lens = 'lp' | 'fund'

const moic = (v: number | null, locale: string) => (v == null ? '—' : `${formatNumber(v, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`)
const irrPct = (v: number | null, locale: string) => {
  if (v == null) return '—'
  return formatPercent(v, locale)
}

export function FundOverview() {
  const locale = useLocale()
  const t = useTranslations('Funds.overview')
  const currency = useCurrency()
  const fmt = (v: number) => formatCompactMoney(v, currency, locale)
  const fmtFull = (v: number) => formatMoney(v, currency, locale, 0)
  const router = useRouter()
  const { setVehicle } = useVehicle()
  const fundSeg = useFundSeg()

  // Clicking a vehicle selects it (localStorage-backed context the whole section reads) and opens
  // its detail page — the lead page for the fund. Admin (/funds/status) is reached from there.
  // Route on the stable id (like companies and LPs); a legacy vehicle without one falls back to
  // its name, which the detail page resolves the same way.
  const openVehicle = (v: Vehicle) => {
    setVehicle(v.vehicle, v.id)
    router.push(`/funds/${v.id ?? encodeURIComponent(v.vehicle)}`)
  }

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [asOf, setAsOf] = useState('')
  const [lens, setLens] = useState<Lens>('lp')
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'ledger' | 'events'>('all')
  const [sort, setSort] = useState<SortState>({ key: 'committed', dir: 'desc' })
  const onSort = (key: string) => setSort(s => nextSort(s, key, key === 'vehicle' ? 'asc' : 'desc'))

  const load = useCallback(() => {
    setLoading(true)
    const qs = asOf ? `?asOf=${asOf}` : ''
    fetch(`/api/accounting/fund-economics${qs}`)
      .then(r => (r.ok ? r.json() : { vehicles: [] }))
      .then(d => setVehicles(d.vehicles ?? []))
      .finally(() => setLoading(false))
  }, [asOf])
  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="rounded-lg border p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
      </div>
    )
  }

  // A vehicle with no capital of any kind — commitment, paid-in, distributions or NAV all
  // zero — has nothing to report yet (it exists, but no LP capital has been recorded against
  // it). Showing it is a row of dashes that adds noise, so it is left out.
  const live = vehicles.filter(v =>
    v.fund.committed !== 0 || v.fund.paidIn !== 0 || v.fund.distributions !== 0 || v.fund.nav !== 0
  )
  if (live.length === 0) return <OnboardingEmptyState />

  // The Net-to-LP / Whole-fund toggle only means something when there IS a GP class to carve
  // out. Tracking vehicles cut over from an LP snapshot have only LP-class partners, so net-to-LP
  // and whole-fund are identical and the toggle would look dead. Show it only when it changes a
  // number.
  const hasGpSplit = live.some(v => (v.gp?.paidIn ?? 0) !== 0 || (v.gp?.nav ?? 0) !== 0 || (v.carryAccrued ?? 0) !== 0)
  const effectiveLens: Lens = hasGpSplit ? lens : 'fund'
  const m = (v: Vehicle) => (effectiveLens === 'lp' ? v.lp : v.fund)

  // Search + source filters apply to both the table and the metric boxes, so the totals always
  // describe exactly what's shown.
  const q = search.trim().toLowerCase()
  const filtered = live.filter(v =>
    (sourceFilter === 'all' || v.source === sourceFilter) &&
    (!q || v.vehicle.toLowerCase().includes(q))
  )
  const sortVal = (v: Vehicle): number | string | null =>
    sort.key === 'vehicle' ? v.vehicle : sort.key === 'vintageYear' ? v.vintageYear : (m(v) as any)[sort.key] as number | null
  const sorted = [...filtered].sort((a, b) => compareVals(sortVal(a), sortVal(b), sort.dir) || a.vehicle.localeCompare(b.vehicle))

  const totals = filtered.reduce((acc, v) => {
    const x = m(v)
    acc.committed += x.committed; acc.paidIn += x.paidIn; acc.uncalled += x.uncalled
    acc.distributions += x.distributions; acc.nav += x.nav; acc.totalValue += x.totalValue
    acc.carry += v.carryAccrued ?? 0
    return acc
  }, { committed: 0, paidIn: 0, uncalled: 0, distributions: 0, nav: 0, totalValue: 0, carry: 0 })

  // Ratios computed AFTER summing — never averaged across vehicles.
  const tTvpi = totals.paidIn > 0 ? totals.totalValue / totals.paidIn : null
  const tDpi = totals.paidIn > 0 ? totals.distributions / totals.paidIn : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: filters, to balance the "As of" control on the right. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('searchPlaceholder')}
              className="h-8 w-48 pl-8 pr-8 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {search && (
              <button onClick={() => setSearch('')} aria-label={t('clearSearch')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value as 'all' | 'ledger' | 'events')}
            aria-label={t('sourceFilter')}
            className="h-8 px-2 rounded-md border border-input bg-background text-sm text-muted-foreground"
          >
            <option value="all">{t('allVehicles')}</option>
            <option value="ledger">{t('fundAccounting')}</option>
            <option value="events">{t('lpTracking')}</option>
          </select>

          {/* Net to LP is the honest default: what an LP would actually receive, now exact rather
              than a carry estimate. Only shown when a GP class exists to carve out — otherwise the
              two lenses are identical and the control looks dead. */}
          {hasGpSplit && (
            <div className="inline-flex rounded-md border p-0.5 text-xs">
              {(['lp', 'fund'] as Lens[]).map(l => (
                <button
                  key={l}
                  onClick={() => setLens(l)}
                  className={`px-2 py-1 rounded ${lens === l ? 'bg-muted font-medium' : 'text-muted-foreground'}`}
                >
                  {l === 'lp' ? t('netToLp') : t('wholeFund')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Label to the LEFT of the input, on one line. */}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t('asOf')}
          <input
            type="date"
            value={asOf}
            onChange={e => setAsOf(e.target.value)}
            className="h-8 px-2 rounded-md border border-input bg-background text-sm"
          />
        </label>
      </div>

      {/* Metric boxes — same Card treatment as an LP snapshot, so the two pages read as one. */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <MetricBox label={t('metrics.committed')} value={fmt(totals.committed)} />
        <MetricBox label={t('metrics.called')} value={fmt(totals.paidIn)} />
        <MetricBox label={t('metrics.distributed')} value={fmt(totals.distributions)} />
        <MetricBox label={t('metrics.nav')} value={fmt(totals.nav)} />
        <MetricBox label={t('metrics.tvpi')} value={moic(tTvpi, locale)} />
        <MetricBox label={t('metrics.dpi')} value={moic(tDpi, locale)} />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <SortTh label={t('columns.vehicle')} sortKey="vehicle" sort={sort} onSort={onSort} />
              <SortTh label={t('columns.vintage')} sortKey="vintageYear" sort={sort} onSort={onSort} />
              <SortTh label={t('metrics.committed')} sortKey="committed" sort={sort} onSort={onSort} align="right" />
              <SortTh label={t('metrics.called')} sortKey="paidIn" sort={sort} onSort={onSort} align="right" />
              <SortTh label={t('columns.notCalled')} sortKey="uncalled" sort={sort} onSort={onSort} align="right" />
              <SortTh label={t('metrics.distributed')} sortKey="distributions" sort={sort} onSort={onSort} align="right" />
              <SortTh label={t('metrics.nav')} sortKey="nav" sort={sort} onSort={onSort} align="right" />
              <SortTh label={t('metrics.dpi')} sortKey="dpi" sort={sort} onSort={onSort} align="right" />
              <SortTh label={t('columns.rvpi')} sortKey="rvpi" sort={sort} onSort={onSort} align="right" />
              <SortTh label={t('metrics.tvpi')} sortKey="tvpi" sort={sort} onSort={onSort} align="right" />
              <SortTh label={t('columns.irr')} sortKey="irr" sort={sort} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">{t('noMatches')}</td></tr>
            )}
            {sorted.map(v => {
              const x = m(v)
              return (
                <tr key={v.vehicle} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">
                    <button onClick={() => openVehicle(v)} title={v.vehicle} className="text-left hover:underline hover:text-foreground truncate max-w-[220px] block">
                      {v.vehicle}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{v.vintageYear == null ? '—' : formatNumber(v.vintageYear, locale, { useGrouping: false })}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtFull(x.committed)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtFull(x.paidIn)}</td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmtFull(x.uncalled)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtFull(x.distributions)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtFull(x.nav)}</td>
                  <td className="px-3 py-2 text-right font-mono">{moic(x.dpi, locale)}</td>
                  <td className="px-3 py-2 text-right font-mono">{moic(x.rvpi, locale)}</td>
                  <td className="px-3 py-2 text-right font-mono font-medium">{moic(x.tvpi, locale)}</td>
                  <td className="px-3 py-2 text-right font-mono">{irrPct(x.irr, locale)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground max-w-3xl">
        {effectiveLens === 'lp' ? (
          t.rich('lpHelp', {
            strong: chunks => <strong>{chunks}</strong>,
            carry: totals.carry !== 0 ? fmtFull(totals.carry) : t('noCarry'),
          })
        ) : (
          t.rich('fundHelp', { strong: chunks => <strong>{chunks}</strong> })
        )}
      </p>
    </div>
  )
}

/** Same card treatment as the LP snapshot metric boxes, so the two pages read as one. */
function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

/**
 * Shown when no vehicle carries any capital yet — so instead of an empty table, explain the
 * two ways to onboard one. They are the same two producers the whole section is built on:
 * capital tracking (events, no books) and the full ledger. Both land in the same capital
 * accounts and feed this overview identically.
 */
function OnboardingEmptyState() {
  const t = useTranslations('Funds.overview.empty')
  const fundSeg = useFundSeg()
  return (
    <div className="rounded-lg border p-6 max-w-2xl space-y-5">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('description')}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">{t('trackingTitle')}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('trackingHelp')}
          </p>
        </div>
        <div className="rounded-md border p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">{t('ledgerTitle')}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('ledgerHelp')}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t('waysIn')}</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            {t('addVehicle')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={fundSeg ? `/funds/${fundSeg}/capital-accounts` : '/funds'}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            {t('addCapital')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={fundSeg ? `/funds/${fundSeg}/opening-balances` : '/funds'}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            {t('importSnapshot')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}
