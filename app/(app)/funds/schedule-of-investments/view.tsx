'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, AlertTriangle, Check, Download, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrency } from '@/components/currency-context'
import { useLedgerFetch } from '@/components/accounting-vehicle'
import { PeriodPicker } from '@/components/accounting/period-picker'
import type { PeriodPreset } from '@/lib/accounting/statement-period'
import { formatDate, formatMoney, formatNumber, formatPercent } from '../format'

interface SoiRow {
  name: string
  cost: number
  fairValue: number
  pctOfNetAssets: number
  companyId?: string
  industry?: string | null
  assetType?: string
  shares?: number | null
  sharePrice?: number | null
  moic?: number | null
  // Present once the company has its own 1100-<id> / 1200-<id> accounts.
  ledgerCost?: number
  ledgerFairValue?: number
  tiesOut?: boolean
}
interface SoiGroup { name: string; cost: number; fairValue: number; pctOfNetAssets: number }
interface HistoryEvent {
  date: string
  companyId: string
  companyName: string
  costDelta: number
  carryingDelta: number
  unrealizedDelta: number
}
interface HistoryPreview {
  events: HistoryEvent[]
  dates: string[]
  totalCost: number
  totalUnrealized: number
  warnings: string[]
}
interface Soi {
  rows: SoiRow[]
  totalCost: number
  totalFairValue: number
  netAssets: number
  source: 'tracker' | 'ledger'
  ledgerCost: number
  ledgerFairValue: number
  costVariance: number
  fairValueVariance: number
  byIndustry: SoiGroup[]
  byGeography: SoiGroup[]
  byAssetType: SoiGroup[]
}

