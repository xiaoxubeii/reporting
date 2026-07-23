'use client'

// Writes the Analyst DRAFTED, rendered as reviewable cards. Nothing here has taken effect: each is
// a staged pending_action. Approve runs the real write (the same path the direct API uses); Reject
// discards it. Both endpoints re-check the caller's WRITE access for the action's domain.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface PreviewResult {
  summary: string
  details: Record<string, unknown>
}
export interface StagedAction {
  id: string
  actionType: string
  preview: PreviewResult
}

type CardState = 'idle' | 'busy' | 'applied' | 'rejected' | 'error'
type ActionError = 'approve' | 'reject' | 'network'

export function AnalystPendingActions({ actions }: { actions: StagedAction[] }) {
  const t = useTranslations('Analyst')
  const [state, setState] = useState<Record<string, CardState>>({})
  const [errors, setErrors] = useState<Record<string, ActionError | null>>({})

  async function act(a: StagedAction, kind: 'approve' | 'reject') {
    setState(s => ({ ...s, [a.id]: 'busy' }))
    setErrors(e => ({ ...e, [a.id]: null }))
    try {
      const res = await fetch(`/api/pending-actions/${a.id}/${kind}`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        setState(s => ({ ...s, [a.id]: 'error' }))
        setErrors(e => ({ ...e, [a.id]: kind }))
        return
      }
      setState(s => ({ ...s, [a.id]: kind === 'approve' ? 'applied' : 'rejected' }))
    } catch {
      setState(s => ({ ...s, [a.id]: 'error' }))
      setErrors(e => ({ ...e, [a.id]: 'network' }))
    }
  }

  if (actions.length === 0) return null

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{t('pendingActions.title')}</p>
      {actions.map(a => {
        const st = state[a.id] ?? 'idle'
        return (
          <div key={a.id} className="border rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium">{a.preview.summary}</p>
            <PreviewDetails details={a.preview.details} />
            {st === 'applied' ? (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <Check className="h-3.5 w-3.5" />{t('pendingActions.applied')}
              </span>
            ) : st === 'rejected' ? (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <X className="h-3.5 w-3.5" />{t('pendingActions.rejected')}
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => act(a, 'approve')} disabled={st === 'busy'}>
                  {st === 'busy' ? t('pendingActions.working') : t('pendingActions.approve')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act(a, 'reject')} disabled={st === 'busy'}>
                  {t('pendingActions.reject')}
                </Button>
              </div>
            )}
            {st === 'error' && errors[a.id] && (
              <p className="text-xs text-destructive">
                {errors[a.id] === 'network'
                  ? t('pendingActions.errors.network')
                  : errors[a.id] === 'reject'
                    ? t('pendingActions.errors.reject')
                    : t('pendingActions.errors.approve')}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Render a preview's structured details: per-LP tables get a small table, everything else a list. */
function PreviewDetails({ details }: { details: Record<string, unknown> }) {
  const t = useTranslations('Analyst')
  const perLp = details.perLp as Array<{ lp: string; commitment?: number; amount: number }> | undefined
  const scalars = Object.entries(details).filter(([k]) => k !== 'perLp')

  return (
    <div className="space-y-1.5">
      {scalars.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
          {scalars.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-mono">{formatVal(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {perLp && perLp.length > 0 && (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-medium py-0.5">LP</th>
              <th className="text-right font-medium py-0.5">{t('pendingActions.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {perLp.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="py-0.5">{r.lp}</td>
                <td className="py-0.5 text-right font-mono">{formatVal(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function formatVal(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'number') return v.toLocaleString()
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
