'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useLpPortalEnabled, useIsAdmin } from '@/components/feature-visibility-context'
import Link from 'next/link'
import { Loader2, Check, AlertTriangle, Landmark, ChevronRight, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useCurrency } from '@/components/currency-context'
import { useLedgerFetch, useFundSeg } from '@/components/accounting-vehicle'
import { type PeriodPreset } from '@/lib/accounting/statement-period'
import { PeriodPicker } from '@/components/accounting/period-picker'
import { ReconciliationPanel } from './reconciliation-panel'
import { type CapitalSource } from './capital-source-card'
import { GpPanel } from './gp-panel'
import { useCanRead } from '@/components/access-context'
import { SortTh, nextSort, compareVals, type SortState } from '@/components/sortable-th'
import { formatDate, formatMoney } from '../format'

interface Account {
  beginning: number
  contributions: number
  distributions: number
  managementFees: number
  expenses: number
  operatingIncome: number
  realizedGains: number
  unrealizedGains: number
  fxTranslation: number
  transfers: number
  carriedInterest: number
  unclassified: number
  ending: number
}
interface Row extends Account {
  lpEntityId: string
  name: string
  partnerClass: string
  commitment: number
  called: number
  funded: number
  outstanding: number
  receivable: number
  period: Account | null
  itd: Account
}
interface CallLine { lpEntityId: string; name: string; amount: number }
interface CallRow { id: string; callDate: string; description: string | null; scope: string; total: number; lines: CallLine[] }
interface Period { preset: PeriodPreset; start: string | null; end: string | null; label: string }

/** Commitment / called / funded come from the call register; the rest is the roll-forward.
 *  They live on one table because "funded vs outstanding" is just the capital account
 *  seen from the commitment side — it was the duplicated half of the Capital calls page.
 *
 *  COMMITTED and CALLED are separate columns on purpose. They are different facts and the
 *  table used to show neither directly — you got Commitment and Unfunded and had to infer
 *  what had actually been called from the gap between them. The four now read left to
 *  right as the life of a commitment:
 *
 *    Committed              — what the LP signed up for
 *    Called                 — what has been asked for so far (capital is recognized here)
 *    Funded                 — what actually arrived (called − receivable)
 *    Remaining to be called — commitment − called
 *    Called, unpaid         — the receivable: called, not yet in the bank
 *
 *  The last two are DISJOINT. `outstanding` used to be commitment − funded, which silently
 *  included the receivable, so those two columns double-counted. Total cash the LP still
 *  owes is the sum of them. `Called, unpaid` only appears when a vehicle has a receivable,
 *  because an events-tracked vehicle never does. */
const COMMITMENT_COLUMNS = ['commitment', 'called', 'funded', 'outstanding', 'receivable'] as const

const COLUMNS: (keyof Account)[] = ['beginning', 'contributions', 'distributions', 'managementFees', 'expenses', 'operatingIncome', 'realizedGains', 'unrealizedGains', 'fxTranslation', 'transfers', 'carriedInterest', 'unclassified', 'ending']

