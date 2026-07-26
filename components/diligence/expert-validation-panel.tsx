'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw, Search, Send, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ResearchOutput } from '@/lib/memo-agent/stages/research'
import type { ExpertDirectoryEntry, ExpertMatch, ExpertValidationRequest } from '@/lib/expert-validation/types'
import { useFormatter, useTranslations } from 'next-intl'

type Source = { kind: 'research_gap' | 'contradiction'; index: number; title: string; detail: string }

export function ExpertValidationPanel({
  dealId,
  draftId,
  research,
  editable,
}: {
  dealId: string
  draftId?: string
  research: ResearchOutput | null
  editable: boolean
}) {
  const t = useTranslations('Diligence.expertValidation')
  const expertT = useTranslations('ExpertDirectory')
  const format = useFormatter()
  const [requests, setRequests] = useState<ExpertValidationRequest[]>([])
  const [source, setSource] = useState<Source | null>(null)
  const [form, setForm] = useState({ question: '', expertProfile: '', contextSnapshot: '' })
  const [active, setActive] = useState<ExpertValidationRequest | null>(null)
  const [experts, setExperts] = useState<ExpertDirectoryEntry[]>([])
  const [matches, setMatches] = useState<ExpertMatch[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null)

  const sources = useMemo<Source[]>(() => [
    ...(research?.contradictions ?? []).map((item, index) => ({
      kind: 'contradiction' as const,
      index,
      title: item.topic,
      detail: item.description,
      dismissed: item.dismissed,
    })).filter(item => !item.dismissed),
    ...(research?.research_gaps ?? []).map((item, index) => ({
      kind: 'research_gap' as const,
      index,
      title: item.topic,
      detail: item.rationale,
      dismissed: item.dismissed,
    })).filter(item => !item.dismissed),
  ], [research])

  async function loadRequests() {
    const response = await fetch(`/api/diligence/${dealId}/expert-validations`, { cache: 'no-store' })
    if (!response.ok) return
    const body = await response.json()
    setRequests(body.requests ?? [])
  }

  async function loadExperts(query = search) {
    const response = await fetch(`/api/experts?q=${encodeURIComponent(query)}`, { cache: 'no-store' })
    if (!response.ok) return
    const body = await response.json()
    setExperts(body.experts ?? [])
  }

  useEffect(() => { void loadRequests() }, [dealId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function start(item: Source) {
    if (!draftId) return
    setSource(item)
    setActive(null)
    setMatches([])
    setInvitationUrl(null)
    setForm({ question: '', expertProfile: '', contextSnapshot: '' })
    setBusy('generate')
    setMessage(null)
    try {
      const response = await fetch(`/api/diligence/${dealId}/expert-validations/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_ref: { draftId, kind: item.kind, index: item.index } }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? t('errors.generate'))
      setForm(body.generated)
    } catch {
      setMessage(t('errors.generationUnavailable'))
    } finally { setBusy(null) }
  }

  async function createRequest() {
    if (!draftId || !source) return
    setBusy('create'); setMessage(null)
    try {
      const response = await fetch(`/api/diligence/${dealId}/expert-validations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_ref: { draftId, kind: source.kind, index: source.index },
          question: form.question,
          expert_profile: form.expertProfile,
          context_snapshot: form.contextSnapshot,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? t('errors.create'))
      setActive(body.request)
      setRequests(previous => [body.request, ...previous])
      await loadExperts('')
    } catch (error) { setMessage(error instanceof Error ? error.message : t('errors.create')) }
    finally { setBusy(null) }
  }

  async function autoMatch() {
    if (!active) return
    setBusy('match'); setMessage(null)
    try {
      const response = await fetch(`/api/diligence/${dealId}/expert-validations/${active.id}/match`, { method: 'POST' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? t('errors.autoMatch'))
      setMatches(body.matches ?? [])
      if ((body.matches ?? []).length === 0) setMessage(t('errors.noMatches'))
    } catch { setMessage(t('errors.autoMatchUnavailable')) }
    finally { setBusy(null) }
  }

  async function choose(expertId: string, method: 'manual' | 'auto_match') {
    if (!active) return
    setBusy(`select:${expertId}`); setMessage(null)
    try {
      const response = await fetch(`/api/diligence/${dealId}/expert-validations/${active.id}/select`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expert_id: expertId, selection_method: method }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? t('errors.select'))
      setActive(body.request)
      setRequests(previous => previous.map(item => item.id === body.request.id ? body.request : item))
    } catch (error) { setMessage(error instanceof Error ? error.message : t('errors.select')) }
    finally { setBusy(null) }
  }

  async function invite(reissue = false) {
    if (!active) return
    setBusy('invite'); setMessage(null)
    try {
      const response = await fetch(`/api/diligence/${dealId}/expert-validations/${active.id}/invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reissue }),
      })
      const body = await response.json()
      if (!response.ok && response.status !== 202) throw new Error(body.error ?? t('errors.invite'))
      setActive(body.request)
      setRequests(previous => previous.map(item => item.id === body.request.id ? body.request : item))
      setInvitationUrl(body.invitation_url)
      setMessage(body.warning ?? t('invitationIssued'))
    } catch (error) { setMessage(error instanceof Error ? error.message : t('errors.invite')) }
    finally { setBusy(null) }
  }

  async function retryEvidence(request: ExpertValidationRequest) {
    setBusy(`retry:${request.id}`); setMessage(null)
    try {
      const response = await fetch(`/api/diligence/${dealId}/expert-validations/${request.id}/retry-materialization`, { method: 'POST' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? t('errors.retry'))
      setMessage(body.materialization.enqueued ? t('evidence.queued') : t('evidence.readyOrPending', { reason: body.materialization.reason ?? t('evidence.noNewJob') }))
      await loadRequests()
    } catch (error) { setMessage(error instanceof Error ? error.message : t('errors.retry')) }
    finally { setBusy(null) }
  }

  return <div className="space-y-4">
    {message && <p className="text-xs rounded-md bg-muted px-3 py-2">{message}</p>}
    {!source && !active && <div className="divide-y">
      {sources.length === 0 && <p className="text-xs text-muted-foreground italic">{t('emptySources')}</p>}
      {sources.map(item => <div key={`${item.kind}-${item.index}`} className="py-3 flex items-start gap-3 text-sm">
        <div className="flex-1 min-w-0"><div className="font-medium">{item.title}</div><div className="text-xs text-muted-foreground mt-0.5">{item.detail}</div></div>
        {editable && <Button size="sm" variant="outline" onClick={() => start(item)}>{t('validate')}</Button>}
      </div>)}
    </div>}

    {source && !active && <div className="space-y-3">
      <div className="text-sm font-medium">{t('prepare', { title: source.title })}</div>
      {busy === 'generate' && <p className="text-xs text-muted-foreground"><Loader2 className="inline h-3.5 w-3.5 animate-spin mr-1" />{t('generating')}</p>}
      <Field label={t('fields.question')} value={form.question} onChange={question => setForm(current => ({ ...current, question }))} maxLength={4000} />
      <Field label={t('fields.profile')} value={form.expertProfile} onChange={expertProfile => setForm(current => ({ ...current, expertProfile }))} maxLength={6000} />
      <Field label={t('fields.context')} value={form.contextSnapshot} onChange={contextSnapshot => setForm(current => ({ ...current, contextSnapshot }))} maxLength={12000} rows={5} />
      <div className="flex gap-2"><Button onClick={createRequest} disabled={Boolean(busy)}>{t('confirmRequest')}</Button><Button variant="ghost" onClick={() => setSource(null)}>{t('cancel')}</Button></div>
    </div>}

    {active?.status === 'draft' && <div className="space-y-4">
      <div><div className="text-sm font-medium">{t('choose.title')}</div><div className="text-xs text-muted-foreground">{t('choose.description')}</div></div>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-52"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} className="pl-8" placeholder={t('choose.searchPlaceholder')} /></div>
        <Button variant="outline" onClick={() => loadExperts()}><Search className="h-4 w-4 mr-1" />{t('choose.search')}</Button>
        <Button variant="outline" onClick={autoMatch} disabled={busy === 'match'}>{busy === 'match' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}{t('choose.autoMatch')}</Button>
        <Button variant="ghost" asChild><Link href="/experts"><Users className="h-4 w-4 mr-1" />{t('choose.addExpert')}</Link></Button>
      </div>
      {(matches.length > 0 ? matches : experts).map(expert => <div key={expert.id} className="flex items-start gap-3 border-t pt-3 text-sm">
        <div className="flex-1"><div className="flex items-center gap-2"><div className="font-medium">{expert.name}</div><Badge variant="secondary" className="text-[10px]">{expert.verificationType === 'platform_certified' ? expertT('badges.platform') : expert.sourceType === 'discovery' ? expertT('badges.fundDiscovery') : expertT('badges.fundManual')}</Badge></div><div className="text-xs text-muted-foreground">{[expert.title, expert.organization].filter(Boolean).join(' · ')}</div><div className="text-xs mt-1">{expert.profileText}</div>{'similarity' in expert && <div className="text-[11px] text-muted-foreground mt-1">{t('choose.similarity', { value: format.number((expert as ExpertMatch).similarity, { style: 'percent', maximumFractionDigits: 0 }) })}</div>}</div>
        <Button size="sm" variant={active.expertId === expert.id ? 'default' : 'outline'} onClick={() => choose(expert.id, 'similarity' in expert ? 'auto_match' : 'manual')} disabled={busy === `select:${expert.id}`}>{active.expertId === expert.id ? t('choose.selected') : t('choose.select')}</Button>
      </div>)}
      {active.expertId && <Button onClick={() => invite(false)} disabled={busy === 'invite'}><Send className="h-4 w-4 mr-1" />{t('sendInvitation')}</Button>}
    </div>}

    {active && active.status !== 'draft' && <div className="space-y-2 text-sm"><div><strong>{t('status')}:</strong> {t(`statuses.${active.status}`)}</div><div><strong>{t('expert')}:</strong> {active.expertSnapshot?.name}</div>{invitationUrl && <div className="flex gap-2"><Input readOnly value={invitationUrl} /><Button variant="outline" onClick={() => navigator.clipboard.writeText(invitationUrl)}>{t('copyLink')}</Button></div>}{active.status === 'invited' && <Button variant="outline" onClick={() => invite(true)}>{t('reissue')}</Button>}</div>}

    {requests.length > 0 && <div className="border-t pt-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">{t('requests')}</div><div className="divide-y">{requests.map(request => <div key={request.id} className="w-full py-2 flex gap-3 text-xs hover:bg-muted/40"><button type="button" onClick={() => { setActive(request); setSource(null); setInvitationUrl(null); if (request.status === 'draft') void loadExperts('') }} className="flex flex-1 gap-3 text-left min-w-0"><span className="w-20 font-medium">{t(`statuses.${request.status}`)}</span><span className="flex-1 truncate">{request.question}</span><span className="text-muted-foreground">{request.expertSnapshot?.name ?? t('noExpert')}</span>{request.evidenceStatus && <span className="text-muted-foreground">{t('evidence.status', { status: request.evidenceStatus })}</span>}</button>{request.status === 'submitted' && (!request.documentId || request.materializationError) && <button type="button" onClick={() => void retryEvidence(request)} className="text-amber-700">{t('evidence.retry')}</button>}</div>)}</div></div>}
  </div>
}

function Field({ label, value, onChange, maxLength, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; maxLength: number; rows?: number }) {
  return <label className="block text-xs font-medium space-y-1"><span>{label}</span><textarea value={value} onChange={event => onChange(event.target.value)} maxLength={maxLength} rows={rows} className="w-full rounded-md border bg-background px-3 py-2 text-sm font-normal" /></label>
}
