'use client'

import React, { useEffect, useState, type ReactNode } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { MAX_NAME_LEN, MAX_PITCH_LEN, MAX_URL_LEN, safeWebUrl } from '@/lib/deals/submission-validation'

const SOURCE_OPTIONS = ['referral', 'cold', 'warm_intro', 'accelerator', 'demo_day', 'event', 'other'] as const

export interface ManualDealPrefill {
  readonly key: string
  readonly companyName?: string | null
  readonly companyUrl?: string | null
  readonly pitch?: string | null
}

export function boundedManualDealPrefill(prefill?: ManualDealPrefill | null) {
  const rawUrl = (prefill?.companyUrl ?? '').trim().slice(0, MAX_URL_LEN)
  return Object.freeze({
    companyName: (prefill?.companyName ?? '').trim().slice(0, MAX_NAME_LEN),
    companyUrl: rawUrl ? safeWebUrl(rawUrl) ?? '' : '',
    pitch: (prefill?.pitch ?? '').trim().slice(0, MAX_PITCH_LEN),
  })
}

export function ManualDealDialog({ open, onOpenChange, onCreated, prefill = null }: {
  open: boolean
  onOpenChange: (value: boolean) => void
  onCreated: (dealId: string | null) => void
  prefill?: ManualDealPrefill | null
}) {
  const t = useTranslations('Deals.newDeal')
  const labels = useTranslations('Deals.labels')
  const [companyName, setCompanyName] = useState('')
  const [companyUrl, setCompanyUrl] = useState('')
  const [founderName, setFounderName] = useState('')
  const [founderEmail, setFounderEmail] = useState('')
  const [introSource, setIntroSource] = useState('')
  const [referrerName, setReferrerName] = useState('')
  const [referrerEmail, setReferrerEmail] = useState('')
  const [pitch, setPitch] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset(nextPrefill = prefill) {
    const next = boundedManualDealPrefill(nextPrefill)
    setCompanyName(next.companyName); setCompanyUrl(next.companyUrl); setPitch(next.pitch)
    setFounderName(''); setFounderEmail(''); setIntroSource('')
    setReferrerName(''); setReferrerEmail(''); setFiles([]); setError(null)
  }

  useEffect(() => {
    if (open) reset(prefill)
    // The stable key distinguishes one source article or signal from another.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill?.key])

  const canSubmit = Boolean(companyName.trim() && founderName.trim() && founderEmail.trim() && pitch.trim()) && !submitting

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true); setError(null)
    try {
      const form = new FormData()
      form.append('company_name', companyName.trim()); form.append('founder_name', founderName.trim())
      form.append('founder_email', founderEmail.trim()); form.append('pitch', pitch.trim())
      if (companyUrl.trim()) form.append('company_url', companyUrl.trim())
      if (introSource) form.append('intro_source', introSource)
      if (referrerName.trim()) form.append('referrer_name', referrerName.trim())
      if (referrerEmail.trim()) form.append('referrer_email', referrerEmail.trim())
      for (const file of files) form.append('files', file)
      const response = await fetch('/api/deals/manual', { method: 'POST', body: form })
      const body = await response.json().catch(() => ({})) as { error?: unknown; deal_id?: unknown }
      if (!response.ok) { setError(typeof body.error === 'string' ? body.error : t('createFailed')); return }
      reset(null)
      onCreated(typeof body.deal_id === 'string' ? body.deal_id : null)
    } catch {
      setError(t('createFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) reset(null); onOpenChange(value) }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{t('title')}</DialogTitle><DialogDescription>{t('description')}</DialogDescription></DialogHeader>
        <div className="-ml-1 max-h-[60vh] space-y-3 overflow-y-auto pl-1 pr-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={`${t('companyName')} *`}><Input value={companyName} maxLength={MAX_NAME_LEN} onChange={event => setCompanyName(event.target.value)} /></Field>
            <Field label={t('companyUrl')}><Input value={companyUrl} maxLength={MAX_URL_LEN} onChange={event => setCompanyUrl(event.target.value)} placeholder="https://…" /></Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={`${t('founderName')} *`}><Input value={founderName} maxLength={MAX_NAME_LEN} onChange={event => setFounderName(event.target.value)} /></Field>
            <Field label={`${t('founderEmail')} *`}><Input type="email" value={founderEmail} onChange={event => setFounderEmail(event.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('introSource')}>
              <select value={introSource} onChange={event => setIntroSource(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{t('none')}</option>
                {SOURCE_OPTIONS.map(option => <option key={option} value={option}>{labels(labelKey(option))}</option>)}
              </select>
            </Field>
            <Field label={t('referrerName')}><Input value={referrerName} maxLength={MAX_NAME_LEN} onChange={event => setReferrerName(event.target.value)} /></Field>
          </div>
          <Field label={t('referrerEmail')}><Input type="email" value={referrerEmail} onChange={event => setReferrerEmail(event.target.value)} /></Field>
          <Field label={`${t('pitch')} *`}><textarea value={pitch} maxLength={MAX_PITCH_LEN} onChange={event => setPitch(event.target.value)} rows={6} placeholder={t('pitchPlaceholder')} className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" /></Field>
          <Field label={t('attachmentsOptional')}>
            <label className={`inline-flex cursor-pointer items-center gap-1 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted/50 ${submitting ? 'pointer-events-none opacity-50' : ''}`}>
              <Plus className="h-3.5 w-3.5" />{files.length ? t('filesSelected', { count: files.length }) : t('chooseFiles')}
              <input type="file" multiple className="hidden" disabled={submitting} onChange={event => setFiles(event.target.files ? Array.from(event.target.files) : [])} />
            </label>
            {files.length > 0 && <ul className="mt-2 max-h-20 space-y-0.5 overflow-y-auto text-[11px] text-muted-foreground">{files.map(file => <li key={`${file.name}:${file.size}`} className="truncate">{file.name}</li>)}</ul>}
            <p className="mt-1 text-[11px] text-muted-foreground">{t('attachmentHelp')}</p>
          </Field>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>{t('cancel')}</Button>
          <Button variant="outline" onClick={submit} disabled={!canSubmit}>{submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{t('create')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-medium text-muted-foreground"><span className="mb-1 block">{label}</span>{children}</label>
}

function labelKey(value: (typeof SOURCE_OPTIONS)[number]): 'referral' | 'cold' | 'warmIntro' | 'accelerator' | 'demoDay' | 'event' | 'other' {
  if (value === 'warm_intro') return 'warmIntro'
  if (value === 'demo_day') return 'demoDay'
  return value
}
