'use client'

// A vehicle's carry terms — what the close accrues carried interest on.
//
// Rates are entered as PERCENTAGES here and stored as fractions. Nobody thinks in 0.2; they
// think in 20%. The conversion happens at this boundary and nowhere else.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, Check, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLedgerFetch } from '@/components/accounting-vehicle'

type Kind = 'none' | 'straight' | 'american' | 'european'

interface Candidate { lpEntityId: string; name: string; partnerClass: string }
interface Recipient { lpEntityId: string; pct: number }

interface Terms {
  kind: Kind
  carryRate: number
  prefRate: number
  catchupRate: number
  prefCompounds: boolean
  recipients: Recipient[]
}

// Percent <-> fraction at the UI boundary. 0 renders as '0' (a real, editable value) rather than
// blank — a blank field reads as "unset", and for a rate that is a meaningful, different claim.
const pct = (fraction: number) => String(Math.round((fraction || 0) * 10000) / 100)
const frac = (percent: string) => {
  if (percent.trim() === '') return 0
  const n = Number(percent)
  return Number.isFinite(n) ? n / 100 : 0
}

export function CarryTerms() {
  const t = useTranslations('Funds.carryTerms')
  const locale = useLocale()
  const lf = useLedgerFetch()

  const [kind, setKind] = useState<Kind>('none')
  const [carry, setCarry] = useState('')
  // Defaults: no preferred return, no GP catch-up, simple (non-compounding) pref. Funds add these
  // deliberately; starting them at zero means a saved term only carries what was actually entered.
  const [pref, setPref] = useState('0')
  const [catchup, setCatchup] = useState('0')
  const [compounds, setCompounds] = useState(false)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [vehicleName, setVehicleName] = useState('')

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const applyTerms = useCallback((d: any) => {
    const t: Terms = d.terms
    setKind(t.kind)
    setCarry(t.carryRate ? pct(t.carryRate) : '')
    setPref(pct(t.prefRate))
    setCatchup(pct(t.catchupRate))
    setCompounds(t.prefCompounds)
    setRecipients(t.recipients ?? [])
    setCandidates(d.candidates ?? [])
    setVehicleName(d.group ?? '')
  }, [])

  const load = useCallback(async () => {
    const res = await lf('/api/accounting/waterfall-terms')
    if (res.ok) applyTerms(await res.json())
    setLoading(false)
  }, [lf, applyTerms])

  // Load once per vehicle. A ref guards against the fetch re-firing (e.g. when the vehicle context
  // hydrates) and OVERWRITING what the user has typed but not yet saved — the bug that made carry
  // silently save as 0. A genuine vehicle switch changes `lf` and re-arms the guard below.
  const loadedForLf = useRef<unknown>(null)
  useEffect(() => {
    if (loadedForLf.current === lf) return
    loadedForLf.current = lf
    void load()
  }, [lf, load])

  const save = async () => {
    setBusy(true); setError(null); setSaved(false)
    const res = await lf('/api/accounting/waterfall-terms', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        carryRate: frac(carry),
        prefRate: frac(pref),
        catchupRate: frac(catchup),
        prefCompounds: compounds,
        carryRecipients: recipients,
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setBusy(false); setError(d.error ?? t('saveError')); return }
    // Reload from the server so the form shows exactly what PERSISTED — no more "save, navigate
    // away, and the old value reappears". If a field didn't take, you see it immediately.
    const reread = await lf('/api/accounting/waterfall-terms')
    if (reread.ok) applyTerms(await reread.json())
    setBusy(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />{t('loading')}
    </div>
  }

  const carryOn = kind !== 'none'
  const hasHurdle = kind === 'european' // pref + catch-up only apply to the whole-fund waterfall
  const carryMissing = carryOn && frac(carry) <= 0

  const totalPct = recipients.reduce((sum, r) => sum + (r.pct || 0), 0)
  const recipientsInvalid = carryOn && !carryMissing && (recipients.length === 0 || Math.abs(totalPct - 100) > 0.01)

  const toggleRecipient = (lpEntityId: string) => {
    setRecipients(prev => {
      const exists = prev.some(r => r.lpEntityId === lpEntityId)
      const ids = exists
        ? prev.filter(r => r.lpEntityId !== lpEntityId).map(r => r.lpEntityId)
        : [...prev.map(r => r.lpEntityId), lpEntityId]
      // Even split that always totals 100 (last absorbs the remainder); fine-tune per row after.
      const n = ids.length
      const each = n > 0 ? Math.round(100 / n) : 0
      return ids.map((id, i) => ({ lpEntityId: id, pct: i === n - 1 ? 100 - each * (n - 1) : each }))
    })
  }

  const setRecipientPct = (lpEntityId: string, pctStr: string) => {
    const n = Number(pctStr)
    const value = pctStr.trim() === '' ? 0 : (Number.isFinite(n) ? n : 0)
    setRecipients(prev => prev.map(r => r.lpEntityId === lpEntityId ? { ...r, pct: value } : r))
  }

  return (
    <div className="space-y-3">
      {vehicleName && <p className="text-xs text-muted-foreground">{vehicleName}</p>}
      <p className="text-xs text-muted-foreground max-w-3xl">
        {t.rich('description', { strong: chunks => <strong>{chunks}</strong> })}
      </p>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {([
          'none', 'straight', 'american', 'european',
        ] as Kind[]).map(k => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
              kind === k ? 'border-foreground/30 bg-accent font-medium' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(`kinds.${k}`)}
          </button>
        ))}
      </div>

      {kind === 'none' && (
        <p className="text-xs text-muted-foreground">
          {t('noneHelp')}
        </p>
      )}

      {kind === 'american' && (
        <p className="text-xs text-muted-foreground max-w-3xl">
          {t.rich('americanHelp', { strong: chunks => <strong>{chunks}</strong>, em: chunks => <em>{chunks}</em> })}
        </p>
      )}

      {carryOn && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label={t('fields.carry')} hint={t('fields.carryHint')}>
              <Suffix suffix="%">
                <Input value={carry} onChange={e => setCarry(e.target.value)} placeholder={t('fields.carryPlaceholder')} />
              </Suffix>
            </Field>

            {hasHurdle && (
              <>
                <Field label={t('fields.pref')} hint={t('fields.prefHint')}>
                  <Suffix suffix="%">
                    <Input value={pref} onChange={e => setPref(e.target.value)} />
                  </Suffix>
                </Field>
                <Field label={t('fields.catchup')} hint={t('fields.catchupHint')}>
                  <Suffix suffix="%">
                    <Input value={catchup} onChange={e => setCatchup(e.target.value)} />
                  </Suffix>
                </Field>
              </>
            )}

          </div>

          <Field label={t('fields.recipients')} hint={t('fields.recipientsHint')}>
            <div className="space-y-1.5">
              {candidates.map(c => {
                const r = recipients.find(x => x.lpEntityId === c.lpEntityId)
                const checked = !!r
                return (
                  <div key={c.lpEntityId} className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm flex-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRecipient(c.lpEntityId)}
                      />
                      {c.name}{c.partnerClass === 'gp' ? ` (${t('gp')})` : ''}
                    </label>
                    {checked && (
                      <div className="w-20">
                        <Suffix suffix="%">
                          <Input
                            value={String(r.pct)}
                            onChange={e => setRecipientPct(c.lpEntityId, e.target.value)}
                            className="h-8 text-sm"
                          />
                        </Suffix>
                      </div>
                    )}
                  </div>
                )
              })}
              <p className={`text-xs ${Math.abs(totalPct - 100) > 0.01 && recipients.length > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {t('total', { value: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(totalPct) })}
              </p>
            </div>
          </Field>

          {hasHurdle && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={compounds} onChange={e => setCompounds(e.target.checked)} />
              {t('compounds')}
            </label>
          )}

          {/* Carry of 0% accrues nothing — the single most common reason "carry isn't showing up".
              Warn in place rather than silently saving a term that does nothing. */}
          {carryMissing && (
            <p className="text-xs text-amber-600 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('carryMissing')}
            </p>
          )}

          {/* The carry has to land in real partners' capital accounts, or it belongs to nobody
              — it never shows in any capital account, and the associates look-through can't
              split it. Say so before they hit Save and get a 400. */}
          {recipientsInvalid && (
            <p className="text-xs text-amber-600 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('recipientsInvalid')}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            {t.rich('pointsHelp', { strong: chunks => <strong>{chunks}</strong>, em: chunks => <em>{chunks}</em> })}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-amber-600">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" variant="outline" className="text-muted-foreground" onClick={save} disabled={busy || recipientsInvalid}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
          {t('save')}
        </Button>
        {saved && <span className="text-xs text-emerald-600">{t('saved')}</span>}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Suffix({ suffix, children }: { suffix: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>
    </div>
  )
}
