'use client'

// The LP investor report card — the printable per-investor summary that aggregates their
// positions across every vehicle. Presentational only: the same card renders whether the
// data came from a frozen snapshot or from the live report, so the two never drift.
//
// Printing is browser-native (window.print + @media print), so the card sets in the reader's
// system font — which is why these read better than the headless-Chrome PDFs.

import { useCurrency, formatCurrency, formatCurrencyFull } from '@/components/currency-context'
import { useLocale, useTranslations } from 'next-intl'

export interface ReportCardRow {
  key: string
  entityName: string
  portfolioGroup: string
  commitment: number
  paidInCapital: number
  distributions: number
  nav: number
  totalValue: number
  /** Called capital not yet funded (the receivable). Optional — only ledger vehicles have one. */
  receivable?: number
  pctFunded: number | null
  dpi: number | null
  rvpi: number | null
  tvpi: number | null
  irr: number | null
}

export interface ReportCardTotals {
  commitment: number
  paidInCapital: number
  distributions: number
  nav: number
  totalValue: number
  pctFunded: number | null
  dpi: number | null
  rvpi: number | null
  tvpi: number | null
}

export interface ReportCardProps {
  fundName: string
  fundLogo: string | null
  fundAddress: string | null
  description?: string | null
  investorName: string
  rows: ReportCardRow[]
  totals: ReportCardTotals
  /** A full override for the footnote. When set, replaces the default definitions line. */
  footerNote?: string | null
  /** The report's headline date (e.g. "as of 2026-03-31"). */
  asOfFormatted?: string | null
  /** Per-vehicle last-updated dates — printed in the footnote, because vehicles report on
   *  irregular cadences and a single report-wide "as of" would hide that. */
  vehicleDataDates?: { vehicle: string; date: string | null }[]
  /** Vehicles excluded from this card, noted in the footer. */
  excludedNote?: string[]
}

const moic = (v: number | null, locale: string) => (v == null ? '—' : `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}x`)
const pctOf = (v: number | null, locale: string) => (v == null ? '—' : new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v))

