'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, FileText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useCurrency } from '@/components/currency-context'
import { useLedgerFetch, useVehicle } from '@/components/accounting-vehicle'
import { PERIOD_PRESETS, type PeriodPreset } from '@/lib/accounting/statement-period'
import { formatDate, formatMoney } from '../../format'

interface Row { lpEntityId: string; name: string; partnerClass: string; commitment: number; called: number; funded: number; outstanding: number; receivable: number; ending: number }
interface RollForward {
  beginning: number
  contributions: number
  distributions: number
  managementFees: number
  expenses: number
  operatingIncome: number
  realizedGains: number
  unrealizedGains: number
  transfers: number
  carriedInterest: number
  unclassified: number
  ending: number
}
interface Txn { date: string; memo: string | null; sourceType: string | null; amount: number; balance: number }
interface Period { preset: PeriodPreset; start: string | null; end: string | null; label: string }
interface Statement { row: Row; rollForward: RollForward; periodRollForward: RollForward; transactions: Txn[]; period: Period }

const ROLL_KEYS: (keyof RollForward)[] = [
  'beginning', 'contributions', 'distributions', 'managementFees', 'expenses',
  'operatingIncome', 'realizedGains', 'unrealizedGains', 'transfers',
  'carriedInterest', 'unclassified', 'ending',
]

