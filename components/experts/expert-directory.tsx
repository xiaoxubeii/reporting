'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ExpertCandidate } from '@/lib/expert-discovery/types'
import type { DiscoverySourceOutcome } from '@/lib/expert-discovery/types'
import type { ExpertDirectoryEntry } from '@/lib/expert-validation/types'
import { AnalystContextActions } from '@/components/analyst-context-actions'
import { snapshotExpert } from '@/lib/analyst/source-snapshots'

type Tab = 'platform' | 'fund' | 'discovery'

export function ExpertDirectory(props: {
  initialExperts: ExpertDirectoryEntry[]
  initialCandidates: ExpertCandidate[]
  isAdmin: boolean
}) {
  const t = useTranslations('ExpertDirectory')
  const [tab, setTab] = useState<Tab>('platform')
  const [experts, setExperts] = useState(props.initialExperts)
  const [candidates, setCandidates] = useState(props.initialCandidates)
  const [query, setQuery] = useState('')
  const [sources, setSources] = useState({ pubmed: true, clinical_trials: true })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<'confirmed' | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [outcomes, setOutcomes] = useState<DiscoverySourceOutcome[]>([])
  const [directoryQuery, setDirectoryQuery] = useState('')
  const [candidateStatus, setCandidateStatus] = useState<'all' | ExpertCandidate['status']>('pending')
  const visibleExperts = useMemo(
    () => experts.filter(expert => (tab === 'platform' ? expert.scope === 'global' : expert.scope === 'fund')
      && (!directoryQuery.trim() || [expert.name, expert.title, expert.organization, expert.profileText].some(value => value?.toLocaleLowerCase().includes(directoryQuery.trim().toLocaleLowerCase())))),
    [experts, tab, directoryQuery],
  )
  const visibleCandidates = useMemo(
    () => candidates.filter(candidate => candidateStatus === 'all' || candidate.status === candidateStatus),
    [candidates, candidateStatus],
  )

  async function refreshCandidates() {
    const response = await fetch('/api/experts/discovery?status=all', { cache: 'no-store' })
    if (response.ok) setCandidates((await response.json()).candidates)
  }

  async function discover() {
    if (!query.trim()) return
    setBusy('discover'); setError(null); setNotice(null)
    try {
      const sourceIds = Object.entries(sources).filter(([, selected]) => selected).map(([id]) => id)
      const response = await fetch('/api/experts/discovery/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), sourceIds }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? t('errors.discovery'))
      setCandidates(body.candidates)
      setOutcomes(body.sources ?? [])
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('errors.discovery')) }
    finally { setBusy(null) }
  }

  async function addManual(form: HTMLFormElement) {
    setBusy('add'); setError(null)
    const values = Object.fromEntries(new FormData(form))
    try {
      const response = await fetch('/api/experts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, scope: 'fund', status: 'active', profileText: values.profileText }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? t('errors.add'))
      setExperts(current => [...current, body.expert].sort((a, b) => a.name.localeCompare(b.name)))
      setManualOpen(false); form.reset()
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('errors.add')) }
    finally { setBusy(null) }
  }

  async function confirm(candidate: ExpertCandidate, form: HTMLFormElement) {
    setBusy(`confirm:${candidate.id}`); setError(null); setNotice(null)
    const values = Object.fromEntries(new FormData(form))
    try {
      const response = await fetch(`/api/experts/discovery/${candidate.id}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? t('errors.confirm'))
      await refreshCandidates()
      const refresh = await fetch('/api/experts?includeInactive=1', { cache: 'no-store' })
      if (refresh.ok) setExperts((await refresh.json()).experts)
      setCandidateStatus('confirmed')
      setNotice('confirmed')
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('errors.confirm')) }
    finally { setBusy(null) }
  }

  async function reject(candidateId: string) {
    setBusy(`reject:${candidateId}`); setError(null)
    try {
      const response = await fetch(`/api/experts/discovery/${candidateId}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      if (!response.ok) throw new Error((await response.json()).error ?? t('errors.reject'))
      await refreshCandidates()
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('errors.reject')) }
    finally { setBusy(null) }
  }

  async function updateExpert(expert: ExpertDirectoryEntry, form: HTMLFormElement) {
    setBusy(`edit:${expert.id}`); setError(null)
    const values = Object.fromEntries(new FormData(form))
    try {
      const response = await fetch(`/api/experts/${expert.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, scope: 'fund', status: values.inactive ? 'inactive' : 'active' }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? t('errors.add'))
      setExperts(current => current.map(item => item.id === expert.id ? body.expert : item))
      return true
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('errors.add')); return false }
    finally { setBusy(null) }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6 md:p-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      <div className="mt-6 flex flex-wrap gap-2 border-b pb-3" role="tablist" aria-label={t('title')}>
        <TabButton tab="platform" active={tab === 'platform'} onClick={() => setTab('platform')}>{t('tabs.platform')}</TabButton>
        <TabButton tab="fund" active={tab === 'fund'} onClick={() => setTab('fund')}>{t('tabs.fund')}</TabButton>
        {props.isAdmin && <TabButton tab="discovery" active={tab === 'discovery'} onClick={() => setTab('discovery')}>{t('tabs.discovery')}</TabButton>}
      </div>
      {error && <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">{error}</div>}
      {notice === 'confirmed' && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm" role="status"><span>{t('discovery.confirmedNotice')}</span><Button size="sm" variant="outline" onClick={() => setTab('fund')}>{t('discovery.viewFundExperts')}</Button></div>}

      {tab !== 'discovery' && (
        <section id={`expert-panel-${tab}`} aria-labelledby={`expert-tab-${tab}`} className="mt-6" role="tabpanel">
          {tab === 'fund' && props.isAdmin && (
            <div className="mb-4 flex justify-end"><Button onClick={() => setManualOpen(value => !value)}>{t('manual.add')}</Button></div>
          )}
          {tab === 'fund' && manualOpen && <ManualExpertForm busy={Boolean(busy)} onSubmit={addManual} />}
          <DirectorySearchToolbar
            value={directoryQuery}
            onChange={setDirectoryQuery}
            countLabel={t('results.count', { count: visibleExperts.length })}
            label={t('directorySearch')}
          />
          <div className="grid gap-3 md:grid-cols-2">
            {visibleExperts.map(expert => expert.scope === 'fund' && props.isAdmin
              ? <EditableExpertCard key={expert.id} expert={expert} busy={busy === `edit:${expert.id}`} onUpdate={updateExpert} />
              : <ExpertCard key={expert.id} expert={expert} />)}
            {visibleExperts.length === 0 && (
              <Empty>
                {directoryQuery.trim()
                  ? t('empty.search')
                  : tab === 'fund' ? t('empty.fund') : t('empty.platform')}
              </Empty>
            )}
          </div>
        </section>
      )}

      {tab === 'discovery' && props.isAdmin && (
        <section id="expert-panel-discovery" aria-labelledby="expert-tab-discovery" className="mt-6" role="tabpanel">
          <div className="rounded-lg border p-4">
            <Label htmlFor="expert-discovery-query">{t('discovery.query')}</Label>
            <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="expert-discovery-query"
                  className="h-10 pl-9"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder={t('discovery.placeholder')}
                  onKeyDown={event => { if (event.key === 'Enter') void discover() }}
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button className="h-10 justify-between" type="button" variant="outline">{t('discovery.sources')}</Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  aria-labelledby="expert-discovery-sources-label"
                  className="w-64 p-3"
                >
                  <p id="expert-discovery-sources-label" className="text-sm font-medium">{t('discovery.sources')}</p>
                  <div className="mt-2 space-y-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={sources.pubmed}
                        onChange={event => setSources(current => ({ ...current, pubmed: event.target.checked }))}
                      />
                      <span>PubMed</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={sources.clinical_trials}
                        onChange={event => setSources(current => ({ ...current, clinical_trials: event.target.checked }))}
                      />
                      <span>ClinicalTrials.gov</span>
                    </label>
                  </div>
                </PopoverContent>
              </Popover>
              <Button className="h-10" disabled={Boolean(busy) || !query.trim()} onClick={discover}>
                {busy === 'discover' ? t('discovery.searching') : t('discovery.search')}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t('discovery.hint')}</p>
          </div>
          <div className="mt-5 space-y-4">
            {outcomes.some(outcome => outcome.status === 'error') && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="status">{t('discovery.partial')}</div>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium" aria-live="polite">
                {t('discovery.candidateCount', { count: visibleCandidates.length })}
              </p>
              <Select value={candidateStatus} onValueChange={value => setCandidateStatus(value as typeof candidateStatus)}>
                <SelectTrigger id="expert-candidate-status" className="h-10 w-full sm:w-44" aria-label={t('discovery.status')}>
                  <SelectValue placeholder={t('discovery.status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t('badges.pending')}</SelectItem>
                  <SelectItem value="confirmed">{t('badges.confirmed')}</SelectItem>
                  <SelectItem value="rejected">{t('badges.rejected')}</SelectItem>
                  <SelectItem value="all">{t('discovery.allStatuses')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {visibleCandidates.map(candidate => <CandidateCard key={candidate.id} candidate={candidate} busy={Boolean(busy)} onConfirm={confirm} onReject={reject} />)}
            {visibleCandidates.length === 0 && <Empty>{t('empty.candidates')}</Empty>}
          </div>
        </section>
      )}
    </div>
  )
}

function DirectorySearchToolbar(props: {
  value: string
  onChange: (value: string) => void
  countLabel: string
  label: string
}) {
  return (
    <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
      <div className="relative w-full min-w-0 sm:max-w-md sm:flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          aria-label={props.label}
          className="h-10 pl-9"
          value={props.value}
          onChange={event => props.onChange(event.target.value)}
          placeholder={props.label}
        />
      </div>
      <span className="text-sm text-muted-foreground" aria-live="polite">{props.countLabel}</span>
    </div>
  )
}

function TabButton(props: { tab: Tab; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button id={`expert-tab-${props.tab}`} aria-controls={`expert-panel-${props.tab}`} aria-selected={props.active} className={`rounded-md px-3 py-2 text-sm ${props.active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`} role="tab" type="button" onClick={props.onClick}>{props.children}</button>
}

function ExpertCard({ expert, onEdit }: { expert: ExpertDirectoryEntry; onEdit?: () => void }) {
  const t = useTranslations('ExpertDirectory')
  return <article className="group rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-medium">{expert.name}</h2><p className="text-sm text-muted-foreground">{[expert.title, expert.organization].filter(Boolean).join(' · ') || '—'}</p></div><div className="flex flex-wrap justify-end gap-1"><Badge variant="secondary">{expert.verificationType === 'platform_certified' ? t('badges.platform') : expert.sourceType === 'discovery' ? t('badges.fundDiscovery') : t('badges.fundManual')}</Badge>{expert.status === 'inactive' && <Badge variant="outline">{t('badges.inactive')}</Badge>}</div></div><p className="mt-3 line-clamp-3 text-sm">{expert.profileText}</p><div className="mt-2 flex flex-wrap items-center justify-end gap-1"><AnalystContextActions snapshot={snapshotExpert(expert)} presentation="compact-hover" />{onEdit && <Button size="sm" variant="ghost" onClick={onEdit}>{t('manual.edit')}</Button>}</div></article>
}

function EditableExpertCard({ expert, busy, onUpdate }: { expert: ExpertDirectoryEntry; busy: boolean; onUpdate: (expert: ExpertDirectoryEntry, form: HTMLFormElement) => Promise<boolean> }) {
  const t = useTranslations('ExpertDirectory')
  const [editing, setEditing] = useState(false)
  const [detail, setDetail] = useState<{ email: string } | null>(null)
  async function open() {
    const response = await fetch(`/api/experts/${expert.id}`, { cache: 'no-store' })
    if (!response.ok) return
    setDetail((await response.json()).expert)
    setEditing(true)
  }
  if (!editing) return <ExpertCard expert={expert} onEdit={() => void open()} />
  return <form aria-busy={busy} className="grid gap-3 rounded-lg border p-4 md:grid-cols-2" onSubmit={async event => { event.preventDefault(); if (await onUpdate(expert, event.currentTarget)) setEditing(false) }}><ExpertFields prefix={`expert-${expert.id}`} values={{ name: expert.name, email: detail?.email ?? '', title: expert.title ?? '', organization: expert.organization ?? '', profileText: expert.profileText }} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="inactive" defaultChecked={expert.status === 'inactive'} />{t('manual.inactive')}</label><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(false)}>{t('manual.cancel')}</Button><Button disabled={busy} type="submit">{t('manual.update')}</Button></div></form>
}

function ManualExpertForm({ busy, onSubmit }: { busy: boolean; onSubmit: (form: HTMLFormElement) => void }) {
  const t = useTranslations('ExpertDirectory')
  return <form aria-busy={busy} className="mb-5 grid gap-3 rounded-lg border p-4 md:grid-cols-2" onSubmit={event => { event.preventDefault(); void onSubmit(event.currentTarget) }}><ExpertFields prefix="new-expert" /><div className="md:col-span-2"><Button disabled={busy} type="submit">{t('manual.save')}</Button></div></form>
}

function CandidateCard({ candidate, busy, onConfirm, onReject }: { candidate: ExpertCandidate; busy: boolean; onConfirm: (candidate: ExpertCandidate, form: HTMLFormElement) => void; onReject: (id: string) => void }) {
  const t = useTranslations('ExpertDirectory')
  const badge = candidate.status === 'pending' ? t('badges.pending') : candidate.status === 'confirmed' ? t('badges.confirmed') : t('badges.rejected')
  return <article className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-medium">{candidate.name}</h2><p className="text-sm text-muted-foreground">{[candidate.title, candidate.organization].filter(Boolean).join(' · ') || t('discovery.noOrganization')}</p></div><Badge variant="outline">{badge}</Badge></div><div className="mt-3 space-y-1 text-xs text-muted-foreground">{candidate.evidence.map(item => <a key={`${item.sourceId}:${item.recordId}`} href={item.url} target="_blank" rel="noreferrer" className="block underline hover:text-foreground">{item.sourceId === 'pubmed' ? 'PubMed' : 'ClinicalTrials.gov'} · {item.recordTitle}</a>)}</div>{candidate.status === 'pending' && <form aria-busy={busy} className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={event => { event.preventDefault(); void onConfirm(candidate, event.currentTarget) }}><ExpertFields prefix={`candidate-${candidate.id}`} values={{ name: candidate.name, email: candidate.email ?? '', title: candidate.title ?? '', organization: candidate.organization ?? '', profileText: candidate.profileText }} /><div className="flex gap-2 md:col-span-2"><Button disabled={busy} type="submit">{t('discovery.confirm')}</Button><Button disabled={busy} type="button" variant="destructive" onClick={() => { if (window.confirm(t('discovery.rejectConfirm'))) void onReject(candidate.id) }}>{t('discovery.reject')}</Button></div><p className="text-xs text-muted-foreground md:col-span-2">{t('discovery.disclaimer')}</p></form>}</article>
}

function ExpertFields({ prefix, values }: { prefix: string; values?: { name: string; email: string; title: string; organization: string; profileText: string } }) {
  const t = useTranslations('ExpertDirectory')
  return <><Field id={`${prefix}-name`} label={t('manual.name')}><Input id={`${prefix}-name`} required name="name" defaultValue={values?.name} /></Field><Field id={`${prefix}-email`} label={t('manual.email')}><Input id={`${prefix}-email`} required type="email" name="email" defaultValue={values?.email} /></Field><Field id={`${prefix}-title`} label={t('manual.title')}><Input id={`${prefix}-title`} name="title" defaultValue={values?.title} /></Field><Field id={`${prefix}-organization`} label={t('manual.organization')}><Input id={`${prefix}-organization`} name="organization" defaultValue={values?.organization} /></Field><Field id={`${prefix}-profile`} label={t('manual.profile')} className="md:col-span-2"><Textarea id={`${prefix}-profile`} required name="profileText" defaultValue={values?.profileText} /></Field></>
}

function Field({ id, label, className, children }: { id: string; label: string; className?: string; children: React.ReactNode }) {
  return <div className={className}><Label className="mb-2 block" htmlFor={id}>{label}</Label>{children}</div>
}

function Empty({ children }: { children: React.ReactNode }) { return <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground md:col-span-2">{children}</div> }
