'use client'

// Journal entries the Analyst drafted, rendered as reviewable cards. Nothing here posts to the
// books: Apply saves a DRAFT entry the user reviews and posts from the Journal. The apply call
// goes to /api/accounting/assistant, which is admin-gated — the Analyst route never applies.

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCurrency, formatCurrencyPrice } from '@/components/currency-context'

export interface ProposalPosting { accountCode: string; amount: number; lpEntity?: string | null }
export interface Proposal {
  type: 'create' | 'edit'
  entryId?: string | null
  entryDate: string
  memo: string
  sourceType?: string | null
  postings: ProposalPosting[]
  rationale: string
}

const balanced = (p: Proposal) => Math.abs(p.postings.reduce((s, x) => s + Number(x.amount), 0)) < 0.005

export function AnalystProposals({ proposals, vehicle }: { proposals: Proposal[]; vehicle: string | null }) {
  const t = useTranslations('Analyst')
  const locale = useLocale()
  const currency = useCurrency()
  const fmt = (v: number) => formatCurrencyPrice(v, currency, locale)
  const [applied, setApplied] = useState<Record<number, string>>({})
  const [error, setError] = useState<'apply' | 'network' | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  async function apply(p: Proposal, idx: number) {
    setBusy(idx); setError(null)
    try {
      const res = await fetch('/api/accounting/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', proposal: p, group: vehicle }),
      })
      const data = await res.json()
      if (!res.ok) { setError('apply'); return }
      setApplied(a => ({ ...a, [idx]: data.entryId }))
    } catch {
      setError('network')
    } finally {
      setBusy(null)
    }
  }

  if (proposals.length === 0) return null

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{t('proposals.title')}</p>
      {proposals.map((p, i) => (
        <div key={i} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">
              {p.type === 'edit' ? t('proposals.edit') : t('proposals.new')} &middot; {p.entryDate} &middot; {p.memo}
            </p>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{p.sourceType ?? t('proposals.manual')}</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-medium py-1">{t('proposals.account')}</th>
                <th className="text-right font-medium py-1">{t('proposals.debit')}</th>
                <th className="text-right font-medium py-1">{t('proposals.credit')}</th>
              </tr>
            </thead>
            <tbody>
              {p.postings.map((x, j) => (
                <tr key={j} className="border-t">
                  <td className="py-1">
                    <span className="font-mono">{x.accountCode}</span>
                    {x.lpEntity && <span className="ml-1.5 text-muted-foreground">&middot; {x.lpEntity}</span>}
                  </td>
                  <td className="py-1 text-right font-mono">{x.amount > 0 ? fmt(x.amount) : ''}</td>
                  <td className="py-1 text-right font-mono">{x.amount < 0 ? fmt(-x.amount) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.rationale && <p className="text-[11px] text-muted-foreground">{p.rationale}</p>}
          {applied[i] ? (
            <span className="text-xs text-green-600 flex items-center gap-1"><Check className="h-3.5 w-3.5" />{t('proposals.applied')}</span>
          ) : !balanced(p) ? (
            <span className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{t('proposals.unbalanced')}</span>
          ) : (
            <Button size="sm" variant="outline" onClick={() => apply(p, i)} disabled={busy === i}>
              {busy === i ? t('proposals.applying') : t('proposals.applyAsDraft')}
            </Button>
          )}
        </div>
      ))}
      {error && (
        <p className="text-xs text-destructive">
          {error === 'network' ? t('proposals.errors.network') : t('proposals.errors.apply')}
        </p>
      )}
    </div>
  )
}
