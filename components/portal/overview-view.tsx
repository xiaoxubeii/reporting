'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { OverviewMetrics, OverviewTotals, OverviewVehicle } from '@/lib/lp-overview'

export interface OverviewViewData extends Partial<OverviewMetrics> {
  investorName?: string | null
  currency?: string
  hasData: boolean
}

function MetricBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

/**
 * LP-portal overview dashboard: greeting, headline totals (Committed / Called /
 * Distributed / NAV) and a card per investment vehicle. Presentational only —
 * the live portal and the GP preview both feed it the same shape.
 */
export function OverviewView({ data }: { data: OverviewViewData }) {
  const t = useTranslations('Portal')
  const format = useFormatter()
  const currency = data.currency || 'USD'
  const name = (data.investorName ?? '').trim()
  const fmtMoney = (value: number) => format.number(value || 0, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  })
  const fmtMultiple = (value: number | null | undefined) => value == null
    ? '—'
    : t('overview.multiple', { value: format.number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })
  const fmtDate = (value: string | null | undefined) => {
    if (!value) return ''
    const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
    return isNaN(date.getTime())
      ? ''
      : format.dateTime(date, { month: 'long', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{name ? t('overview.welcomeNamed', { name }) : t('overview.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {data.hasData
            ? data.asOfDate
              ? t('overview.positionAsOf', { date: fmtDate(data.asOfDate) })
              : t('overview.position')
            : t('overview.pendingDescription')}
        </p>
      </div>

      {!data.hasData || !data.totals ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('overview.noFigures')}</p>
          <Link href="/portal/snapshots" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
            {t('overview.browseDocuments')} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <>
          {/* Headline totals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricBox label={t('overview.committed')} value={fmtMoney(data.totals.commitment)} />
            <MetricBox label={t('overview.called')} value={fmtMoney(data.totals.called)} />
            <MetricBox label={t('overview.distributed')} value={fmtMoney(data.totals.distributed)} />
            <MetricBox
              label={t('overview.netAssetValue')}
              value={fmtMoney(data.totals.nav)}
              sub={data.totals.tvpi != null
                ? t('overview.ratioSummary', { tvpi: fmtMultiple(data.totals.tvpi), dpi: fmtMultiple(data.totals.dpi) })
                : undefined}
            />
          </div>

          {/* Per-vehicle */}
          {(data.vehicles?.length ?? 0) > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">{t('overview.byVehicle')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.vehicles!.map((v: OverviewVehicle) => (
                  <div key={v.name} className="rounded-lg border bg-card p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-medium truncate">{v.name}</h3>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {t('overview.tvpiValue', { value: fmtMultiple(v.tvpi) })}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <Row label={t('overview.committed')} value={fmtMoney(v.commitment)} />
                      <Row label={t('overview.called')} value={fmtMoney(v.called)} />
                      <Row label={t('overview.distributed')} value={fmtMoney(v.distributed)} />
                      <Row label={t('overview.nav')} value={fmtMoney(v.nav)} />
                    </dl>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums font-medium">{value}</dd>
    </div>
  )
}

// Re-export the totals type for consumers that want to type their data.
export type { OverviewTotals }
