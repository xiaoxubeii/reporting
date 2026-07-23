'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLedgerFetch } from '@/components/accounting-vehicle'
import { useCurrency } from '@/components/currency-context'
import { formatDate, formatMoney, formatPercent } from '../format'

// The GP / associate entity panel: who owns the vehicle, who holds carry points, and how
// much carry each partner has accrued, been paid, and is still owed.
//
// Renders only for a vehicle that IS a GP/associate entity linked to a fund — the API
// returns { gp: null } otherwise and this collapses to nothing. It replaces the "GP Entity
// Ownership" table that lived on the LPs page, which matched entities by free-text name and
// netted carry off NAV.

interface Partner {
  lpEntityId: string
  name: string
  ownershipPct: number
  carryPct: number
  ownershipWeight: number
  carryWeight: number | null
  capital: { ending: number; carriedInterest: number }
  carryAccrued: number
  carryPaid: number
  carryUnpaid: number
}
interface CarryPayment { id: string; lpEntityId: string; date: string; amount: number; memo: string | null }
interface Gp {
  link: { vehicle: string; servesVehicle: string }
  basis: 'commitments' | 'override' | 'none'
  source: 'ledger' | 'events'
  associate: { ending: number; carriedInterest: number }
  partners: Partner[]
  payments: CarryPayment[]
  totals: { carryAccrued: number; carryPaid: number; carryUnpaid: number; ending: number }
}

