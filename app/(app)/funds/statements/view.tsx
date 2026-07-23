'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { Loader2, Download } from 'lucide-react'
import { useCurrency } from '@/components/currency-context'
import { useLedgerFetch, useVehicle, useFundSeg } from '@/components/accounting-vehicle'
import { type PeriodPreset } from '@/lib/accounting/statement-period'
import { PeriodPicker } from '@/components/accounting/period-picker'
import { formatDate, formatMoney } from '../format'

interface Section { label: string; rows: { code: string; name: string; amount: number }[]; total: number }
interface PartnerRow {
  id: string
  name: string
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
interface CFSection { label: string; lines: { code: string; name: string; amount: number }[]; total: number }
interface Period { preset: PeriodPreset; start: string | null; end: string | null; label: string }
interface Data {
  period: Period
  trialBalance: { rows: { code: string; name: string; debit: number; credit: number }[]; totalDebits: number; totalCredits: number; balanced: boolean }
  balanceSheet: {
    assets: Section
    liabilities: Section
    equity: Section
    check: number
    partnersCapital: { total: number; unallocatedEarnings: number }
  }
  incomeStatement: { income: Section; expenses: Section; netIncome: number }
  changesInPartnersCapital: { partners: PartnerRow[]; totals: PartnerRow }
  cashFlows: {
    operating: CFSection
    financing: CFSection
    netChange: number
    openingCash: number
    endingCash: number
    nonCash: { entryId: string; date: string | null; description: string; amount: number; legs: { name: string; amount: number }[] }[]
  } | null
  // Prior-period payloads, most-recent-first, present only when ?compare= was sent.
  comparisons?: Omit<Data, 'comparisons'>[]
}

const CAP_COLS = ['beginning', 'contributions', 'distributions', 'managementFees', 'expenses', 'operatingIncome', 'realizedGains', 'unrealizedGains', 'transfers', 'carriedInterest', 'unclassified', 'ending'] as const satisfies readonly (keyof PartnerRow)[]

export function StatementsView() {
  const t = useTranslations('Funds.statements')
  const locale = useLocale()
  const currency = useCurrency()
  const fmt = (v: number) => formatMoney(v, currency, locale)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<PeriodPreset>('ytd')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [compare, setCompare] = useState<string>('0') // '0'|'1'|'2'|'3'|'4'|'all'
  const [order, setOrder] = useState<'recent' | 'oldest'>('recent')
  const lf = useLedgerFetch()
  const { group } = useVehicle()
  const fundSeg = useFundSeg()

  // Same period params as the on-screen fetch, plus the selected vehicle — the export
  // route computes the identical package and serializes it to a multi-tab .xlsx.
  const exportQs = new URLSearchParams({ preset })
  if (preset === 'custom') {
    if (start) exportQs.set('start', start)
    if (end) exportQs.set('end', end)
  }
  if (group) exportQs.set('group', group)
  if (compare !== '0') exportQs.set('compare', compare)
  const exportUrl = `/api/accounting/statements/export?${exportQs}`
  const canExport = !loading && !!data && data.trialBalance.rows.length > 0

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({ preset })
    if (preset === 'custom') {
      if (start) qs.set('start', start)
      if (end) qs.set('end', end)
    }
    if (compare !== '0') qs.set('compare', compare)
    lf(`/api/accounting/statements?${qs}`)
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [lf, preset, start, end, compare])

  // Comparisons arrive most-recent-first and exclude the primary, so most-recent-first
  // columns = [primary, ...comparisons]; oldest-first is that reversed.
  const colData = data ? [data, ...(data.comparisons ?? [])] : []
  const cols = order === 'recent' ? colData : [...colData].reverse()

  const period = data?.period
  // A balance sheet is a snapshot; an income statement and cash flows cover a span.
  const asOfLabel = period?.end ? t('asOfDate', { date: formatDate(period.end, locale) }) : t('asOfToday')
  const overLabel = period?.preset === 'itd'
    ? t('sinceInception')
    : period?.start && period?.end ? `for ${period.label}` : period?.label ?? ''

  const fmtCell = (v: number | undefined) => (v === undefined ? '' : fmt(v))

