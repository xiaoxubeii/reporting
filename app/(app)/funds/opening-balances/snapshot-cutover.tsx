'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, Check, AlertTriangle, Undo2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/confirm-dialog'
import { useCurrency } from '@/components/currency-context'
import { formatDate, formatMoney, formatNumber } from '../format'

// Copy the latest LP snapshot into the vehicles as capital events.
//
// FUND-WIDE, unlike everything else on this page — it runs across every vehicle at once,
// which is the point: it is how you stop re-importing a spreadsheet and start tracking
// capital. So it does NOT use useLedgerFetch (which would scope it to the selected
// vehicle) and it says so on the tin.

interface PlannedEvent { sourceType: string; amount: number; memo: string }
interface PlannedLp {
  lpEntityId: string; name: string; commitment: number; snapshotNav: number
  endingCapital: number; events: PlannedEvent[]; hasCommitment: boolean; warnings: string[]
}
interface PlannedVehicle {
  vehicle: string; action: 'copy' | 'skip'; skipReason?: string
  lps: PlannedLp[]; totalNav: number; eventCount: number; commitmentsToCreate: number
}
interface Preview {
  snapshot: { id: string; name: string; asOf: string }
  vehicles: PlannedVehicle[]
  totals: { vehicles: number; lps: number; events: number; commitments: number; warnings: number }
  alreadyImported: boolean
}

const EVENT_TYPES = ['capital_call', 'distribution', 'valuation'] as const

