'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLedgerFetch, useFundSeg } from '@/components/accounting-vehicle'

/** Vehicle-scoped onboarding: seed chart, choose full-history or cutover, reconcile. */
export function AccountingSetup({ alwaysShow = false }: { alwaysShow?: boolean } = {}) {
  const t = useTranslations('Funds.setup')
  const [accountCount, setAccountCount] = useState<number | null>(null)
  const [onboarded, setOnboarded] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState<string | null>(null)
  // Persisted per vehicle — this used to be local state, so the choice was lost on
  // every refresh and nothing downstream (like opening balances) could act on it.
  const [path, setPath] = useState<'full_history' | 'cutover' | null>(null)
  const [cutoverDate, setCutoverDate] = useState('')
  const [bootstrapping, setBootstrapping] = useState(false)
  const [bootstrapMsg, setBootstrapMsg] = useState<string | null>(null)
  // Attribute pooled LP capital (3100) onto per-LP accounts — preview then apply.
  const [attrPreview, setAttrPreview] = useState<{
    empty?: boolean; movable?: number; accountsToCreate?: number; closedSkipped?: number; untagged?: number
  } | null>(null)
  const [attrLoading, setAttrLoading] = useState(false)
  const [attrApplying, setAttrApplying] = useState(false)
  const [attrMsg, setAttrMsg] = useState<string | null>(null)
  const [attrError, setAttrError] = useState<string | null>(null)
  // A vehicle could finish every step here and still carry no investments — the tracker
  // knew about them and the ledger didn't. That's a setup step, so it belongs on this card.
  const [inv, setInv] = useState<{ booked: boolean; positions: number } | null>(null)
  const lf = useLedgerFetch()
  const fundSeg = useFundSeg()
  const fundHref = (sub: string) => fundSeg ? `/funds/${fundSeg}/${sub}` : '/funds'

  const refresh = useCallback(async () => {
    const [chart, status] = await Promise.all([
      lf('/api/accounting/chart').then(r => (r.ok ? r.json() : [])),
      lf('/api/accounting/status').then(r => (r.ok ? r.json() : null)),
    ])
    setAccountCount(Array.isArray(chart) ? chart.length : 0)
    setPath(status?.setup?.historyMode ?? null)
    setOnboarded(!!status?.onboarded)
    setInv(status
      ? { booked: !!status.setup?.investmentsBooked, positions: status.investments?.trackerPositions ?? 0 }
      : null)
  }, [lf])

  useEffect(() => { refresh() }, [refresh])

  async function choosePath(mode: 'full_history' | 'cutover') {
    setPath(mode)
    await lf('/api/accounting/allocation-terms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'historyMode', historyMode: mode }),
    })
  }

  async function seed() {
    setSeeding(true); setSeedMsg(null)
    const res = await lf('/api/accounting/chart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const data = await res.json().catch(() => ({}))
    // Say WHAT it did. A sync that silently reports nothing leaves you unable to tell "already
    // up to date" from "it didn't run" — and the accruals depend on specific accounts existing.
    setSeedMsg(
      res.ok
        ? (data.seeded > 0
            ? t('seed.added', { count: data.seeded, accounts: (data.accounts ?? []).map((a: any) => a.code).join(', ') })
            : t('seed.current'))
        : (data.error ?? t('seed.failed'))
    )
    await refresh()
    setSeeding(false)
  }

  async function previewAttribution() {
    setAttrLoading(true); setAttrError(null); setAttrMsg(null)
    try {
      const res = await lf('/api/accounting/attribute-lp-capital', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAttrError(data.error ?? t('attribution.previewFailed')); setAttrPreview(null); return }
      setAttrPreview(data)
    } catch (e: any) {
      setAttrError(e?.message ?? t('attribution.previewFailed'))
    } finally {
      setAttrLoading(false)
    }
  }

  async function applyAttribution() {
    if (!window.confirm(t('attribution.confirm'))) return
    setAttrApplying(true); setAttrError(null)
    try {
      const res = await lf('/api/accounting/attribute-lp-capital', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAttrError(data.error ?? t('attribution.applyFailed')); return }
      setAttrMsg(t('attribution.applied', { accounts: data.accountsCreated, postings: data.moved, manual: data.untagged ?? 0 }))
      setAttrPreview(null)
      await refresh()
    } catch (e: any) {
      setAttrError(e?.message ?? t('attribution.applyFailed'))
    } finally {
      setAttrApplying(false)
    }
  }

  async function bootstrap() {
    if (!cutoverDate) return
    setBootstrapping(true); setBootstrapMsg(null)
    const res = await lf('/api/accounting/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entryDate: cutoverDate }) })
    const data = await res.json()
    setBootstrapMsg(res.ok ? t('cutover.booked', { count: data.lpCount }) : (data.error ?? t('failed')))
    setBootstrapping(false)
  }

  if (accountCount === null) return null

  // Once the vehicle is onboarded this card has nothing left to say — the Status page
  // takes over. `alwaysShow` keeps it rendered on Status itself, where it IS the
  // remaining-setup surface.
  if (!alwaysShow && onboarded) return null

  return (
    <div className="border rounded-lg p-4 mb-6 bg-muted/20 space-y-3">
      <p className="text-sm font-medium">{t('title')}</p>

      {/* Step 1 — chart */}
      <div className="flex items-center gap-2 text-sm">
        {accountCount > 0
          ? <><Check className="h-4 w-4 text-green-600" /> <span className="text-muted-foreground">{t('seed.done', { count: accountCount })}</span>
              <button onClick={seed} disabled={seeding} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">{t(seeding ? 'seed.syncing' : 'seed.sync')}</button></>
          : <><span className="text-muted-foreground">{t('seed.step')}</span><Button size="sm" variant="outline" onClick={seed} disabled={seeding}>{seeding && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}{t('seed.button')}</Button></>}
      </div>
      {seedMsg && <p className="text-xs text-muted-foreground pl-6">{seedMsg}</p>}

      {/* Attribute pooled LP capital (3100) onto per-LP accounts — optional, preview then apply. */}
      <div className="text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('attribution.title')}</span>
          <Button size="sm" variant="outline" onClick={previewAttribution} disabled={attrLoading || attrApplying}>
            {attrLoading && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}{t('attribution.preview')}
          </Button>
        </div>
        {attrError && <p className="text-xs text-destructive mt-1">{attrError}</p>}
        {attrPreview && (
          <div className="mt-1.5 space-y-1">
            {attrPreview.empty ? (
              <p className="text-xs text-muted-foreground">{t('attribution.empty')}</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {t('attribution.summary', { accounts: attrPreview.accountsToCreate ?? 0, postings: attrPreview.movable ?? 0 })}
                </p>
                {!!attrPreview.untagged && attrPreview.untagged > 0 && (
                  <p className="text-xs text-muted-foreground">{t('attribution.untagged', { count: attrPreview.untagged })}</p>
                )}
                {!!attrPreview.closedSkipped && attrPreview.closedSkipped > 0 && (
                  <p className="text-xs text-muted-foreground">{t('attribution.skipped', { count: attrPreview.closedSkipped })}</p>
                )}
                <Button size="sm" onClick={applyAttribution} disabled={attrApplying}>
                  {attrApplying && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}{t('attribution.apply')}
                </Button>
              </>
            )}
          </div>
        )}
        {attrMsg && <p className="text-xs text-muted-foreground mt-1">{attrMsg}</p>}
      </div>

      {/* Step 2 — choose path */}
      <div className="text-sm">
        <p className="text-muted-foreground mb-1.5">{t('path.title')}</p>
        <div className="flex flex-wrap gap-1.5">
          {(['full_history', 'cutover'] as const).map(p => (
            <button key={p} onClick={() => choosePath(p)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${path === p ? 'border-foreground/30 bg-accent font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {t(p === 'full_history' ? 'path.fullHistory' : 'path.cutover')}
            </button>
          ))}
        </div>
      </div>

      {/* Full history: opening balances are DERIVED from the reconstructed ledger.
          Entering them would double-count the fund's entire contributed capital, so
          the step isn't offered at all. */}
      {path === 'full_history' && (
        <>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal ml-4">
            <li>{t.rich('fullHistory.bank', { link: chunks => <Link href={fundHref('bank')} className="underline underline-offset-2 hover:text-foreground">{chunks}</Link> })}</li>
            <li>{t('fullHistory.categorize')}</li>
            <li>{t.rich('fullHistory.investments', { link: chunks => <Link href={fundHref('schedule-of-investments')} className="underline underline-offset-2 hover:text-foreground">{chunks}</Link> })}</li>
            <li>{t.rich('fullHistory.close', { terms: chunks => <Link href={fundHref('status')} className="underline underline-offset-2 hover:text-foreground">{chunks}</Link>, close: chunks => <Link href={fundHref('periods')} className="underline underline-offset-2 hover:text-foreground">{chunks}</Link> })}</li>
            <li>{t('fullHistory.reconcile')}</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            {t('fullHistory.noOpening')}
          </p>
        </>
      )}

      {path === 'cutover' && (
        <div className="text-sm space-y-2">
          <p className="text-muted-foreground">{t('cutover.description')}</p>
          <div className="flex items-center gap-2">
            <input type="date" value={cutoverDate} onChange={e => setCutoverDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <Button size="sm" onClick={bootstrap} disabled={bootstrapping || !cutoverDate || accountCount === 0}>{bootstrapping && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}{t('cutover.bootstrap')}</Button>
          </div>
          {bootstrapMsg && <p className="text-xs text-muted-foreground">{bootstrapMsg}</p>}
          <p className="text-xs text-muted-foreground">
            {t.rich('cutover.manual', { link: chunks => <Link href={fundHref('opening-balances')} className="underline underline-offset-2 hover:text-foreground">{chunks}</Link> })}
          </p>
        </div>
      )}

      {/* Step 3 — investments. Neither path put them on the ledger: the bank import
          brings in cash, the cutover bootstrap brings in capital, and the investments
          themselves are nobody's job. A vehicle can otherwise finish setup with a
          balance sheet holding no investments at all, which is simply wrong. */}
      {path && inv && inv.positions > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm border-t pt-3">
          {inv.booked ? (
            <>
              <Check className="h-4 w-4 text-green-600 shrink-0" />
              <span className="text-muted-foreground">
                {t('investments.done', { count: inv.positions })}
              </span>
              <Link href={fundHref('schedule-of-investments')} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                {t('investments.schedule')}
              </Link>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">
                {t(path === 'full_history' ? 'investments.fullHistory' : 'investments.cutover', { count: inv.positions })}
              </span>
              <Button size="sm" variant="outline" asChild>
                <Link href={fundHref('schedule-of-investments')}>
                  {t(path === 'full_history' ? 'investments.replay' : 'investments.book')}
                </Link>
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