export function CapitalAccountsView() {
  const t = useTranslations('Funds.capitalAccounts')
  const locale = useLocale()
  const lpPortalEnabled = useLpPortalEnabled()
  const isAdmin = useIsAdmin()
  const canReadGpEconomics = useCanRead('gp_economics')
  const currency = useCurrency()
  const fmt = (v: number) => formatMoney(v, currency, locale)
  const lf = useLedgerFetch()
  const fundSeg = useFundSeg()

  const [rows, setRows] = useState<Row[]>([])
  const [calls, setCalls] = useState<CallRow[]>([])
  const [nav, setNav] = useState(0)
  const [period, setPeriod] = useState<Period | null>(null)
  const [loading, setLoading] = useState(true)
  // Which producer this vehicle's capital comes from. Null until the first load — the
  // mode-specific parts of the page stay hidden rather than flashing the wrong ones.
  const [source, setSource] = useState<CapitalSource | null>(null)

  const [preset, setPreset] = useState<PeriodPreset>('itd')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [asOf, setAsOf] = useState('') // report/period-end date; '' = Latest (today)

  const [err, setErr] = useState<string | null>(null)

  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{ count: number; errors: string[] } | null>(null)
  // Share-with-LPs dialog: which LPs' statements to publish to the portal.
  const [showShare, setShowShare] = useState(false)
  const [shareSel, setShareSel] = useState<Set<string>>(new Set())

  // Issue-a-call (folded in from the old Capital calls page).
  const [showCall, setShowCall] = useState(false)
  const [mode, setMode] = useState<'fund_wide' | 'per_lp'>('fund_wide')
  const [callDate, setCallDate] = useState('')
  const [description, setDescription] = useState('')
  const [callTotal, setCallTotal] = useState('')
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [issuing, setIssuing] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (preset === 'custom') {
      if (start) qs.set('start', start)
      if (end) qs.set('end', end)
      qs.set('preset', 'custom')
    } else {
      qs.set('preset', preset)
      if (asOf) qs.set('asOf', asOf)
    }
    lf(`/api/accounting/capital-accounts?${qs}`)
      .then(r => (r.ok ? r.json() : { rows: [], nav: 0, calls: [] }))
      .then(d => {
        setRows(d.rows ?? []); setNav(d.nav ?? 0); setPeriod(d.period ?? null)
        setCalls(d.calls ?? []); setSource(d.source ?? null)
      })
      .finally(() => setLoading(false))
  }, [lf, preset, start, end, asOf])
  useEffect(() => { load() }, [load])

  // A capital-tracking-only vehicle keeps no double-entry books, so the affordances that
  // only exist inside one — issuing a call against a 1300 receivable, tying out a ledger
  // to the outgoing administrator's statement — are not shown for it. Its capital is
  // entered as events instead, below the roll-forward those events produce.
  const isEvents = source === 'events'

  // Open the share dialog with every LP selected by default.
  function openShare() {
    setShareSel(new Set(rows.map(r => r.lpEntityId)))
    setPublishResult(null); setErr(null)
    setShowShare(true)
  }

  async function publishStatements() {
    if (!period) return
    setPublishing(true); setErr(null); setPublishResult(null)
    const periodBody = period.preset === 'custom' ? { start: period.start, end: period.end } : { preset: period.preset }
    const res = await lf('/api/accounting/lp-statement/publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...periodBody, lpEntityIds: Array.from(shareSel) }),
    })
    const data = await res.json()
    setPublishing(false)
    if (!res.ok) { setErr(data.error ?? t('share.error')); return }
    setPublishResult({ count: data.count ?? 0, errors: data.errors ?? [] })
  }

  const enteredTotal = rows.reduce((s, r) => s + (Number(amounts[r.lpEntityId]) || 0), 0)

  async function splitProRata() {
    const total = Number(callTotal)
    if (!Number.isFinite(total) || total <= 0) { setMsg({ ok: false, text: t('call.positiveTotal') }); return }
    const res = await lf('/api/accounting/capital-calls', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', total }),
    })
    const data = await res.json()
    if (!res.ok) { setMsg({ ok: false, text: data.error ?? t('call.splitError') }); return }
    const next: Record<string, string> = {}
    for (const l of (data.lines ?? [])) next[l.lpEntityId] = String(l.amount)
    setAmounts(next); setMsg(null)
  }

  async function issue() {
    setMsg(null)
    const lines = rows
      .map(r => ({ lpEntityId: r.lpEntityId, amount: Number(amounts[r.lpEntityId]) || 0 }))
      .filter(l => l.amount > 0)
    if (lines.length === 0) { setMsg({ ok: false, text: t('call.amountRequired') }); return }
    if (!callDate) { setMsg({ ok: false, text: t('call.dateRequired') }); return }
    setIssuing(true)
    const res = await lf('/api/accounting/capital-calls', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'issue', callDate, description: description || null, scope: mode, lines }),
    })
    const data = await res.json()
    setIssuing(false)
    if (!res.ok) { setMsg({ ok: false, text: data.error ?? t('call.issueError') }); return }
    setMsg({ ok: true, text: t('call.issued') })
    setAmounts({}); setCallTotal(''); setDescription('')
    load()
  }

  // Values shown are scoped to the selected period; ITD is the whole history.
  const acctOf = (r: Row): Account => (period?.preset === 'itd' ? r.itd : r.period ?? r.itd)

  // Drop lines that are zero for every partner — a clean set of books should never
  // show an "Unclassified" column, but it has to appear the moment something lands
  // there, or a manual posting would be invisible while still inside Ending.
  const columns = useMemo(
    () => COLUMNS.filter(key =>
      key === 'beginning' || key === 'ending' ||
      rows.some(r => Math.abs(acctOf(r)[key]) > 0.004)
    ),
    [rows, period], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const commitmentCols = useMemo(
    () => COMMITMENT_COLUMNS.filter(key => key !== 'receivable' || rows.some(r => Math.abs(r.receivable) > 0.004)),
    [rows],
  )

  // Sortable headers. The account columns are period-scoped (acctOf), the commitment columns
  // are not; `name` sorts alphabetically. A single ACCOUNT_KEYS set tells the two apart.
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' })
  const onSort = (key: string) => setSort(s => nextSort(s, key, key === 'name' ? 'asc' : 'desc'))
  const sortedRows = useMemo(() => {
    const accountKeys = new Set<string>(COLUMNS)
    const val = (r: Row): number | string => {
      if (sort.key === 'name') return r.name
      if (accountKeys.has(sort.key)) return acctOf(r)[sort.key as keyof Account]
      return (r as any)[sort.key] ?? 0
    }
    return [...rows].sort((a, b) => compareVals(val(a), val(b), sort.dir))
  }, [rows, sort, period]) // eslint-disable-line react-hooks/exhaustive-deps

  const totals = columns.reduce((acc, key) => {
    acc[key] = rows.reduce((s, r) => s + acctOf(r)[key], 0)
    return acc
  }, {} as Record<string, number>)
  const commitTotals = commitmentCols.reduce((acc, key) => {
    acc[key] = rows.reduce((s, r) => s + r[key], 0)
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-3">
      {/* The action row. The statement-period select sits on the RIGHT of the same row (via
          ml-auto) rather than in its own box — one control strip instead of two stacked
          panels. Choosing the capital source (ledger vs capital tracking) lives on the Admin
          page now; it is a fund-setup decision, not something to re-confront on every visit. */}
      <div className="flex flex-wrap items-center gap-2">
        {!isEvents && (
          <Button size="sm" variant="outline" className="text-muted-foreground" onClick={() => setShowCall(v => !v)} disabled={rows.length === 0}>
            <Landmark className="h-4 w-4 mr-1" />{t('call.open')}
          </Button>
        )}
        {/* Same "Share with LPs" action as the LPs report page: pick which LPs, publish to the
            portal, no email. Only offered when the portal is on — publishing statements nobody
            can open is a no-op that looks like success. */}
        {lpPortalEnabled && (
          <Button size="sm" variant="outline" className="text-muted-foreground" onClick={openShare} disabled={rows.length === 0}>
            <Share2 className="h-4 w-4 mr-1" />
            {t('share.open')}
          </Button>
        )}
        {err && !showShare && <span className="text-xs text-amber-600">{err}</span>}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* "As of" report date + Latest — same control and placement as /lps. The preset
              chooses the window ENDING at this date; custom mode uses its own from/to instead. */}
          <PeriodPicker
            preset={preset} onPreset={setPreset}
            start={start} end={end} onStart={setStart} onEnd={setEnd}
            asOf={asOf} onAsOf={setAsOf}
            allowAsOf
            title={period && period.preset !== 'itd' && period.start ? t('periodBeginning', { date: formatDate(period.start, locale) }) : t('allActivity')}
          />
        </div>
      </div>

      {/* Share statements with LPs — the same pick-then-publish, no-email flow as the LPs report
          page. Each selected LP's statement is generated and published to their portal. */}
      <Dialog open={showShare} onOpenChange={o => { if (!o) setShowShare(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('share.title')}</DialogTitle>
            <DialogDescription>
              {t('share.description', { period: period?.label ?? t('share.thisPeriod') })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t('share.selected', { selected: shareSel.size, total: rows.length })}</span>
              <button
                onClick={() => setShareSel(shareSel.size === rows.length ? new Set() : new Set(rows.map(r => r.lpEntityId)))}
                className="text-[11px] text-primary hover:underline"
              >
                {t(shareSel.size === rows.length ? 'share.deselectAll' : 'share.selectAll')}
              </button>
            </div>
            <div className="rounded-md border divide-y max-h-[45vh] overflow-y-auto min-w-0">
              {rows.map(r => (
                <label key={r.lpEntityId} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30 min-w-0">
                  <input
                    type="checkbox"
                    checked={shareSel.has(r.lpEntityId)}
                    onChange={() => setShareSel(prev => {
                      const next = new Set(prev)
                      if (next.has(r.lpEntityId)) next.delete(r.lpEntityId)
                      else next.add(r.lpEntityId)
                      return next
                    })}
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  <span className="flex-1 min-w-0 truncate">{r.name}</span>
                </label>
              ))}
            </div>

            {err && <p className="text-xs text-amber-600">{err}</p>}
            {publishResult && (
              <div className="rounded-md border p-2.5 text-sm space-y-1">
                <p className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
                  <Check className="h-4 w-4" />
                  {t('share.published', { count: publishResult.count, period: period?.label ?? t('share.thisPeriod') })}
                </p>
                {publishResult.errors.map((e, i) => <p key={i} className="text-xs text-amber-600">{e}</p>)}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowShare(false)}>{t('close')}</Button>
            <Button size="sm" onClick={publishStatements} disabled={publishing || shareSel.size === 0}>
              {publishing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t('share.publish', { count: shareSel.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue a call — folded in from the old Capital calls page. Gated on `!isEvents` as
          well as `showCall`: switching vehicle while the panel is open would otherwise leave
          it showing on a vehicle that has no receivable to call against. */}
      {showCall && !isEvents && rows.length > 0 && (
        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium">{t('call.title')}</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted-foreground">{t('call.date')}
              <input type="date" value={callDate} onChange={e => setCallDate(e.target.value)} className="block mt-1 border border-input rounded px-2 py-1.5 text-sm bg-transparent" />
            </label>
            <label className="text-xs text-muted-foreground flex-1 min-w-[180px]">{t('call.description')}
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('call.descriptionPlaceholder')} className="block mt-1 w-full border border-input rounded px-2 py-1.5 text-sm bg-transparent" />
            </label>
            <div className="text-xs text-muted-foreground">
              <span className="block mb-1">{t('call.type')}</span>
              <div className="inline-flex rounded border border-input overflow-hidden">
                <button type="button" onClick={() => setMode('fund_wide')} className={`px-2.5 py-1.5 text-xs ${mode === 'fund_wide' ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}>{t('call.fundWide')}</button>
                <button type="button" onClick={() => setMode('per_lp')} className={`px-2.5 py-1.5 text-xs border-l border-input ${mode === 'per_lp' ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}>{t('call.perLp')}</button>
              </div>
            </div>
          </div>

          {mode === 'fund_wide' && (
            <div className="flex items-end gap-2">
              <label className="text-xs text-muted-foreground">{t('call.totalToCall')}
                <input value={callTotal} onChange={e => setCallTotal(e.target.value)} inputMode="decimal" placeholder="0.00" className="block mt-1 border border-input rounded px-2 py-1.5 text-sm font-mono bg-transparent w-40" />
              </label>
              <Button size="sm" variant="outline" onClick={splitProRata}>{t('call.split')}</Button>
              <span className="text-xs text-muted-foreground pb-2">{t('call.splitHelp')}</span>
            </div>
          )}

          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium">{t('partner')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('call.commitment')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('call.unfunded')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('call.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.lpEntityId} className="border-b last:border-b-0">
                    <td className="px-3 py-2 max-w-[200px]"><div className="truncate" title={r.name}>{r.name}</div></td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmt(r.commitment)}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmt(r.outstanding)}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        value={amounts[r.lpEntityId] ?? ''}
                        onChange={e => setAmounts(a => ({ ...a, [r.lpEntityId]: e.target.value }))}
                        inputMode="decimal"
                        placeholder="0.00"
                        className="border border-input rounded px-2 py-1 text-sm font-mono bg-transparent w-32 text-right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="px-3 py-2" colSpan={3}>{t('call.total')}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(enteredTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={issue} disabled={issuing || enteredTotal <= 0}>
              {issuing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{t('call.issue')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowCall(false)} disabled={issuing}>{t('cancel')}</Button>
            {msg && (
              <span className={`text-sm flex items-center gap-1 ${msg.ok ? 'text-green-600' : 'text-amber-600'}`}>
                {msg.ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{msg.text}
              </span>
            )}
          </div>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t('loading')}</div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b bg-muted/50">
                <SortTh label={t('partner')} sortKey="name" sort={sort} onSort={onSort} align="left" />
                {/* Commitment side — was the Capital calls page. */}
                {commitmentCols.map(key => <SortTh key={key} label={t(`columns.${key}`)} sortKey={key} sort={sort} onSort={onSort} align="right" className="border-l" />)}
                {columns.map((key, i) => <SortTh key={key} label={t(`columns.${key}`)} sortKey={key} sort={sort} onSort={onSort} align="right" className={i === 0 ? 'border-l' : ''} />)}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(r => {
                const a = acctOf(r)
                return (
                  <tr key={r.lpEntityId} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-3 py-2 max-w-[200px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Link href={fundSeg ? `/funds/${fundSeg}/capital-accounts/${r.lpEntityId}` : '/funds'} className="hover:underline truncate" title={r.name}>{r.name}</Link>
                        {r.partnerClass === 'gp' && <span className="text-[10px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0">GP</span>}
                      </div>
                    </td>
                    {commitmentCols.map(key => (
                      <td key={key} className={`px-3 py-2 text-right font-mono border-l ${Math.abs(r[key]) > 0.004 ? '' : 'text-muted-foreground'}`}>
                        {fmt(r[key])}
                      </td>
                    ))}
                    {columns.map((key, i) => (
                      <td key={key} className={`px-3 py-2 text-right font-mono ${i === 0 ? 'border-l' : ''} ${key === 'ending' ? 'font-semibold' : ''} ${key === 'unclassified' && Math.abs(a[key]) > 0.004 ? 'text-amber-600' : ''}`}>
                        {/* Roll-forward deltas are signed so the columns tie to Ending: contributions
                            add, distributions (withdrawals) and fees subtract. */}
                        {fmt(a[key])}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-semibold">
                <td className="px-3 py-2">{t('total')}</td>
                {commitmentCols.map(key => <td key={key} className="px-3 py-2 text-right font-mono border-l">{fmt(commitTotals[key])}</td>)}
                {columns.map((key, i) => <td key={key} className={`px-3 py-2 text-right font-mono ${i === 0 ? 'border-l' : ''}`}>{fmt(totals[key])}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {calls.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2 mt-4">{t('call.issuedTitle')}</p>
          <div className="space-y-2">
            {calls.map(c => (
              <div key={c.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{formatDate(c.callDate, locale)} · {fmt(c.total)}</span>
                  <span className="text-xs text-muted-foreground">{t(c.scope === 'fund_wide' ? 'call.fundWide' : 'call.perLp')}</span>
                </div>
                {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5">
                  {c.lines.map(l => <span key={l.lpEntityId}>{l.name}: <span className="font-mono">{fmt(l.amount)}</span></span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The entry surface for a capital-tracking-only vehicle. It sits BELOW the
          roll-forward because the roll-forward is what it produces — the same order the
          Journal has to the statements it feeds. */}
      {/* A capital-tracking vehicle is now EDITED as dated positions, in the LPs section —
          not as capital events here (that store is no longer read). Point there rather than
          showing a panel whose writes would go nowhere. */}
      {isEvents && (
        <div className="pt-6">
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            {t.rich('eventsHelp', { link: chunks => <Link href="/lps/capital" className="text-foreground underline underline-offset-4">{chunks}</Link> })}
          </div>
        </div>
      )}

      {/* GP / associate entity economics — a DIFFERENT access domain from the capital accounts
          it sits beside. It carries the partners' carry points and carry accrued/paid, so a
          member who can read capital accounts is not thereby entitled to it. Its own API is
          gated to gp_economics too; this only spares them a panel that would fail to load.

          It also renders itself to nothing on an ordinary vehicle. */}
      {canReadGpEconomics && (
        <div className="pt-6">
          <GpPanel isAdmin={isAdmin} />
        </div>
      )}

      {/* Reconciling against the incumbent administrator's statement compares one
          partner's capital account, line by line — so it belongs with the capital
          accounts, not on Admin.

          It is a CUTOVER check, not a monthly step: it proves this ledger reproduces
          the numbers the outgoing admin produced. Once you are closing periods here,
          the ledger IS the record and there is nothing external left to reconcile
          against. Hence collapsed, and last. Ledger-only: on a capital-tracking vehicle
          the events ARE the administrator's statement, so there is nothing to tie out to. */}
      {!isEvents && (
      <details className="group border rounded-lg mt-6">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium">
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
          {t('reconciliation.title')}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {t('reconciliation.subtitle')}
          </span>
        </summary>
        <div className="border-t p-3">
          <ReconciliationPanel />
        </div>
      </details>
      )}
    </div>
  )
}