export function LpStatementView({ lpEntityId }: { lpEntityId: string }) {
  const locale = useLocale()
  const t = useTranslations('Funds.lpStatement')
  const periodT = useTranslations('Funds.shared.periodPicker.presets')
  const currency = useCurrency()
  const fmt = (v: number) => formatMoney(v, currency, locale)
  const lf = useLedgerFetch()
  const { group } = useVehicle()
  const [data, setData] = useState<Statement | null>(null)
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<PeriodPreset>('ytd')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [classBusy, setClassBusy] = useState(false)
  const [classError, setClassError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({ lp: lpEntityId, preset })
    if (preset === 'custom') {
      if (start) qs.set('start', start)
      if (end) qs.set('end', end)
    }
    lf(`/api/accounting/lp-statement?${qs}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setData(d && !d.error ? d : null))
      .finally(() => setLoading(false))
  }, [lf, lpEntityId, preset, start, end])

  async function switchPartnerClass(next: 'lp' | 'gp') {
    if (!data || next === data.row.partnerClass) return
    if (!window.confirm(t('changeClassConfirm'))) return
    setClassBusy(true)
    setClassError(null)
    const res = await lf('/api/accounting/lps', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: lpEntityId, partnerClass: next }),
    })
    setClassBusy(false)
    if (!res.ok) {
      setClassError((await res.json().catch(() => ({}))).error ?? t('changeClassError'))
      return
    }
    // Re-run the loader by flipping partnerClass locally, then refetch the full statement so
    // fee/carry-dependent figures (roll-forward, cards) reflect the switch immediately.
    setData(d => (d ? { ...d, row: { ...d.row, partnerClass: next } } : d))
    setLoading(true)
    const qs = new URLSearchParams({ lp: lpEntityId, preset })
    if (preset === 'custom') { if (start) qs.set('start', start); if (end) qs.set('end', end) }
    lf(`/api/accounting/lp-statement?${qs}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setData(d && !d.error ? d : null))
      .finally(() => setLoading(false))
  }

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t('loading')}</div>
  if (!data) return <div className="border border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground">{t('empty')}</div>

  const { row, rollForward, periodRollForward, transactions, period } = data
  const pdfQs = new URLSearchParams({ lp: lpEntityId })
  if (group) pdfQs.set('group', group)
  if (preset === 'custom') { if (start) pdfQs.set('start', start); if (end) pdfQs.set('end', end) }
  else pdfQs.set('preset', preset)
  const statementPdfUrl = `/api/accounting/lp-statement/pdf?${pdfQs}`
  // Hide a line only when it's zero in BOTH columns — a line that's zero this period
  // but non-zero since inception still belongs on the statement.
  const lines = ROLL_KEYS.filter(key =>
    key === 'beginning' || key === 'ending' ||
    Math.abs(rollForward[key]) > 0.004 || Math.abs(periodRollForward[key]) > 0.004
  )
  const cards = [
    { key: 'commitment', value: row.commitment },
    { key: 'called', value: row.called },
    { key: 'funded', value: row.funded },
    { key: 'remaining', value: row.outstanding },
    { key: 'unfunded', value: row.receivable },
    { key: 'endingNav', value: row.ending },
  ] as const

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">{row.name}{row.partnerClass === 'gp' && <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground align-middle">GP</span>}</h2>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {t('type')}
            <select
              value={row.partnerClass === 'gp' ? 'gp' : 'lp'}
              disabled={classBusy}
              onChange={e => switchPartnerClass(e.target.value as 'lp' | 'gp')}
              className="h-7 px-1.5 rounded-md border border-input bg-background text-xs disabled:opacity-50"
            >
              <option value="lp">LP</option>
              <option value="gp">GP</option>
            </select>
          </label>
        </div>
        {/* Preview only — renders the PDF without storing or sharing it. Publishing
            to the portal is the bulk action on the capital accounts page. */}
        <a
          href={statementPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded border border-input px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <FileText className="h-3.5 w-3.5" />{t('generatePdf')}
        </a>
      </div>
      {classError && <p className="text-xs text-red-600">{classError}</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map(c => (
          <div key={c.key} className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">{t(`cards.${c.key}`)}</p>
            <p className="text-lg font-mono font-semibold mt-0.5">{fmt(c.value)}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
          <p className="text-sm font-medium">{t('rollForward')}</p>
          <div className="flex flex-wrap items-end gap-2">
            <select
              value={preset}
              onChange={e => setPreset(e.target.value as PeriodPreset)}
              className="h-8 px-2 rounded-md border border-input bg-background text-xs"
            >
              {PERIOD_PRESETS.filter(p => p.value !== 'itd').map(p => (
                <option key={p.value} value={p.value}>{periodT(p.value)}</option>
              ))}
            </select>
            {preset === 'custom' && (
              <>
                <Input type="date" value={start} onChange={e => setStart(e.target.value)} className="h-8 w-36 text-xs" />
                <Input type="date" value={end} onChange={e => setEnd(e.target.value)} className="h-8 w-36 text-xs" />
              </>
            )}
          </div>
        </div>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs">
                <th className="text-left px-3 py-2 font-medium" />
                <th className="text-right px-3 py-2 font-medium">{t('statementPeriod')}<div className="font-normal text-muted-foreground">{period?.start && period.end ? `${formatDate(period.start, locale)} – ${formatDate(period.end, locale)}` : t('inceptionToDate')}</div></th>
                <th className="text-right px-3 py-2 font-medium">{t('inceptionToDate')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(key => (
                <tr key={key} className={`border-b last:border-b-0 ${key === 'ending' ? 'font-semibold bg-muted/30' : ''}`}>
                  <td className="px-3 py-2">{t(`roll.${key}`)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${key === 'unclassified' && Math.abs(periodRollForward[key]) > 0.004 ? 'text-amber-600' : ''}`}>{fmt(periodRollForward[key])}</td>
                  <td className={`px-3 py-2 text-right font-mono ${key === 'unclassified' && Math.abs(rollForward[key]) > 0.004 ? 'text-amber-600' : ''}`}>{fmt(rollForward[key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">{t('transactions')}</p>
        {transactions.length === 0 ? (
          <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">{t('noTransactions')}</div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium">{t('date')}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('description')}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('type')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('amount')}</th>
                  <th className="text-right px-3 py-2 font-medium">{t('balance')}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr key={i} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{formatDate(t.date, locale)}</td>
                    <td className="px-3 py-2">{t.memo ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{t.sourceType ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(t.amount)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(t.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
