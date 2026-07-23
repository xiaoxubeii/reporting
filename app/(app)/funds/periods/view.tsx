'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, Lock, Unlock, AlertTriangle, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCurrency } from '@/components/currency-context'
import { useLedgerFetch } from '@/components/accounting-vehicle'
import { formatDate, formatMoney } from '../format'

interface Period { id: string; period_start: string; period_end: string; label: string | null; status: string; closed_at: string | null }
interface CloseEntryLine { accountCode: string; accountName: string; lpName: string | null; amount: number }
interface CloseEntry { id: string; entryDate: string; memo: string | null; sourceType: string | null; lines: CloseEntryLine[] }
interface CloseLine { lpEntityId: string; name: string; amount: number }
interface CloseCategory {
  sourceType: string
  label: string
  capitalEffect: number
  accounts: { code: string; name: string; amount: number }[]
  lines: CloseLine[]
}
interface MonthPreview {
  periodStart: string
  periodEnd: string
  netIncome: number
  categories: CloseCategory[]
  warnings: string[]
}
interface Readiness {
  draftEntries: { count: number; earliest: string | null }
  unpostedBankTxns: { count: number; total: number }
  blockers: string[]
  warnings: string[]
}
interface Preview {
  start: string
  end: string
  months: MonthPreview[]
  totalNetIncome: number
  basis: string
  readiness: Readiness
  warnings: string[]
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Common close-through dates. Any date works; these just save typing. */
function quickEnds(): { key: 'lastMonth' | 'lastQuarter' | 'priorYear'; end: string }[] {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const q = Math.floor(m / 3)
  return [
    { key: 'lastMonth', end: iso(new Date(Date.UTC(y, m, 0))) },
    { key: 'lastQuarter', end: iso(new Date(Date.UTC(y, q * 3, 0))) },
    { key: 'priorYear', end: `${y - 1}-12-31` },
  ]
}

export function PeriodsView() {
  const locale = useLocale()
  const t = useTranslations('Funds.periods')
  const currency = useCurrency()
  const fmt = (v: number) => formatMoney(v, currency, locale)
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)
  const [endDate, setEndDate] = useState(quickEnds()[0].end)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  // Which closed period's allocated transactions are expanded, and their (cached) entries.
  const [openId, setOpenId] = useState<string | null>(null)
  const [entriesById, setEntriesById] = useState<Record<string, CloseEntry[] | 'loading'>>({})
  const lf = useLedgerFetch()

  const load = useCallback(() => {
    setLoading(true)
    lf('/api/accounting/periods').then(r => (r.ok ? r.json() : [])).then(d => setPeriods(Array.isArray(d) ? d : [])).finally(() => setLoading(false))
  }, [lf])
  useEffect(() => { load() }, [load])

