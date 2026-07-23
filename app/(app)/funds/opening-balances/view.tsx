'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, Check, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCurrency } from '@/components/currency-context'
import { useLedgerFetch, useFundSeg } from '@/components/accounting-vehicle'
import { formatMoney } from '../format'

interface Entity { lpEntityId: string; name: string; commitment: number }

export function OpeningBalancesView() {
  const locale = useLocale()
  const t = useTranslations('Funds.openingBalances')
  const currency = useCurrency()
  const fmt = (v: number) => formatMoney(v, currency, locale)
  const fundSeg = useFundSeg()
  const [entities, setEntities] = useState<Entity[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [entryDate, setEntryDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<{ lpCount: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [historyMode, setHistoryMode] = useState<string | null>(null)
  const [override, setOverride] = useState(false)
  const lf = useLedgerFetch()

  useEffect(() => {
    setLoading(true)
    Promise.all([
      lf('/api/accounting/entities').then(r => (r.ok ? r.json() : [])),
      lf('/api/accounting/allocation-terms').then(r => (r.ok ? r.json() : null)),
    ])
      .then(([ents, settings]) => {
        setEntities(Array.isArray(ents) ? ents : [])
        setHistoryMode(settings?.historyMode ?? null)
      })
      .finally(() => setLoading(false))
  }, [lf])

  const total = Object.values(amounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)

  async function submit() {
    setSaving(true)
    setError(null)
    const balances = entities
      .map(e => ({ lpEntityId: e.lpEntityId, amount: parseFloat(amounts[e.lpEntityId] ?? '') }))
      .filter(b => !isNaN(b.amount) && b.amount !== 0)
    const res = await lf('/api/accounting/opening-balances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryDate, balances }),
    })
    const data = await res.json()
    if (res.ok) setDone({ lpCount: data.lpCount, total: data.total })
    else setError(data.error ?? t('importFailed'))
    setSaving(false)
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t('loading')}</div>
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
        <Check className="h-4 w-4" />
        {t('booked', { count: done.lpCount, total: fmt(done.total) })}
      </div>
    )
  }

  if (entities.length === 0) {
    return (
      <div className="border border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground">
        {t('noEntities')}
      </div>
    )
  }

  // On a full-history vehicle the ledger already starts at inception, so opening
  // balances are DERIVED from it. Booking them here would credit every LP's capital a
  // second time — double-counting the fund's entire contributed capital. Block it
  // behind an explicit override rather than letting a stray visit corrupt the books.
  if (historyMode === 'full_history' && !override) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm space-y-2">
        <p className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />{t('notNeeded')}
        </p>
        <p className="text-muted-foreground">
          {t.rich('fullHistoryHelp', { strong: chunks => <strong>{chunks}</strong> })}
        </p>
        <p className="text-muted-foreground">
          {t.rich('continueHelp', {
            accounting: chunks => <Link href="/funds" className="underline underline-offset-2 hover:text-foreground">{chunks}</Link>,
            bank: chunks => <Link href={fundSeg ? `/funds/${fundSeg}/bank` : '/funds'} className="underline underline-offset-2 hover:text-foreground">{chunks}</Link>,
          })}
        </p>
        <button onClick={() => setOverride(true)} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
          {t('override')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t('cutoverDate')}</label>
        <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium">{t('lpEntity')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('commitment')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('openingCapital')}</th>
            </tr>
          </thead>
          <tbody>
            {entities.map(e => (
              <tr key={e.lpEntityId} className="border-b last:border-b-0">
                <td className="px-3 py-2">{e.name}</td>
                <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmt(e.commitment)}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    value={amounts[e.lpEntityId] ?? ''}
                    onChange={ev => setAmounts(prev => ({ ...prev, [e.lpEntityId]: ev.target.value }))}
                    placeholder="0.00"
                    className="border rounded px-1.5 py-0.5 text-sm text-right w-36 font-mono bg-transparent"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-3 py-2" colSpan={2}>{t('totalOpeningNav')}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button onClick={submit} disabled={saving || !entryDate || total === 0}>
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {t('book')}
      </Button>
    </div>
  )
}