export function ScheduleOfInvestmentsView() {
  const t = useTranslations('Funds.schedule')
  const locale = useLocale()
  const currency = useCurrency()
  const fmt = (v: number) => formatMoney(v, currency, locale)
  const pct = (v: number) => formatPercent(v, locale)
  const [soi, setSoi] = useState<Soi | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [bootDate, setBootDate] = useState(new Date().toISOString().slice(0, 10))
  // Onboarding: replay the dated history (default) vs. book one snapshot (cutover).
  const [mode, setMode] = useState<'history' | 'snapshot'>('history')
  const [from, setFrom] = useState('')
  const [hist, setHist] = useState<HistoryPreview | null>(null)
  const [showEvents, setShowEvents] = useState(false)
  const [preset, setPreset] = useState<PeriodPreset>('itd')
  const [asOf, setAsOf] = useState('') // '' = latest
  const lf = useLedgerFetch()

  const load = useCallback(() => {
    setLoading(true)
    const qs = new URLSearchParams({ preset })
    if (asOf) qs.set('asOf', asOf)
    lf(`/api/accounting/statements?${qs}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setSoi(d?.scheduleOfInvestments ?? null))
      .finally(() => setLoading(false))
  }, [lf, preset, asOf])
  useEffect(() => { load() }, [load])

  const post = async (body: object, reload = true) => {
    setBusy(true); setError(null); setNote(null)
    const res = await lf('/api/accounting/investments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? t('failed')); return null }
    if (reload) load()
    return data
  }

  async function bootstrap(force = false) {
    const d = await post({ action: 'bootstrap', entryDate: bootDate, offset: 'cash', force })
    if (d) setNote(t('booked', { companies: d.companies, cost: fmt(d.cost), unrealized: fmt(d.unrealized) }))
  }

  // Preview first, always. The replay writes one entry per date per kind — dozens of
  // them for a fund with years of history — so the user sees the shape before it lands.
  async function previewHistory() {
    setHist(null)
    const d = await post({ action: 'previewHistory', from: from || null }, false)
    if (d) setHist(d as HistoryPreview)
  }

  async function replayHistory(force = false) {
    const d = await post({ action: 'replayHistory', from: from || null, force })
    if (d) {
      setHist(null)
      setNote(t('replayed', { entries: d.entries, dates: d.dates, cost: fmt(d.cost), unrealized: fmt(d.unrealized) }))
    }
  }

  const content = (() => {
    if (!soi) return null
    const tied = soi.costVariance === 0 && soi.fairValueVariance === 0
    // Tracker has positions, ledger has nothing — the case the Status page blocks on.
    const needsBootstrap = soi.source === 'tracker' && Math.abs(soi.ledgerCost) < 0.005 && soi.rows.length > 0
    const num = (v: number | null | undefined, dp = 0) =>
      v == null ? '—' : formatNumber(v, locale, { minimumFractionDigits: dp, maximumFractionDigits: dp })

    const groupTable = (title: string, groups: SoiGroup[]) => (
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium">{title}</th>
              <th className="text-right px-3 py-2 font-medium">{t('columns.cost')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('columns.fairValue')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('columns.percentNetAssets')}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <tr key={g.name} className="border-b last:border-b-0">
                <td className="px-3 py-2">{g.name}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(g.cost)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(g.fairValue)}</td>
                <td className="px-3 py-2 text-right font-mono text-muted-foreground">{pct(g.pctOfNetAssets)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )

    return (
      <>
      {/* The SOI's rows come from the portfolio tracker; the ledger is the control
          total. If they disagree, say so loudly rather than showing a tidy number. */}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {note && <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1.5"><Check className="h-4 w-4" />{note}</p>}

      {/* The tracker knows the fund holds these companies but the ledger doesn't.
          Booking them RECLASSIFIES out of cash — the cutover opening already credited
          partners' capital for the whole NAV, so crediting it again here would book
          the fund's equity twice. */}
      {needsBootstrap && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-3">
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />{t('bootstrap.title')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('bootstrap.description', { positions: soi.rows.length, cost: fmt(soi.totalCost), fairValue: fmt(soi.totalFairValue) })}
            </p>
          </div>

          <div className="flex gap-1 text-xs">
            {([['history', t('bootstrap.historyTab')], ['snapshot', t('bootstrap.snapshotTab')]] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => { setMode(m); setHist(null); setError(null) }}
                className={`rounded border px-2.5 py-1 ${mode === m ? 'border-amber-500/60 bg-background font-medium' : 'border-transparent text-muted-foreground hover:bg-background/50'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* The default, and the right answer for a fund being built from full history:
              each purchase and each mark posts on the date it actually happened, so the
              income statement shows the gain in the period it was earned and the close
              allocates it to whoever held capital then. A single lump entry cannot. */}
          {mode === 'history' && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t('history.description')}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-muted-foreground">{t('history.skipThrough')} <span className="text-muted-foreground/70">{t('optional')}</span>
                  <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setHist(null) }} className="mt-1 h-9 w-40" />
                </label>
                <Button size="sm" variant="outline" onClick={previewHistory} disabled={busy}>
                  {busy && !hist ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <History className="h-4 w-4 mr-1" />}
                  {t('history.preview')}
                </Button>
              </div>

              {hist && (
                <div className="rounded border bg-background p-3 space-y-2">
                  <p className="text-sm">
                    {t.rich('history.summary', {
                      events: hist.events.length,
                      dates: hist.dates.length,
                      range: hist.dates.length > 0 ? t('history.range', { start: formatDate(hist.dates[0], locale), end: formatDate(hist.dates[hist.dates.length - 1], locale) }) : '',
                      cost: fmt(hist.totalCost), unrealized: fmt(hist.totalUnrealized),
                      strong: chunks => <strong>{chunks}</strong>, mono: chunks => <span className="font-mono">{chunks}</span>,
                    })}
                  </p>

                  {/* The tracker is the control total. If the replay wouldn't land on it,
                      say so rather than posting dozens of entries that don't tie. */}
                  {Math.abs(hist.totalCost - soi.totalCost) > 0.005 || Math.abs(hist.totalCost + hist.totalUnrealized - soi.totalFairValue) > 0.005 ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {t('history.mismatch', { carryingValue: fmt(hist.totalCost + hist.totalUnrealized), trackerValue: fmt(soi.totalFairValue) })}
                    </p>
                  ) : (
                    <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" />{t('history.ties')}
                    </p>
                  )}

                  {hist.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />{w}
                    </p>
                  ))}

                  <button
                    onClick={() => setShowEvents(s => !s)}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    {t(showEvents ? 'history.hideEvents' : 'history.showEvents', { count: hist.events.length })}
                  </button>

                  {showEvents && (
                    <div className="max-h-64 overflow-y-auto border rounded">
                      <table className="w-full text-xs whitespace-nowrap">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                          <tr className="border-b">
                            <th className="text-left px-2 py-1.5 font-medium">{t('columns.date')}</th>
                            <th className="text-left px-2 py-1.5 font-medium">{t('columns.investment')}</th>
                            <th className="text-right px-2 py-1.5 font-medium">{t('columns.purchase')}</th>
                            <th className="text-right px-2 py-1.5 font-medium">{t('columns.mark')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hist.events.map((e, i) => (
                            <tr key={i} className="border-b last:border-b-0">
                              <td className="px-2 py-1 font-mono text-muted-foreground">{formatDate(e.date, locale)}</td>
                              <td className="px-2 py-1">{e.companyName}</td>
                              <td className="px-2 py-1 text-right font-mono">{e.costDelta === 0 ? '—' : fmt(e.costDelta)}</td>
                              <td className={`px-2 py-1 text-right font-mono ${e.unrealizedDelta < 0 ? 'text-red-600' : ''}`}>
                                {e.unrealizedDelta === 0 ? '—' : fmt(e.unrealizedDelta)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" onClick={() => replayHistory(hist.warnings.length > 0)} disabled={busy || hist.events.length === 0}>
                      {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <History className="h-4 w-4 mr-1" />}
                      {t(hist.warnings.length > 0 ? 'history.replayAnyway' : 'history.replay')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setHist(null)} disabled={busy}>{t('cancel')}</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* The cutover case: the fund's books start on a date and the history before it
              is somebody else's problem. One entry, everything at its carrying value. */}
          {mode === 'snapshot' && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t('snapshot.description')}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-muted-foreground">{t('asOf')}
                  <Input type="date" value={bootDate} onChange={e => setBootDate(e.target.value)} className="mt-1 h-9 w-40" />
                </label>
                <Button size="sm" variant="outline" onClick={() => bootstrap()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                  {t('snapshot.book')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${tied ? 'text-muted-foreground' : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
        {tied ? <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-600" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
        {tied ? (
          <span>{t('tieOut.tied', { cost: fmt(soi.ledgerCost), fairValue: fmt(soi.ledgerFairValue) })}</span>
        ) : (
          <span>
            {t.rich('tieOut.notTied', {
              trackerCost: fmt(soi.totalCost), trackerFairValue: fmt(soi.totalFairValue), ledgerCost: fmt(soi.ledgerCost),
              ledgerFairValue: fmt(soi.ledgerFairValue), costVariance: fmt(soi.costVariance), fairValueVariance: fmt(soi.fairValueVariance),
              strong: chunks => <strong>{chunks}</strong>, mono: chunks => <span className="font-mono">{chunks}</span>,
            })}
          </span>
        )}
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium">{t('columns.investment')}</th>
              <th className="text-left px-3 py-2 font-medium">{t('columns.industry')}</th>
              <th className="text-left px-3 py-2 font-medium">{t('columns.type')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('columns.shares')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('columns.price')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('columns.cost')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('columns.fairValue')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('columns.moic')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('columns.percentNetAssets')}</th>
            </tr>
          </thead>
          <tbody>
            {soi.rows.map((r, i) => (
              <tr key={r.name + i} className="border-b last:border-b-0 hover:bg-muted/20">
                <td className="px-3 py-2">
                  {r.name}
                  {/* A per-company tie-out is only possible once the company has its own
                      accounts. The aggregate line can't tell you which position is off. */}
                  {r.tiesOut === false && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400">{t('offLedger')}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.industry ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.assetType ?? '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{num(r.shares)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{r.sharePrice == null ? '—' : fmt(r.sharePrice)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.cost)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.fairValue)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{r.moic == null ? '—' : `${formatNumber(r.moic, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`}</td>
                <td className="px-3 py-2 text-right font-mono text-muted-foreground">{pct(r.pctOfNetAssets)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2" colSpan={5}>{t('total')}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt(soi.totalCost)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt(soi.totalFairValue)}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {soi.source === 'tracker' && (
        <div className="grid gap-4 md:grid-cols-2">
          {soi.byIndustry.length > 0 && groupTable(t('groups.industry'), soi.byIndustry)}
          {soi.byAssetType.length > 0 && groupTable(t('groups.assetType'), soi.byAssetType)}
          {soi.byGeography.length > 0 && groupTable(t('groups.geography'), soi.byGeography)}
        </div>
      )}
      </>
    )
  })()

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {/* As-of snapshot date — SOI is a point in time, so only the period END matters.
            No custom range: the presets + As of cover every as-of date. */}
        <span className="text-sm text-muted-foreground">{t('investments')}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <PeriodPicker
            preset={preset} onPreset={setPreset}
            start="" end="" onStart={() => {}} onEnd={() => {}}
            asOf={asOf} onAsOf={setAsOf}
            allowAsOf allowCustom={false}
            presets={['this_quarter', 'last_quarter', 'ytd', 'prior_year', 'itd']}
            title={t('pickerTitle')}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t('loading')}</div>
      ) : !soi || soi.rows.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground">{t('empty', { date: asOf ? formatDate(asOf, locale) : t('today') })}</div>
      ) : (
        content
      )}
    </div>
  )
}