  const post = async (body: object) => {
    const res = await lf('/api/accounting/periods', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    return { ok: res.ok, data: await res.json() }
  }

  async function previewThrough(through: string) {
    setBusy(true); setError(null); setPreview(null)
    const { ok, data } = await post({ action: 'preview', endDate: through })
    setBusy(false)
    if (!ok) { setError(data.error ?? t('previewError')); return }
    setPreview(data)
  }
  const runPreview = () => previewThrough(endDate)

  async function confirmClose() {
    setBusy(true); setError(null)
    const { ok, data } = await post({ action: 'close', endDate })
    setBusy(false)
    if (!ok) { setError(data.error ?? t('closeError')); return }
    setPreview(null)
    load()
  }

  // Expand a closed period to show the transactions its close posted (fetched once, then cached).
  async function toggleEntries(id: string) {
    if (openId === id) { setOpenId(null); return }
    setOpenId(id)
    if (!entriesById[id]) {
      setEntriesById(s => ({ ...s, [id]: 'loading' }))
      const res = await lf(`/api/accounting/periods?entriesFor=${id}`)
      const data = res.ok ? await res.json() : []
      setEntriesById(s => ({ ...s, [id]: Array.isArray(data) ? data : [] }))
    }
  }

  async function reopen(id: string) {
    setBusy(true); setError(null)
    const { ok, data } = await post({ action: 'reopen', id })
    setBusy(false)
    if (!ok) { setError(data.error ?? t('reopenError')); return }
    load()
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="border rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium">{t('title')}</p>
        <p className="text-xs text-muted-foreground">
          {t('description')}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {quickEnds().map(q => (
            <button
              key={q.key}
              onClick={() => { setEndDate(q.end); setPreview(null) }}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${q.end === endDate ? 'border-foreground/30 bg-accent font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              {t(`quick.${q.key}`)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">{t('closeThrough')}
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setPreview(null) }}
              className="mt-1 block border rounded px-2 py-1.5 text-sm bg-transparent"
            />
          </label>
          <Button size="sm" variant="outline" onClick={runPreview} disabled={busy || !endDate}>
            {busy && !preview && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}{t('preview')}
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {/* Nothing is posted until this is approved. */}
      {preview && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="text-sm font-medium">
              {t('previewSummary', {
                start: formatDate(preview.start, locale),
                end: formatDate(preview.end, locale),
                amount: fmt(preview.totalNetIncome),
                count: preview.months.length,
              })}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('basisHelp', { basis: preview.basis === 'capital_balance' ? t('capitalBalance') : t('commitment') })}
            </p>
          </div>

          {/* Blockers, not warnings: closing over unposted work silently strands its
              P&L, and the lock then prevents posting it into the period. */}
          {preview.readiness.blockers.map((b, i) => (
            <p key={`b${i}`} className="px-4 py-2 text-xs text-red-600 flex items-start gap-1.5 border-b bg-red-500/5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{b}
            </p>
          ))}

          {[...preview.readiness.warnings, ...preview.warnings].map((w, i) => (
            <p key={`w${i}`} className="px-4 py-2 text-xs text-amber-600 flex items-start gap-1.5 border-b">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{w}
            </p>
          ))}

          {preview.months.map(m => (
            <div key={m.periodStart} className="border-b last:border-b-0">
              <div className="px-4 py-2 flex items-center justify-between bg-muted/20">
                <span className="text-sm font-medium">
                  {formatDate(m.periodStart, locale)} → {formatDate(m.periodEnd, locale)}
                  {m.categories.length === 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{t('noActivity')}</span>}
                </span>
                <span className="font-mono text-sm">{fmt(m.netIncome)}</span>
              </div>

              {m.categories.map(cat => (
                <div key={cat.sourceType} className="px-4 py-2 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{cat.label}</span>
                    <span className="font-mono text-xs">{fmt(cat.capitalEffect)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {cat.accounts.map(a => `${a.code} ${a.name}`).join(', ')} · {t('partnerCount', { count: cat.lines.filter(l => l.amount !== 0).length })}
                  </p>
                </div>
              ))}
            </div>
          ))}

          <div className="px-4 py-3 flex items-center gap-2 border-t bg-muted/30">
            <Button size="sm" onClick={confirmClose} disabled={busy || preview.readiness.blockers.length > 0}>
              {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}<Lock className="h-3.5 w-3.5 mr-1" />{t('closeAndLock')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPreview(null)} disabled={busy}>{t('cancel')}</Button>
            {preview.readiness.blockers.length > 0 && (
              <span className="text-xs text-muted-foreground">{t('resolveBlockers')}</span>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t('loading')}</div>
      ) : periods.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium">{t('period')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('label')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('statusTitle')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {periods.map(p => {
                const isClosed = p.status === 'closed'
                const open = openId === p.id
                const entries = entriesById[p.id]
                return (
                  <Fragment key={p.id}>
                    <tr
                      className={`border-b ${open ? '' : 'last:border-b-0'} ${isClosed ? 'cursor-pointer hover:bg-muted/20' : ''}`}
                      onClick={isClosed ? () => toggleEntries(p.id) : undefined}
                    >
                      <td className="px-3 py-2 font-mono text-xs">
                        <span className="flex items-center gap-1.5">
                          {/* Closed periods expand to show the transactions the close posted. */}
                          {isClosed
                            ? <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
                            : <span className="w-3.5 shrink-0" />}
                          {formatDate(p.period_start, locale)} → {formatDate(p.period_end, locale)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{p.label ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${isClosed ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                          {isClosed ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}{isClosed ? t('status.closed') : t('status.open')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isClosed ? (
                          <button
                            onClick={e => { e.stopPropagation(); reopen(p.id) }}
                            disabled={busy}
                            title={t('reopenHelp')}
                            className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
                          >
                            {t('reopen')}
                          </button>
                        ) : (
                          // Closing runs THROUGH a date, so this previews everything from the
                          // last close up to this period's end — which, for the oldest open
                          // period, is exactly this period alone.
                          <button
                            onClick={e => { e.stopPropagation(); setEndDate(p.period_end); setPreview(null); previewThrough(p.period_end) }}
                            disabled={busy}
                            title={t('previewThrough', { date: formatDate(p.period_end, locale) })}
                            className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
                          >
                            {t('preview')}
                          </button>
                        )}
                      </td>
                    </tr>

                    {isClosed && open && (
                      <tr className="border-b last:border-b-0 bg-muted/10">
                        <td colSpan={4} className="px-3 py-2.5">
                          {entries === undefined || entries === 'loading' ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('loadingTransactions')}</div>
                          ) : entries.length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t('noTransactions')}</p>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-[11px] text-muted-foreground">{t('transactionsHelp')}</p>
                              {entries.map(en => (
                                <div key={en.id} className="rounded border bg-background overflow-hidden">
                                  <div className="flex items-center justify-between px-2.5 py-1.5 border-b bg-muted/30">
                                    <span className="text-xs font-medium">{en.memo ?? en.sourceType ?? t('transaction')}</span>
                                    <span className="text-[11px] text-muted-foreground font-mono">{formatDate(en.entryDate, locale)}</span>
                                  </div>
                                  <table className="w-full text-xs">
                                    <tbody>
                                      {en.lines.map((l, i) => (
                                        <tr key={i} className="border-t first:border-t-0">
                                          <td className="px-2.5 py-1 text-muted-foreground whitespace-nowrap">{[l.accountCode, l.accountName].filter(Boolean).join(' ')}</td>
                                          <td className="px-2.5 py-1">{l.lpName ?? ''}</td>
                                          <td className="px-2.5 py-1 text-right font-mono">{fmt(l.amount)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