  // Header row of period labels for a statement table. With compare='0', cols has
  // length 1 and this renders exactly the single-column header shape used before.
  const PeriodHead = ({ kind }: { kind: 'asOf' | 'over' }) => (
    <tr className="border-b bg-muted/50">
      <th className="text-left px-3 py-2 font-medium" />
      {cols.map((c, i) => (
        <th key={i} className="text-right px-3 py-2 font-medium whitespace-nowrap">
          <div>{c.period.label}</div>
          <div className="text-[10px] font-normal text-muted-foreground">
            {kind === 'asOf' ? (c.period.end ? t('asOfDate', { date: formatDate(c.period.end, locale) }) : t('asOfToday')) : (c.period.preset === 'itd' ? t('sinceInception') : c.period.label)}
          </div>
        </th>
      ))}
    </tr>
  )

  // Union section rows across columns by key, pulling each column's amount.
  const sectionMatrix = (pick: (d: Omit<Data, 'comparisons'>) => Section) => {
    const label = pick(cols[0]).label
    const keys: { key: string; name: string; code: string }[] = []
    const seen = new Set<string>()
    for (const c of cols) for (const r of pick(c).rows) {
      const key = r.code || r.name
      if (!seen.has(key)) { seen.add(key); keys.push({ key, name: r.name, code: r.code }) }
    }
    const amountFor = (c: Omit<Data, 'comparisons'>, key: string) =>
      pick(c).rows.find(r => (r.code || r.name) === key)?.amount
    return { label, keys, amountFor, totalFor: (c: Omit<Data, 'comparisons'>) => pick(c).total }
  }

  // A section with no detail rows (partners' capital) renders as a single total line.
  const MultiSec = ({ pick }: { pick: (d: Omit<Data, 'comparisons'>) => Section }) => {
    const m = sectionMatrix(pick)
    if (m.keys.length === 0 && cols.every(c => pick(c).total === 0)) return null
    return (
      <>
        {m.keys.length > 0 && (
          <tr className="border-t bg-muted/30"><td className="px-3 py-1.5 font-medium" colSpan={cols.length + 1}>{m.label}</td></tr>
        )}
        {m.keys.map(k => (
          <tr key={k.key} className="border-t">
            <td className="px-3 py-1.5 text-muted-foreground">{k.code ? `${k.code} · ` : ''}{k.name}</td>
            {cols.map((c, i) => <td key={i} className="px-3 py-1.5 text-right font-mono">{fmtCell(m.amountFor(c, k.key))}</td>)}
          </tr>
        ))}
        <tr className="border-t font-semibold">
          <td className="px-3 py-1.5">{t('totalSection', { section: m.label })}</td>
          {cols.map((c, i) => <td key={i} className="px-3 py-1.5 text-right font-mono">{fmt(m.totalFor(c))}</td>)}
        </tr>
      </>
    )
  }

  // Cash-flow sections have a slightly different shape ({ lines } not { rows }); map
  // them into Section so MultiSec can be reused instead of duplicating the renderer.
  const cfAsSection = (get: (cf: NonNullable<Data['cashFlows']>) => CFSection) =>
    (d: Omit<Data, 'comparisons'>): Section => {
      const cf = d.cashFlows
      if (!cf) return { label: get({ operating: { label: '', lines: [], total: 0 }, financing: { label: '', lines: [], total: 0 } } as any).label, rows: [], total: 0 }
      const s = get(cf)
      return { label: s.label, rows: s.lines.map(l => ({ code: l.code, name: l.name, amount: l.amount })), total: s.total }
    }

