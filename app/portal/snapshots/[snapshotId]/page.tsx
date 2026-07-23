'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ArrowLeft, Download } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { AccessHistory } from '@/components/portal/access-history'

interface Investment {
  id: string
  entity_id: string
  portfolio_group: string
  commitment: number | null
  total_value: number | null
  nav: number | null
  called_capital: number | null
  paid_in_capital: number | null
  distributions: number | null
  outstanding_balance: number | null
  dpi: number | null
  rvpi: number | null
  tvpi: number | null
  irr: number | null
  lp_entities: { id: string; entity_name: string; investor_id: string; lp_investors: { id: string; name: string } } | null
}

interface Snapshot { id: string; name: string; as_of_date: string | null; description: string | null; footer_note: string | null }

export default function PortalSnapshotDetailPage() {
  const t = useTranslations('Portal')
  const format = useFormatter()
  const { snapshotId } = useParams<{ snapshotId: string }>()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const money = (value: number | null) => value == null
    ? '—'
    : format.number(value, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const moic = (value: number | null) => value == null
    ? '—'
    : t('snapshotDetail.multiple', { value: format.number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })
  const pct = (value: number | null) => value == null
    ? '—'
    : format.number(value, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const fmtDate = (value: string) => {
    const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
    return isNaN(date.getTime()) ? value : format.dateTime(date, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  async function downloadPdf() {
    if (!snapshot) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/portal/snapshots/${snapshot.id}/pdf`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${snapshot.name}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  useEffect(() => {
    fetch(`/api/portal/snapshots/${snapshotId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then(body => { setSnapshot(body.snapshot); setInvestments(body.investments ?? []) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [snapshotId])

  // Group by investor → entity for a clean statement layout.
  const byInvestor = useMemo(() => {
    const map = new Map<string, { name: string; rows: Investment[] }>()
    for (const inv of investments) {
      const investor = inv.lp_entities?.lp_investors
      const key = investor?.id ?? 'unknown'
      if (!map.has(key)) map.set(key, { name: investor?.name ?? t('snapshotDetail.yourHoldings'), rows: [] })
      map.get(key)!.rows.push(inv)
    }
    return Array.from(map.values())
  }, [investments, t])

  const totals = useMemo(() => {
    const sum = (f: (i: Investment) => number | null) => investments.reduce((a, i) => a + (f(i) ?? 0), 0)
    return {
      commitment: sum(i => i.commitment),
      called: sum(i => i.called_capital ?? i.paid_in_capital),
      distributions: sum(i => i.distributions),
      nav: sum(i => i.nav ?? i.total_value),
    }
  }, [investments])

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}</div>
  }
  if (error || !snapshot) {
    return (
      <div className="space-y-4">
        <Link href="/portal/snapshots" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> {t('common.back')}</Link>
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error ? t('snapshotDetail.unavailable') : t('common.notFound')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link href="/portal/snapshots" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> {t('common.backToDocuments')}</Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{snapshot.name}</h1>
          {snapshot.as_of_date && <p className="text-sm text-muted-foreground mt-0.5">{t('snapshotDetail.asOf', { date: fmtDate(snapshot.as_of_date) })}</p>}
          {snapshot.description && <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{snapshot.description}</p>}
        </div>
        <button
          onClick={downloadPdf}
          disabled={downloading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-60"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {t('common.downloadPdf')}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'commitment', label: t('snapshotDetail.commitment'), value: money(totals.commitment) },
          { key: 'called', label: t('snapshotDetail.called'), value: money(totals.called) },
          { key: 'distributions', label: t('snapshotDetail.distributions'), value: money(totals.distributions) },
          { key: 'nav', label: t('snapshotDetail.netAssetValue'), value: money(totals.nav) },
        ].map(s => (
          <div key={s.key} className="rounded-md border bg-card p-3">
            <div className="text-lg font-semibold tabular-nums">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {byInvestor.map((grp, gi) => (
        <div key={gi} className="space-y-2">
          {byInvestor.length > 1 && <h2 className="text-sm font-medium">{grp.name}</h2>}
          <div className="rounded-md border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t('snapshotDetail.vehicle')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('snapshotDetail.commitment')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('snapshotDetail.called')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('snapshotDetail.distributions')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('snapshotDetail.nav')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('snapshotDetail.dpi')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('snapshotDetail.tvpi')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('snapshotDetail.irr')}</th>
                </tr>
              </thead>
              <tbody>
                {grp.rows.map(inv => (
                  <tr key={inv.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{inv.lp_entities?.entity_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{inv.portfolio_group}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(inv.commitment)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(inv.called_capital ?? inv.paid_in_capital)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(inv.distributions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(inv.nav ?? inv.total_value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{moic(inv.dpi)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{moic(inv.tvpi)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(inv.irr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {snapshot.footer_note && <p className="text-xs text-muted-foreground max-w-2xl">{snapshot.footer_note}</p>}

      <div className="pt-2 border-t">
        <AccessHistory type="snapshot" id={snapshot.id} />
      </div>
    </div>
  )
}