export function LpReportCard(props: ReportCardProps) {
  const t = useTranslations('LPs.reportCard')
  const locale = useLocale()
  const currency = useCurrency()
  const fmt = (v: number) => formatCurrency(v, currency, locale)
  const fmtFull = (v: number) => formatCurrencyFull(v, currency, locale)
  const { fundName, fundLogo, fundAddress, description, investorName, rows, totals } = props

  return (
    <div className="print-page max-w-4xl mx-auto bg-background border rounded-lg p-8 print:border-0 print:rounded-none print:shadow-none">
      <div className="report-content">
        {/* Fund header — logo left, name/address right. Matches the statement + letter. */}
        <div className="flex items-start justify-between mb-8">
          <div className="shrink-0">
            {fundLogo && <img src={fundLogo} alt={fundName} className="h-10 w-auto object-contain" />}
          </div>
          <div className="text-right" style={{ marginLeft: '40%' }}>
            <h2 className="text-lg font-semibold tracking-tight">{fundName}</h2>
            {fundAddress && (
              <p className="text-[11px] text-muted-foreground whitespace-pre-line leading-snug mt-0.5">{fundAddress}</p>
            )}
          </div>
        </div>

        {description ? (
          <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed mb-10">{description}</p>
        ) : <div className="mb-6" />}

        <h1 className="text-xl font-bold tracking-tight mb-3">{investorName}</h1>

        {totals.paidInCapital > 0 && (
          <p className="text-xs leading-relaxed mb-5">{t.rich(
            totals.distributions > 0 ? 'summaryWithDistributions' : 'summary',
            {
              paidIn: fmtFull(totals.paidInCapital),
              distributions: fmtFull(totals.distributions),
              nav: fmtFull(totals.nav),
              strong: chunks => <strong>{chunks}</strong>,
            },
          )}</p>
        )}

        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('empty')}</p>
        ) : (
          <>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{t('capitalSummary')}</h3>
            <table className="w-full text-xs mb-5" style={{ tableLayout: 'fixed' }}>
              <Cols />
              <thead>
                <tr className="border-b-2 border-foreground/20">
                  <th className="text-left pl-1.5 pr-2.5 py-1.5 font-semibold">{t('columns.entity')}</th>
                  <th className="text-left pl-2.5 pr-1.5 py-1.5 font-semibold">{t('columns.investment')}</th>
                  <th className="text-right px-1.5 py-1.5 font-semibold">{t('columns.commitment')}</th>
                  <th className="text-right px-1.5 py-1.5 font-semibold">{t('columns.paidIn')}</th>
                  <th className="text-right px-1.5 py-1.5 font-semibold">{t('columns.distributions')}</th>
                  <th className="text-right px-1.5 py-1.5 font-semibold">{t('columns.nav')}</th>
                  <th className="text-right px-1.5 py-1.5 font-semibold">{t('columns.totalValue')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key} className="border-b border-foreground/10">
                    <td className="pl-1.5 pr-2.5 py-1.5 max-w-0"><div className="line-clamp-2 break-words">{r.entityName}</div></td>
                    <td className="pl-2.5 pr-1.5 py-1.5">{r.portfolioGroup}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono">{fmt(r.commitment)}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono">{fmt(r.paidInCapital)}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono">{fmt(r.distributions)}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono">{fmt(r.nav)}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono">{fmt(r.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-foreground/20 font-semibold">
                  <td className="px-1.5 py-1.5" colSpan={2}>{t('total')}</td>
                  <td className="px-1.5 py-1.5 text-right font-mono">{fmt(totals.commitment)}</td>
                  <td className="px-1.5 py-1.5 text-right font-mono">{fmt(totals.paidInCapital)}</td>
                  <td className="px-1.5 py-1.5 text-right font-mono">{fmt(totals.distributions)}</td>
                  <td className="px-1.5 py-1.5 text-right font-mono">{fmt(totals.nav)}</td>
                  <td className="px-1.5 py-1.5 text-right font-mono">{fmt(totals.totalValue)}</td>
                </tr>
              </tfoot>
            </table>

            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{t('performanceMetrics')}</h3>
            <table className="w-full text-xs mb-5" style={{ tableLayout: 'fixed' }}>
              <Cols />
              <thead>
                <tr className="border-b-2 border-foreground/20">
                  <th className="text-left pl-1.5 pr-2.5 py-1.5 font-semibold">{t('columns.entity')}</th>
                  <th className="text-left pl-2.5 pr-1.5 py-1.5 font-semibold">{t('columns.investment')}</th>
                  <th className="text-right px-1.5 py-1.5 font-semibold">{t('columns.percentFunded')}</th>
                  <th className="text-right px-1.5 py-1.5 font-semibold">DPI</th>
                  <th className="text-right px-1.5 py-1.5 font-semibold">RVPI</th>
                  <th className="text-right px-1.5 py-1.5 font-semibold">TVPI</th>
                  <th className="text-right px-1.5 py-1.5 font-semibold">IRR</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key} className="border-b border-foreground/10">
                    <td className="pl-1.5 pr-2.5 py-1.5 max-w-0"><div className="line-clamp-2 break-words">{r.entityName}</div></td>
                    <td className="pl-2.5 pr-1.5 py-1.5">{r.portfolioGroup}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono">{pctOf(r.pctFunded, locale)}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono">{moic(r.dpi, locale)}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono">{moic(r.rvpi, locale)}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono">{moic(r.tvpi, locale)}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono">{pctOf(r.irr, locale)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-foreground/20 font-semibold">
                  <td className="px-1.5 py-1.5" colSpan={2}>{t('total')}</td>
                  <td className="px-1.5 py-1.5 text-right font-mono">{pctOf(totals.pctFunded, locale)}</td>
                  <td className="px-1.5 py-1.5 text-right font-mono">{moic(totals.dpi, locale)}</td>
                  <td className="px-1.5 py-1.5 text-right font-mono">{moic(totals.rvpi, locale)}</td>
                  <td className="px-1.5 py-1.5 text-right font-mono">{moic(totals.tvpi, locale)}</td>
                  <td className="px-1.5 py-1.5"></td>
                </tr>
              </tfoot>
            </table>

            {/* Called but unfunded — only when some vehicle has capital called that the LP has not
                yet wired (the receivable). Shown as its own table so it never muddles the
                paid-in figures above. */}
            {(() => {
              const unfunded = rows.filter(r => (r.receivable ?? 0) > 0.005)
              if (unfunded.length === 0) return null
              const total = unfunded.reduce((s, r) => s + (r.receivable ?? 0), 0)
              return (
                <>
                  <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{t('calledNotFunded')}</h3>
                  <table className="w-full text-xs mb-5" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '17.5%' }} />
                      <col style={{ width: '49.5%' }} />
                      <col style={{ width: '33%' }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b-2 border-foreground/20">
                        <th className="text-left pl-1.5 pr-2.5 py-1.5 font-semibold">{t('columns.entity')}</th>
                        <th className="text-left pl-2.5 pr-1.5 py-1.5 font-semibold">{t('columns.investment')}</th>
                        <th className="text-right px-1.5 py-1.5 font-semibold">{t('columns.unfundedCalled')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unfunded.map(r => (
                        <tr key={r.key} className="border-b border-foreground/10">
                          <td className="pl-1.5 pr-2.5 py-1.5 max-w-0"><div className="line-clamp-2 break-words">{r.entityName}</div></td>
                          <td className="pl-2.5 pr-1.5 py-1.5">{r.portfolioGroup}</td>
                          <td className="px-1.5 py-1.5 text-right font-mono">{fmt(r.receivable ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-foreground/20 font-semibold">
                        <td className="px-1.5 py-1.5" colSpan={2}>{t('total')}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmt(total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )
            })()}
          </>
        )}
      </div>

      <div className="report-footer text-[9px] text-muted-foreground mt-8 pt-3 border-t print:mt-0 print:pt-2">
        {props.footerNote ? props.footerNote : (
          <>
            {props.asOfFormatted && <>{t('asOf', { date: props.asOfFormatted })} </>}
            {t('definitions')}
          </>
        )}
        {/* Per-vehicle data dates — vehicles report irregularly, so state each one. */}
        {props.vehicleDataDates && props.vehicleDataDates.length > 0 && (
          <div className="mt-1">
            {t('dataLastPosted', {
              values: props.vehicleDataDates.map(v => `${v.vehicle} — ${v.date ?? t('noData')}`).join('; '),
            })}
          </div>
        )}
        {props.excludedNote && props.excludedNote.length > 0 && (
          <div className="mt-1">
            {t('excluded', { values: props.excludedNote.join(', '), count: props.excludedNote.length })}
          </div>
        )}
      </div>
    </div>
  )
}

/** The shared 7-column grid used by both tables so they align. */
function Cols() {
  return (
    <colgroup>
      <col style={{ width: '19.75%' }} />
      <col style={{ width: '27.75%' }} />
      <col style={{ width: '10.5%' }} />
      <col style={{ width: '10.5%' }} />
      <col style={{ width: '10.5%' }} />
      <col style={{ width: '10.5%' }} />
      <col style={{ width: '10.5%' }} />
    </colgroup>
  )
}

/** The print CSS the card pages share (hides app chrome, fixes the footer to the page). */
export const REPORT_CARD_PRINT_CSS = `
  @page { margin: 0.5in 0.6in; }
  @media print {
    nav, .no-print, [data-sidebar], header, footer, .site-footer, .app-footer { display: none !important; }
    body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    * { box-shadow: none !important; }
    .print-page { padding: 0; max-width: none; border: none !important; border-radius: 0 !important; }
    .report-footer { position: fixed; bottom: 0; left: 0; right: 0; padding: 8px 0; border-top: 1px solid #e5e5e5; background: white; }
    .report-content { padding-bottom: 40px; }
    .card-break { break-after: page; page-break-after: always; }
  }
`
