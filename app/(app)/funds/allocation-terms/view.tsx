'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, Plus, ArrowLeftRight, Pencil, Trash2, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrency } from '@/components/currency-context'
import { useLedgerFetch } from '@/components/accounting-vehicle'
import { RenameInvestorDialog } from '@/components/lp/rename-investor-dialog'
import { formatDate, formatMoney } from '../format'

type Category = 'management_fee' | 'partnership_expense' | 'organizational_expense' | 'realized_gain' | 'valuation' | 'income' | 'carried_interest'

interface Term { lpEntityId: string; category: Category; participates: boolean; weightOverride: number | null; rateOverride: number | null }
interface Partner { lpEntityId: string; name: string; partnerClass: string; commitment: number; terms: Term[] }
interface CommitmentEvent { id: string; lpEntityId: string; name: string; effectiveDate: string; amount: number; kind: string; transferId?: string | null; memo?: string | null }

// The categories worth setting per partner. Gains/income are almost always pro-rata
// to everyone, so they're not surfaced here — the API still accepts them.
const CATEGORIES = ['management_fee', 'partnership_expense', 'organizational_expense', 'carried_interest'] as const satisfies readonly Category[]

export function AllocationTermsView() {
  const t = useTranslations('Funds.allocationTerms')
  const locale = useLocale()
  const currency = useCurrency()
  const fmt = (v: number) => formatMoney(v, currency, locale)
  const lf = useLedgerFetch()

  const [basis, setBasis] = useState<'commitment' | 'capital_balance'>('commitment')
  const [partners, setPartners] = useState<Partner[]>([])
  const [events, setEvents] = useState<CommitmentEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showChange, setShowChange] = useState(false)
  const [isTransfer, setIsTransfer] = useState(false)
  const [lp, setLp] = useState('')
  const [from, setFrom] = useState('')
  const [amount, setAmount] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [memo, setMemo] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ entityId: string; name: string } | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [showBasis, setShowBasis] = useState(false)
  const [addName, setAddName] = useState('')
  const [addCommitment, setAddCommitment] = useState('')
  const [addPartnerClass, setAddPartnerClass] = useState('lp')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [t, c] = await Promise.all([
      lf('/api/accounting/allocation-terms').then(r => (r.ok ? r.json() : null)),
      lf('/api/accounting/commitments').then(r => (r.ok ? r.json() : null)),
    ])
    if (t) { setBasis(t.basis); setPartners(t.partners ?? []) }
    if (c) setEvents(c.events ?? [])
    setLoading(false)
  }, [lf])
  useEffect(() => { load() }, [load])

  const post = async (url: string, body: object, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') => {
    setBusy(true); setError(null)
    try {
      const res = await lf(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      // Guard the parse: a 500 returns an HTML error page, not JSON, so a bare
      // res.json() would throw BEFORE the !res.ok check and the failure would vanish
      // (unhandled rejection, no error shown, busy stuck true).
      const data = await res.json().catch(() => ({} as { error?: string }))
      if (!res.ok) { setError(data.error ?? t('requestFailed', { status: res.status })); return false }
      await load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : t('connectionError'))
      return false
    } finally {
      setBusy(false)
    }
  }

  const termFor = (p: Partner, c: Category) => p.terms.find(t => t.category === c)

  async function addLp() {
    if (!addName.trim()) { setError(t('add.nameRequired')); return }
    setAdding(true)
    const ok = await post('/api/accounting/lps', {
      name: addName.trim(), commitment: Number(addCommitment) || 0, partnerClass: addPartnerClass,
    })
    setAdding(false)
    if (ok) { setAddName(''); setAddCommitment(''); setAddPartnerClass('lp'); setShowAdd(false) }
  }

  async function toggle(p: Partner, c: Category, participates: boolean) {
    await post('/api/accounting/allocation-terms', {
      action: 'term', lpEntityId: p.lpEntityId, category: c, participates,
      weightOverride: termFor(p, c)?.weightOverride ?? null,
    })
  }

  async function submitChange() {
    const amt = Number(amount)
    if (!lp || !effectiveDate || !amt) { setError(t('change.required')); return }
    const ok = editingId
      ? await post('/api/accounting/commitments', {
          id: editingId,
          effectiveDate,
          amount: amt,
          memo: memo || null,
        }, 'PATCH')
      : await post('/api/accounting/commitments', {
          lpEntityId: lp,
          effectiveDate,
          amount: amt,
          counterpartyEntityId: isTransfer ? from : null,
          memo: memo || null,
        })
    if (ok) resetChangeForm()
  }

  function resetChangeForm() {
    setLp(''); setFrom(''); setAmount(''); setMemo(''); setEffectiveDate(''); setIsTransfer(false)
    setEditingId(null); setShowChange(false)
  }

  function startEdit(e: CommitmentEvent) {
    setEditingId(e.id)
    setIsTransfer(false)
    setLp(e.lpEntityId)
    setFrom('')
    setAmount(String(e.amount))
    setEffectiveDate(e.effectiveDate)
    setMemo(e.memo ?? '')
    setShowChange(true)
  }

  async function deleteEvent(id: string) {
    if (!window.confirm(t('history.deleteConfirm'))) return
    await post('/api/accounting/commitments', { id }, 'DELETE')
  }

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t('loading')}</div>

  const totalCommitment = partners.reduce((s, p) => s + p.commitment, 0)

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-amber-600">{error}</p>}

      {/* Per-partner terms — actions (Add LP / Change Commitment / Basis) share one panel */}
      <div>
        <p className="text-sm font-medium mb-1">{t('partners.title')}</p>
        <p className="text-xs text-muted-foreground mb-2">
          {t('partners.description')}
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Button size="sm" variant="outline" onClick={() => { setShowBasis(false); if (showAdd) { setShowAdd(false) } else { setShowAdd(true); setShowChange(false) } }}>
            <Plus className="h-3.5 w-3.5 mr-1" />{t('add.open')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setShowBasis(false); if (showChange) resetChangeForm(); else { setShowChange(true); setShowAdd(false) } }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />{t('change.open')}
          </Button>
          {/* Basis: a compact button showing the current setting; opens a small popup. */}
          <Button
            size="sm"
            variant="outline"
            className="text-muted-foreground"
            onClick={() => { setShowBasis(v => !v); setShowAdd(false); setShowChange(false) }}
            title={t('basis.help')}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />{t('basis.button', { basis: t(basis === 'commitment' ? 'basis.committed' : 'basis.capitalBalance') })}
          </Button>
        </div>

        {showBasis && (
          <div className="border rounded-lg p-3 mb-3 max-w-md space-y-2">
            <p className="text-xs text-muted-foreground">
              {t('basis.description')}
            </p>
            <select
              value={basis}
              onChange={e => {
                const v = e.target.value as 'commitment' | 'capital_balance'
                setBasis(v)
                post('/api/accounting/allocation-terms', { action: 'basis', basis: v })
                setShowBasis(false)
              }}
              disabled={busy}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="commitment">{t('basis.committedCapital')}</option>
              <option value="capital_balance">{t('basis.capitalBalanceEnd')}</option>
            </select>
          </div>
        )}

        {showAdd && (
          <div className="border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted-foreground">{t('add.name')}
              <Input value={addName} onChange={e => setAddName(e.target.value)} placeholder={t('add.namePlaceholder')} className="mt-1 h-9 w-64" />
            </label>
            <label className="text-xs text-muted-foreground">{t('commitment')}
              <Input value={addCommitment} onChange={e => setAddCommitment(e.target.value)} inputMode="decimal" placeholder="0.00" className="mt-1 h-9 w-36 font-mono" />
            </label>
            <label className="text-xs text-muted-foreground">{t('add.type')}
              <select value={addPartnerClass} onChange={e => setAddPartnerClass(e.target.value)} className="mt-1 block h-9 px-3 rounded-md border border-input bg-background text-sm">
                <option value="lp">LP</option>
                <option value="gp">GP</option>
              </select>
            </label>
            <Button size="sm" onClick={addLp} disabled={adding}>{adding && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{t('add.button')}</Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={adding}
              onClick={() => { setShowAdd(false); setAddName(''); setAddCommitment(''); setAddPartnerClass('lp'); setError(null) }}
            >
              {t('cancel')}
            </Button>
          </div>
        )}

        {showChange && (
          <div className="border rounded-lg p-3 mb-3 space-y-3">
            {editingId && (
              <p className="text-xs text-muted-foreground">{t('change.editHelp')}</p>
            )}
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={isTransfer} disabled={!!editingId} onChange={e => setIsTransfer(e.target.checked)} />
              <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
              {t('change.transfer')}
            </label>
            <div className="flex flex-wrap items-end gap-3">
              {isTransfer && (
                <label className="text-xs text-muted-foreground">{t('change.from')}
                  <select value={from} disabled={!!editingId} onChange={e => setFrom(e.target.value)} className="mt-1 block h-9 px-2 rounded-md border border-input bg-background text-sm max-w-[200px]">
                    <option value="">{t('select')}</option>
                    {partners.map(p => <option key={p.lpEntityId} value={p.lpEntityId}>{p.name}</option>)}
                  </select>
                </label>
              )}
              <label className="text-xs text-muted-foreground">{t(isTransfer ? 'change.to' : 'partner')}
                <select value={lp} disabled={!!editingId} onChange={e => setLp(e.target.value)} className="mt-1 block h-9 px-2 rounded-md border border-input bg-background text-sm max-w-[200px]">
                  <option value="">{t('select')}</option>
                  {partners.map(p => <option key={p.lpEntityId} value={p.lpEntityId}>{p.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">{t('change.amount')}
                <Input
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder={isTransfer ? '100000' : t('change.amountPlaceholder')}
                  className="mt-1 h-9 w-36 font-mono"
                />
              </label>
              <label className="text-xs text-muted-foreground">{t('change.effective')}
                <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className="mt-1 h-9 w-40" />
              </label>
              <label className="text-xs text-muted-foreground flex-1 min-w-[160px]">{t('change.memo')}
                <Input value={memo} onChange={e => setMemo(e.target.value)} placeholder={t('change.memoPlaceholder')} className="mt-1 h-9 w-full" />
              </label>
              <Button size="sm" onClick={submitChange} disabled={busy}>
                {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}{t(editingId ? 'change.save' : 'change.record')}
              </Button>
              {editingId && (
                <Button size="sm" variant="ghost" onClick={resetChangeForm} disabled={busy}>{t('cancel')}</Button>
              )}
            </div>
          </div>
        )}

        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium">{t('partner')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('commitment')}</th>
                {CATEGORIES.map(category => <th key={category} className="px-3 py-2 font-medium text-center">{t(`categories.${category}`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {partners.map(p => (
                <tr key={p.lpEntityId} className="group border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span>{p.name}</span>
                      {p.partnerClass === 'gp' && <span className="text-[10px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted text-muted-foreground">GP</span>}
                      <button
                        type="button"
                        onClick={() => setRenaming({ entityId: p.lpEntityId, name: p.name })}
                        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                        title={t('rename')}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(p.commitment)}</td>
                  {CATEGORIES.map(category => {
                    const term = termFor(p, category)
                    const on = term ? term.participates : true
                    return (
                      <td key={category} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={busy}
                          onChange={e => toggle(p, category, e.target.checked)}
                          aria-label={t('bearsCategory', { partner: p.name, category: t(`categories.${category}`) })}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-semibold">
                <td className="px-3 py-2">{t('total')}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(totalCommitment)}</td>
                {CATEGORIES.map(category => <td key={category} />)}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 3. Commitment history --------------------------------------------- */}
      <div>
        <button
          type="button"
          onClick={() => setShowHistory(v => !v)}
          className="text-xs text-primary hover:underline"
        >
          {t(showHistory ? 'history.hide' : 'history.show')}
        </button>

        {showHistory && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground mb-2">
              {t('history.description')}
            </p>

            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('history.empty')}</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 font-medium">{t('history.effective')}</th>
                      <th className="text-left px-3 py-2 font-medium">{t('partner')}</th>
                      <th className="text-left px-3 py-2 font-medium">{t('history.kind')}</th>
                      <th className="text-right px-3 py-2 font-medium">{t('history.change')}</th>
                      <th className="text-right px-3 py-2 font-medium">{t('history.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map(e => {
                      const isXfer = e.kind.startsWith('transfer')
                      return (
                        <tr key={e.id} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-mono text-xs">{formatDate(e.effectiveDate, locale)}</td>
                          <td className="px-3 py-2">{e.name}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{e.kind.replace('_', ' ')}</td>
                          <td className={`px-3 py-2 text-right font-mono ${e.amount < 0 ? 'text-muted-foreground' : ''}`}>{fmt(e.amount)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                disabled={busy || isXfer}
                                title={t(isXfer ? 'history.transferEditHelp' : 'history.edit')}
                                onClick={() => startEdit(e)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                disabled={busy}
                                title={t('history.delete')}
                                onClick={() => deleteEvent(e.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {renaming && (
        <RenameInvestorDialog
          target={renaming}
          onClose={() => setRenaming(null)}
          onSaved={() => { setRenaming(null); load() }}
        />
      )}
    </div>
  )
}