export function GpPanel({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('Funds.gpPanel')
  const locale = useLocale()
  const lf = useLedgerFetch()
  const currency = useCurrency()
  const fmt = (v: number) => formatMoney(v, currency, locale)
  const pct = (v: number) => formatPercent(v, locale, 2)

  const [gp, setGp] = useState<Gp | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Add-a-carry-payment form (LP-tracking vehicles only).
  const [payPartner, setPayPartner] = useState('')
  const [payDate, setPayDate] = useState('')
  const [payAmount, setPayAmount] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    lf('/api/accounting/gp-economics')
      .then(r => (r.ok ? r.json() : { gp: null }))
      .then(d => setGp(d.gp ?? null))
      .finally(() => setLoading(false))
  }, [lf])
  useEffect(() => { load() }, [load])

  async function saveWeight(lpEntityId: string, field: 'ownershipWeight' | 'carryWeight', raw: string) {
    setSaving(lpEntityId + field)
    setError(null)
    const value = raw.trim() === '' ? null : Number(raw)
    const res = await lf('/api/accounting/gp-economics', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lpEntityId, [field]: value }),
    })
    const d = await res.json()
    setSaving(null)
    if (!res.ok) { setError(d.error ?? t('saveError')); return }
    setGp(d.gp)
  }

  async function addPayment() {
    setSaving('addPay'); setError(null)
    const res = await lf('/api/accounting/gp-economics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lpEntityId: payPartner, paidDate: payDate, amount: Number(payAmount) }),
    })
    const d = await res.json()
    setSaving(null)
    if (!res.ok) { setError(d.error ?? t('paymentError')); return }
    setGp(d.gp)
    setPayPartner(''); setPayDate(''); setPayAmount('')
  }

  async function deletePayment(id: string) {
    setSaving('del' + id); setError(null)
    const res = await lf(`/api/accounting/gp-economics?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    setSaving(null)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? t('deleteError')); return }
    load()
  }

  if (loading || !gp) return null

  const derived = gp.basis === 'commitments'
  const nameById = new Map(gp.partners.map(p => [p.lpEntityId, p.name]))

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">
          {gp.link.vehicle}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{t('gpOf', { vehicle: gp.link.servesVehicle })}</span>
        </h2>
        <p className="text-xs text-muted-foreground max-w-3xl">
          {t('description', { vehicle: gp.link.servesVehicle })}
        </p>
      </div>

      {/* Carry ownership defaults to each partner's capital ownership (the split of the capital
          this entity holds in the served fund), and can be overridden per partner. */}
      <p className="text-xs text-muted-foreground">
        {gp.basis === 'none' ? (
          <>{t.rich('noCommitments', { strong: chunks => <strong>{chunks}</strong> })}</>
        ) : (
          <>{t.rich('defaults', { strong: chunks => <strong>{chunks}</strong>, derived: derived ? t('derived', { vehicle: gp.link.vehicle }) : '' })}</>
        )}
      </p>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">{t('partner')}</th>
              <th className="text-right px-3 py-1.5 font-medium">{t('carryOwnership')}</th>
              <th className="text-right px-3 py-1.5 font-medium">{t('carryAccrued')}</th>
              <th className="text-right px-3 py-1.5 font-medium">{t('carryPaid')}</th>
              <th className="text-right px-3 py-1.5 font-medium">{t('carryUnpaid')}</th>
            </tr>
          </thead>
          <tbody>
            {gp.partners.map(p => (
              <tr key={p.lpEntityId} className="border-t">
                <td className="px-3 py-1.5">{p.name}</td>

                <td className="px-3 py-1.5 text-right font-mono">
                  {isAdmin ? (
                    <WeightInput
                      value={p.carryWeight ?? ''}
                      suffix={pct(p.carryPct)}
                      busy={saving === p.lpEntityId + 'carryWeight'}
                      onSave={v => saveWeight(p.lpEntityId, 'carryWeight', v)}
                      placeholder="—"
                    />
                  ) : pct(p.carryPct)}
                </td>

                <td className="px-3 py-1.5 text-right font-mono">{fmt(p.carryAccrued)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{fmt(p.carryPaid)}</td>
                <td className="px-3 py-1.5 text-right font-mono font-medium">{fmt(p.carryUnpaid)}</td>
              </tr>
            ))}

            <tr className="border-t font-medium">
              <td className="px-3 py-1.5">{t('total')}</td>
              <td />
              <td className="px-3 py-1.5 text-right font-mono">{fmt(gp.totals.carryAccrued)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{fmt(gp.totals.carryPaid)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{fmt(gp.totals.carryUnpaid)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {gp.partners.some(p => p.carryUnpaid < -0.005) && (
        <p className="text-xs text-amber-600">
          {t.rich('negativeHelp', { strong: chunks => <strong>{chunks}</strong> })}
        </p>
      )}

      {/* Carry paid, sourced by mode. Ledger: rolled up per partner from the associate's own
          books, read-only. LP tracking: an explicit register of (partner, date, amount). */}
      {gp.source === 'ledger' ? (
        <p className="text-xs text-muted-foreground">
          {t('ledgerHelp', { vehicle: gp.link.vehicle })}
        </p>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t('payments.title')}</h3>
          <p className="text-xs text-muted-foreground">{t('payments.description')}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium">{t('partner')}</th>
                  <th className="text-left px-3 py-1.5 font-medium">{t('payments.date')}</th>
                  <th className="text-right px-3 py-1.5 font-medium">{t('payments.amount')}</th>
                  {isAdmin && <th className="px-3 py-1.5" />}
                </tr>
              </thead>
              <tbody>
                {gp.payments.length === 0 && (
                  <tr><td colSpan={isAdmin ? 4 : 3} className="px-3 py-3 text-center text-muted-foreground text-xs">{t('payments.empty')}</td></tr>
                )}
                {gp.payments.map(pay => (
                  <tr key={pay.id} className="border-t">
                    <td className="px-3 py-1.5">{nameById.get(pay.lpEntityId) ?? pay.lpEntityId}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{formatDate(pay.date, locale)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmt(pay.amount)}</td>
                    {isAdmin && (
                      <td className="px-3 py-1.5 text-right">
                        <button onClick={() => deletePayment(pay.id)} disabled={saving === 'del' + pay.id} className="text-muted-foreground hover:text-red-600">
                          {saving === 'del' + pay.id ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : <Trash2 className="h-3.5 w-3.5 inline" />}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <label className="text-xs text-muted-foreground">{t('partner')}
                <select value={payPartner} onChange={e => setPayPartner(e.target.value)} className="mt-1 h-9 px-2 rounded-md border border-input bg-background text-sm block min-w-[160px]">
                  <option value="">{t('choose')}</option>
                  {gp.partners.map(p => <option key={p.lpEntityId} value={p.lpEntityId}>{p.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">{t('payments.date')}
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="mt-1 h-9 w-40" />
              </label>
              <label className="text-xs text-muted-foreground">{t('payments.amount')}
                <Input value={payAmount} onChange={e => setPayAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="mt-1 h-9 w-36 font-mono" />
              </label>
              <Button size="sm" onClick={addPayment} disabled={!payPartner || !payDate || !payAmount || saving !== null}>
                {saving === 'addPay' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} {t('payments.add')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** A weight cell that saves on blur and shows the resulting % beside it. */
function WeightInput({
  value, suffix, busy, onSave, placeholder,
}: {
  value: number | string
  suffix: string
  busy: boolean
  onSave: (v: string) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState(String(value ?? ''))
  useEffect(() => { setDraft(String(value ?? '')) }, [value])

  return (
    <span className="inline-flex items-center gap-1.5 justify-end">
      <Input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== String(value ?? '')) onSave(draft) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        inputMode="decimal"
        placeholder={placeholder}
        className="h-8 w-20 text-right font-mono"
      />
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-xs text-muted-foreground w-14">{suffix}</span>}
    </span>
  )
}