export function SnapshotCutover() {
  const t = useTranslations('Funds.snapshotCutover')
  const locale = useLocale()
  const currency = useCurrency()
  const fmt = (v: number) => formatMoney(v, currency, locale)
  const confirm = useConfirm()

  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ events: number; commitments: number; vehicles: string[]; errors: string[] } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/accounting/cutover')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else { setPreview(d); setError(null) } })
      .catch(() => setError(t('loadError')))
      .finally(() => setLoading(false))
  }, [t])
  useEffect(() => { load() }, [load])

  async function run() {
    if (!preview) return
    const ok = await confirm({
      title: t('confirm.title', { name: preview.snapshot.name, vehicles: preview.totals.vehicles }),
      description: t('confirm.description', { events: preview.totals.events, lps: preview.totals.lps, date: formatDate(preview.snapshot.asOf, locale) }),
      confirmLabel: t('confirm.copy'),
    })
    if (!ok) return
    setRunning(true)
    setError(null)
    const res = await fetch('/api/accounting/cutover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot: preview.snapshot.id }),
    })
    const d = await res.json()
    setRunning(false)
    if (!res.ok) { setError(d.error ?? t('cutoverError')); return }
    setDone({ events: d.eventsWritten, commitments: d.commitmentsWritten, vehicles: d.vehicles, errors: d.errors ?? [] })
    load()
  }

  async function revert() {
    if (!preview) return
    const ok = await confirm({
      title: t('undo.title'),
      description: t('undo.description'),
      confirmLabel: t('undo.button'),
      variant: 'destructive',
    })
    if (!ok) return
    setRunning(true)
    const res = await fetch(`/api/accounting/cutover?snapshot=${preview.snapshot.id}`, { method: 'DELETE' })
    const d = await res.json()
    setRunning(false)
    if (!res.ok) { setError(d.error ?? t('undo.error')); return }
    setDone(null)
    load()
  }

  if (loading) {
    return (
      <div className="rounded-lg border p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
      </div>
    )
  }
  if (error && !preview) {
    return <div className="rounded-lg border p-4 text-sm text-muted-foreground">{error}</div>
  }
  if (!preview) return null

  const copying = preview.vehicles.filter(v => v.action === 'copy')
  const skipped = preview.vehicles.filter(v => v.action === 'skip')
  const localizeSkipReason = (reason?: string) => {
    const keys: Record<string, 'skipped.skipList' | 'skipped.noMatch' | 'skipped.noRows' | 'skipped.hasLedger'> = {
      'On the skip list — reconciled by hand already.': 'skipped.skipList',
      'No matching vehicle in the registry.': 'skipped.noMatch',
      'No rows for this vehicle in the snapshot.': 'skipped.noRows',
      'Already on the ledger — it has books. Copying would duplicate its capital.': 'skipped.hasLedger',
    }
    return reason && keys[reason] ? t(keys[reason]) : reason ?? ''
  }
  const localizeWarning = (warning: string) => {
    let match = warning.match(/^called \(([^)]+)\) and paid-in \(([^)]+)\) differ/)
    if (match) return t('warnings.calledDiffers', { called: match[1], paidIn: match[2] })
    match = warning.match(/^negative paid-in \(([^)]+)\)$/)
    if (match) return t('warnings.negativePaidIn', { value: match[1] })
    match = warning.match(/^derived NAV is negative \(([^)]+)\)/)
    if (match) return t('warnings.negativeNav', { value: match[1] })
    match = warning.match(/^paid-in \(([^)]+)\) exceeds commitment \(([^)]+)\)$/)
    if (match) return t('warnings.exceedsCommitment', { paidIn: match[1], commitment: match[2] })
    return warning
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{t('title')}</h2>
        <p className="text-xs text-muted-foreground max-w-3xl">
          {t.rich('description', { name: preview.snapshot.name, date: formatDate(preview.snapshot.asOf, locale), strong: chunks => <strong>{chunks}</strong> })}
        </p>
      </div>

      {preview.alreadyImported && !done && (
        <p className="text-xs rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-2.5 py-2">
          {t.rich('alreadyImported', { strong: chunks => <strong>{chunks}</strong> })}
        </p>
      )}

      {done && (
        <div className="rounded-md border p-3 text-sm space-y-1">
          <p className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
            <Check className="h-4 w-4" />
            {t('done', { events: done.events, commitments: done.commitments, vehicles: done.vehicles.join(', ') })}
          </p>
          {done.errors.map((e, i) => <p key={i} className="text-xs text-amber-600">{e}</p>)}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Totals */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <Stat label={t('stats.vehicles')} value={formatNumber(preview.totals.vehicles, locale)} />
        <Stat label={t('stats.lps')} value={formatNumber(preview.totals.lps, locale)} />
        <Stat label={t('stats.events')} value={formatNumber(preview.totals.events, locale)} />
        <Stat label={t('stats.commitments')} value={formatNumber(preview.totals.commitments, locale)} />
        {preview.totals.warnings > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('stats.warnings', { count: preview.totals.warnings })}
          </span>
        )}
      </div>

      {/* Per-vehicle plan */}
      <div className="space-y-2">
        {copying.map(v => (
          <div key={v.vehicle} className="rounded-md border">
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40"
              onClick={() => setExpanded(expanded === v.vehicle ? null : v.vehicle)}
            >
              <span className="text-sm font-medium">{v.vehicle}</span>
              <span className="text-xs text-muted-foreground">
                {t('vehicleSummary', { lps: v.lps.length, events: v.eventCount, nav: fmt(v.totalNav) })}
              </span>
            </button>

            {expanded === v.vehicle && (
              <div className="border-t overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">LP</th>
                      <th className="text-right px-3 py-1.5 font-medium">{t('columns.committed')}</th>
                      {EVENT_TYPES.map(eventType => (
                        <th key={eventType} className="text-right px-3 py-1.5 font-medium">{t(`columns.${eventType}`)}</th>
                      ))}
                      <th className="text-right px-3 py-1.5 font-medium">{t('columns.ending')}</th>
                      <th className="text-right px-3 py-1.5 font-medium">{t('columns.snapshotNav')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.lps.map(lp => {
                      // The events are debit-positive. Show them the way a person reads a capital
                      // account — a contribution is a positive number that went IN.
                      const amt = (t: string) => {
                        const e = lp.events.find(x => x.sourceType === t)
                        return e ? -e.amount : 0
                      }
                      const ties = Math.abs(lp.endingCapital - lp.snapshotNav) < 0.005
                      return (
                        <tr key={lp.lpEntityId} className="border-t">
                          <td className="px-3 py-1.5">
                            {lp.name}
                            {!lp.hasCommitment && lp.commitment > 0 && (
                              <span className="ml-1.5 text-[10px] text-muted-foreground">{t('commitmentAdded')}</span>
                            )}
                            {lp.warnings.map((w, i) => (
                              <span key={i} className="block text-[10px] text-amber-600">{localizeWarning(w)}</span>
                            ))}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{fmt(lp.commitment)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{fmt(amt('capital_call'))}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{fmt(-amt('distribution'))}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{fmt(amt('valuation'))}</td>
                          <td className="px-3 py-1.5 text-right font-mono font-medium">{fmt(lp.endingCapital)}</td>
                          {/* The check that matters: the events must reproduce the snapshot's NAV. */}
                          <td className={`px-3 py-1.5 text-right font-mono ${ties ? 'text-muted-foreground' : 'text-red-600 font-medium'}`}>
                            {fmt(lp.snapshotNav)}{ties ? '' : ' ✕'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}

        {skipped.length > 0 && (
          <div className="rounded-md border border-dashed p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t('skipped.title')}</p>
            {skipped.map(v => (
              <p key={v.vehicle} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/70">{v.vehicle}</span> — {localizeSkipReason(v.skipReason)}
              </p>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground max-w-3xl">
        {t('footnote')}
      </p>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={run} disabled={running || copying.length === 0}>
          {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1" />}
          {t('copyButton', { count: copying.length })}
        </Button>
        {preview.alreadyImported && (
          <Button size="sm" variant="outline" onClick={revert} disabled={running}>
            <Undo2 className="h-4 w-4 mr-1" />
            {t('undo.button')}
          </Button>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-muted-foreground">
      {label} <span className="font-mono font-medium text-foreground">{value}</span>
    </span>
  )
}