  return (
    <div className="space-y-4">
      {/* Action bar — export on the LEFT, the statement-period select (and custom from/to)
          pushed RIGHT via ml-auto, matching /funds/capital-accounts. Each statement's subheader
          below already states its as-of / covering dates, so there is no explainer line here. */}
      <div className="flex flex-wrap items-center gap-2">
        {canExport ? (
          <a
            href={exportUrl}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-muted"
          >
            <Download className="h-4 w-4" />{t('export')}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input text-sm text-muted-foreground opacity-50">
            <Download className="h-4 w-4" />{t('export')}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <PeriodPicker
            preset={preset} onPreset={setPreset}
            start={start} end={end} onStart={setStart} onEnd={setEnd}
          />
          <select
            value={compare}
            onChange={e => setCompare(e.target.value)}
            aria-label={t('compare.ariaLabel')}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="0">{t('compare.none')}</option>
            <option value="1">{t('compare.previous')}</option>
            <option value="2">{t('compare.past', { count: 2 })}</option>
            <option value="3">{t('compare.past', { count: 3 })}</option>
            <option value="4">{t('compare.past', { count: 4 })}</option>
            <option value="all">{t('compare.all')}</option>
          </select>
          {compare !== '0' && (
            <button
              onClick={() => setOrder(o => (o === 'recent' ? 'oldest' : 'recent'))}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm text-muted-foreground hover:text-foreground"
              title={t('compare.toggleOrder')}
            >
              {t(order === 'recent' ? 'compare.recentFirst' : 'compare.oldestFirst')}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t('loading')}</div>
      ) : !data || data.trialBalance.rows.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground">{t('empty', { dateSuffix: period?.end ? t('emptyDateSuffix', { date: formatDate(period.end, locale) }) : '' })}</div>
      ) : (
    // ASC 946 order: assets & liabilities, then operations, then cash flows, then
    // changes in partners' capital last — the per-partner detail behind the single
    // capital line on the balance sheet.
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-semibold">{t('balanceSheet.title')}</h2>
        <p className="text-xs text-muted-foreground mb-2">{t('balanceSheet.subtitle', { period: asOfLabel })}</p>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead><PeriodHead kind="asOf" /></thead>
            <tbody>
              <MultiSec pick={d => d.balanceSheet.assets} />
              <MultiSec pick={d => d.balanceSheet.liabilities} />
              <MultiSec pick={d => d.balanceSheet.equity} />
            </tbody>
          </table>
        </div>
        {/* Only worth saying when it's actionable: unallocated earnings mean the
            per-LP capital accounts understate until the period is closed. */}
        {data.balanceSheet.partnersCapital.unallocatedEarnings !== 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            {t('balanceSheet.unallocated', { amount: fmt(data.balanceSheet.partnersCapital.unallocatedEarnings) })}
          </p>
        )}
        {data.balanceSheet.check !== 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            {t('balanceSheet.unbalanced', { residual: fmt(data.balanceSheet.check) })}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold">{t('operations.title')}</h2>
        <p className="text-xs text-muted-foreground mb-2">{t('operations.subtitle', { period: overLabel })}</p>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead><PeriodHead kind="over" /></thead>
            <tbody>
              <MultiSec pick={d => d.incomeStatement.income} />
              <MultiSec pick={d => d.incomeStatement.expenses} />
              <tr className="border-t font-semibold bg-muted/30">
                <td className="px-3 py-1.5">{t('operations.netIncome')}</td>
                {cols.map((c, i) => <td key={i} className="px-3 py-1.5 text-right font-mono">{fmt(c.incomeStatement.netIncome)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        {/* A balanced trial balance is the expected state — only worth saying when it isn't. */}
        {!data.trialBalance.balanced && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            {t('operations.trialBalanceMismatch', { debits: fmt(data.trialBalance.totalDebits), credits: fmt(data.trialBalance.totalCredits) })}
          </p>
        )}
      </section>

      {data.cashFlows && (
        <section>
          <h2 className="text-sm font-semibold">{t('cashFlows.title')}</h2>
          <p className="text-xs text-muted-foreground mb-2">{overLabel}</p>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead><PeriodHead kind="over" /></thead>
              <tbody>
                <MultiSec pick={cfAsSection(cf => cf.operating)} />
                <MultiSec pick={cfAsSection(cf => cf.financing)} />
                <tr className="border-t font-semibold bg-muted/30">
                  <td className="px-3 py-1.5">{t('cashFlows.netChange')}</td>
                  {cols.map((c, i) => <td key={i} className="px-3 py-1.5 text-right font-mono">{fmtCell(c.cashFlows?.netChange)}</td>)}
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-1.5 text-muted-foreground">{t('cashFlows.openingCash')}</td>
                  {cols.map((c, i) => <td key={i} className="px-3 py-1.5 text-right font-mono">{fmtCell(c.cashFlows?.openingCash)}</td>)}
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-1.5 text-muted-foreground">{t('cashFlows.endingCash')}</td>
                  {cols.map((c, i) => <td key={i} className="px-3 py-1.5 text-right font-mono">{fmtCell(c.cashFlows?.endingCash)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Required by ASC 230: investing/financing that bypassed the bank account.
              Without it, a loan the lender paid straight to the company looks like a
              repayment of money that was never borrowed. */}
          {data.cashFlows.nonCash.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium">{t('cashFlows.supplementalTitle')}</h3>
              <p className="text-xs text-muted-foreground mb-2">
                {t('cashFlows.supplementalDescription')}
              </p>
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {data.cashFlows.nonCash.map(n => (
                      <tr key={n.entryId} className="border-t first:border-t-0">
                        <td className="px-3 py-1.5">
                          <span className="font-mono text-xs text-muted-foreground mr-2">{n.date ? formatDate(n.date, locale) : ''}</span>
                          {n.description}
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {n.legs.map(l => `${t(l.amount > 0 ? 'cashFlows.debit' : 'cashFlows.credit')} ${l.name}`).join(' · ')}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono align-top whitespace-nowrap">{fmt(n.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold">{t('capital.title')}</h2>
        <p className="text-xs text-muted-foreground mb-2">
          {t('capital.description', { period: overLabel })}
        </p>
        {cols.length > 1 ? (() => {
          // Union partners across periods by id; value = that period's ending capital.
          const rows: { id: string; name: string }[] = []
          const seen = new Set<string>()
          for (const c of cols) for (const p of c.changesInPartnersCapital.partners) {
            if (!seen.has(p.id)) { seen.add(p.id); rows.push({ id: p.id, name: p.name }) }
          }
          const endingFor = (c: Omit<Data, 'comparisons'>, id: string) =>
            c.changesInPartnersCapital.partners.find(p => p.id === id)?.ending
          return (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium">{t('capital.partner')}</th>
                    {cols.map((c, i) => <th key={i} className="text-right px-3 py-2 font-medium whitespace-nowrap">{c.period.label}<div className="text-[10px] font-normal text-muted-foreground">{t('capital.endingCapital')}{c.period.end ? ` · ${formatDate(c.period.end, locale)}` : ''}</div></th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-1.5 text-muted-foreground">{r.name}</td>
                      {cols.map((c, i) => <td key={i} className="px-3 py-1.5 text-right font-mono">{fmtCell(endingFor(c, r.id))}</td>)}
                    </tr>
                  ))}
                  <tr className="border-t font-semibold">
                    <td className="px-3 py-1.5">{t('total')}</td>
                    {cols.map((c, i) => <td key={i} className="px-3 py-1.5 text-right font-mono">{fmt(c.changesInPartnersCapital.totals.ending)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })() : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium">{t('capital.partner')}</th>
                  {CAP_COLS.map(key => <th key={key} className="text-right px-3 py-2 font-medium">{t(`capital.columns.${key}`)}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.changesInPartnersCapital.partners.map(p => (
                  <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    {/* p.id is the lpEntityId — link through to that partner's capital
                        account. The synthetic GP row has no entity to link to. */}
                    <td className="px-3 py-2">
                      {p.id === 'gp'
                        ? p.name
                        : <Link href={fundSeg ? `/funds/${fundSeg}/capital-accounts/${p.id}` : '/funds'} className="hover:underline">{p.name}</Link>}
                    </td>
                    {CAP_COLS.map(key => <td key={key} className={`px-3 py-2 text-right font-mono ${key === 'ending' ? 'font-semibold' : ''}`}>{fmt(p[key] as number)}</td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="px-3 py-2">{t('total')}</td>
                  {CAP_COLS.map(key => <td key={key} className="px-3 py-2 text-right font-mono">{fmt(data.changesInPartnersCapital.totals[key] as number)}</td>)}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
      )}
    </div>
  )
}
