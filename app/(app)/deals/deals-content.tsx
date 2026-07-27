'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Lock, Search, ExternalLink, Table as TableIcon, Columns3, ChevronUp, ChevronDown, Copy, Check, Plus, ChevronsUpDown } from 'lucide-react'
import { useFeatureVisibility } from '@/components/feature-visibility-context'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ManualDealDialog } from '@/components/deals/manual-deal-dialog'
import { STATUS_OPTIONS, DEFAULT_STATUSES, STATUS_ORDER } from '@/lib/deals/statuses'
import { useFormatter, useTranslations } from 'next-intl'
import { useCanWrite } from '@/components/access-context'
import { AnalystContextActions } from '@/components/analyst-context-actions'
import { snapshotDeal, snapshotDealBoard } from '@/lib/analyst/source-snapshots'

const DEAL_BOARD_MIME = 'application/x-reporting-deal-board'

interface Deal {
  id: string
  email_id: string
  company_name: string | null
  company_url: string | null
  company_domain: string | null
  founder_name: string | null
  founder_email: string | null
  intro_source: string | null
  referrer_name: string | null
  thesis_fit_score: 'strong' | 'moderate' | 'weak' | 'out_of_thesis' | 'spam' | null
  stage: string | null
  industry: string | null
  raise_amount: string | null
  status: 'new' | 'reviewing' | 'advancing' | 'met' | 'diligence' | 'invested' | 'passed'
  prior_deal_id: string | null
  created_at: string
}

const FIT_BADGE: Record<string, { cls: string }> = {
  strong: { cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  moderate: { cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  weak: { cls: 'bg-muted text-muted-foreground' },
  out_of_thesis: { cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
  spam: { cls: 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 line-through' },
}

const FIT_OPTIONS = ['strong', 'moderate', 'weak', 'out_of_thesis', 'spam']

// The sources a human can pick from. 'heartbeat' is NOT here: it is only ever set
// by the Heartbeat ingest path, and the filter only offers it to funds that have
// the integration on (or that have already received a deal through it) — see
// heartbeatSourceAvailable from /api/settings. A fund that doesn't use Heartbeat
// should never see a dead option in its dropdown.
const SOURCE_OPTIONS = ['referral', 'cold', 'warm_intro', 'accelerator', 'demo_day', 'event', 'other']

type ViewMode = 'table' | 'board'
type SortKey = 'date' | 'company' | 'founder' | 'source' | 'fit' | 'status'
interface SortState { key: SortKey; dir: 'asc' | 'desc' }

const FIT_ORDER: Record<NonNullable<Deal['thesis_fit_score']>, number> = {
  spam: 0,
  out_of_thesis: 1,
  weak: 2,
  moderate: 3,
  strong: 4,
}

function useDealLabels(): Record<string, string> {
  const t = useTranslations('Deals.labels')
  return {
    new: t('new'), reviewing: t('reviewing'), advancing: t('advancing'), met: t('met'),
    diligence: t('diligence'), invested: t('invested'), passed: t('passed'),
    strong: t('strong'), moderate: t('moderate'), weak: t('weak'), out_of_thesis: t('outOfThesis'), spam: t('spam'),
    referral: t('referral'), cold: t('cold'), warm_intro: t('warmIntro'), accelerator: t('accelerator'),
    demo_day: t('demoDay'), event: t('event'), other: t('other'), heartbeat: t('heartbeat'),
  }
}

export function DealsContent({ initialDeals }: { initialDeals: Deal[] }) {
  const t = useTranslations('Deals')
  const format = useFormatter()
  const labels = useDealLabels()
  const fv = useFeatureVisibility()
  const canCreateDeal = useCanWrite('dealflow')
  const [deals, setDeals] = useState<Deal[]>(initialDeals)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<Deal['status'][]>(DEFAULT_STATUSES)
  const [fitFilter, setFitFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [view, setView] = useState<ViewMode>('table')
  const [sort, setSort] = useState<SortState>({ key: 'date', dir: 'desc' })
  const [inboundAddress, setInboundAddress] = useState('')
  const [heartbeatSource, setHeartbeatSource] = useState(false)
  const [copied, setCopied] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/settings').then(r => r.ok ? r.json() : null).then(s => {
      if (s?.postmarkInboundAddress) setInboundAddress(s.postmarkInboundAddress)
      setHeartbeatSource(!!s?.heartbeatSourceAvailable)
    }).catch(() => {})
  }, [])

  const sourceOptions = useMemo(
    () => heartbeatSource ? [...SOURCE_OPTIONS, 'heartbeat'] : SOURCE_OPTIONS,
    [heartbeatSource]
  )

  function toggleSort(key: SortKey) {
    setSort(prev => {
      if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      // Default direction per column: date defaults desc (newest first); others asc.
      return { key, dir: key === 'date' ? 'desc' : 'asc' }
    })
  }

  // Refetch when filters change. Selecting nothing means nothing matches, so don't
  // bother the server — an empty `status` param would be read as "no filter" and
  // return every deal, which is the opposite of what was asked for.
  useEffect(() => {
    if (statusFilter.length === 0) { setDeals([]); return }
    const params = new URLSearchParams()
    if (statusFilter.length < STATUS_OPTIONS.length) params.set('status', statusFilter.join(','))
    if (fitFilter) params.set('fit_score', fitFilter)
    if (sourceFilter) params.set('intro_source', sourceFilter)
    params.set('limit', '500')
    fetch(`/api/deals?${params.toString()}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: Deal[]) => setDeals(data))
      .catch(() => {})
  }, [statusFilter, fitFilter, sourceFilter])

  const filtered = useMemo(() => {
    if (!search.trim()) return deals
    const q = search.trim().toLowerCase()
    return deals.filter(d =>
      (d.company_name?.toLowerCase().includes(q)) ||
      (d.founder_name?.toLowerCase().includes(q)) ||
      (d.founder_email?.toLowerCase().includes(q))
    )
  }, [deals, search])

  const sorted = useMemo(() => {
    const out = [...filtered]
    const dir = sort.dir === 'asc' ? 1 : -1
    out.sort((a, b) => {
      const cmp = compareDeals(a, b, sort.key)
      // Tiebreaker: newer first so the order stays stable when keys tie.
      if (cmp === 0) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return cmp * dir
    })
    return out
  }, [filtered, sort])

  async function updateStatus(id: string, status: Deal['status']) {
    const prev = deals
    // Optimistic — and if the new status isn't in the filter, the deal leaves the view.
    // Anything else would show a "Passed" row under a filter that excludes Passed.
    setDeals(d => d
      .map(x => x.id === id ? { ...x, status } : x)
      .filter(x => statusFilter.includes(x.status)))
    const res = await fetch(`/api/deals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) setDeals(prev)
  }

  return (
    <div className="p-4 md:py-8 md:pl-8 md:pr-4">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            {fv.deals === 'admin' && <Lock className="h-4 w-4 text-amber-500" />}
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md overflow-hidden bg-card">
            <button
              onClick={() => setView('table')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${view === 'table' ? 'bg-muted' : 'hover:bg-muted/50'}`}
            >
              <TableIcon className="h-3.5 w-3.5" /> {t('views.table')}
            </button>
            <button
              onClick={() => setView('board')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 border-l ${view === 'board' ? 'bg-muted' : 'hover:bg-muted/50'}`}
            >
              <Columns3 className="h-3.5 w-3.5" /> {t('views.board')}
            </button>
          </div>
          {canCreateDeal && <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> {t('newDeal.button')}
          </Button>}
        </div>
      </div>

      <ManualDealDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(dealId) => {
        setCreateOpen(false)
        if (dealId) router.push(`/deals/${dealId}`)
        else router.refresh()
      }} />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 w-72"
          />
        </div>
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        <select
          value={fitFilter}
          onChange={e => setFitFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">{t('filters.allFitScores')}</option>
          {FIT_OPTIONS.map(o => <option key={o} value={o}>{labels[o]}</option>)}
        </select>
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">{t('filters.allSources')}</option>
          {sourceOptions.map(o => <option key={o} value={o}>{labels[o]}</option>)}
        </select>
        {inboundAddress && (
          <div className="ml-auto flex items-center gap-1.5">
            <Input
              type="text"
              readOnly
              value={inboundAddress}
              title={t('inboundAddressTitle')}
              className="h-9 w-64 text-sm bg-muted text-muted-foreground cursor-default"
              tabIndex={-1}
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(inboundAddress)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="h-9 px-2 text-muted-foreground hover:text-foreground transition-colors"
              title={t('copyToClipboard')}
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>

      {view === 'board' ? (
        <DealsBoard deals={filtered} onMove={updateStatus} />
      ) : (
      <div className="rounded-md border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <SortableTh label={t('table.date')} sortKey="date" sort={sort} onToggle={toggleSort} />
              <SortableTh label={t('table.company')} sortKey="company" sort={sort} onToggle={toggleSort} />
              <SortableTh label={t('table.founder')} sortKey="founder" sort={sort} onToggle={toggleSort} />
              <SortableTh label={t('table.source')} sortKey="source" sort={sort} onToggle={toggleSort} />
              <SortableTh label={t('table.fit')} sortKey="fit" sort={sort} onToggle={toggleSort} />
              <SortableTh label={t('table.status')} sortKey="status" sort={sort} onToggle={toggleSort} />
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                  {statusFilter.length === 0
                    ? t('empty.noStatuses')
                    : statusFilter.length < STATUS_OPTIONS.length
                      ? <>{t('empty.noMatchesBefore')} <button onClick={() => setStatusFilter([...STATUS_OPTIONS])} className="underline underline-offset-2 hover:text-foreground">{t('empty.showAllStatuses')}</button>{t('sentencePeriod')}</>
                      : t('empty.noDeals')}
                </td>
              </tr>
            ) : sorted.map(d => (
              <tr key={d.id} className="group border-t hover:bg-muted/30">
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {format.dateTime(new Date(d.created_at), { month: 'short', day: 'numeric' })}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/deals/${d.id}`} className="font-medium hover:underline">
                    {d.company_name ?? '—'}
                  </Link>
                  {d.stage && <span className="ml-2 text-xs text-muted-foreground">{d.stage}</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{d.founder_name ?? '—'}</div>
                  {d.founder_email && (
                    <div className="text-xs text-muted-foreground">{d.founder_email}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {d.intro_source ? labels[d.intro_source] : '—'}
                  {d.referrer_name && <div className="text-muted-foreground">{d.referrer_name}</div>}
                </td>
                <td className="px-3 py-2">
                  {d.thesis_fit_score && (
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${FIT_BADGE[d.thesis_fit_score].cls}`}>
                      {labels[d.thesis_fit_score]}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={d.status}
                    onChange={e => updateStatus(d.id, e.target.value as Deal['status'])}
                    className="h-7 px-2 rounded border border-input bg-background text-xs"
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>{labels[s]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <AnalystContextActions snapshot={snapshotDeal(d)} presentation="compact-hover" />
                    <Link href={`/deals/${d.id}`} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                      {t('view')} <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {sorted.length > 0 && view === 'table' && (
        <div className="mt-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => exportCsv(sorted, [
            t('csv.date'), t('csv.company'), t('csv.founder'), t('csv.email'), t('csv.source'),
            t('csv.referrer'), t('csv.fit'), t('csv.stage'), t('csv.industry'), t('csv.raise'), t('csv.status'),
          ])}>
            {t('exportCsv')}
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status filter — any set of statuses, not one or all. A native <select multiple>
// can technically do this but needs ctrl-click to add a second option, which nobody
// discovers; checkboxes make "and also show passed" a single click.
// ---------------------------------------------------------------------------

function StatusFilter({ value, onChange }: {
  value: Deal['status'][]
  onChange: (v: Deal['status'][]) => void
}) {
  const t = useTranslations('Deals.filters')
  const labels = useDealLabels()
  const [open, setOpen] = useState(false)

  const isDefault = value.length === DEFAULT_STATUSES.length && DEFAULT_STATUSES.every(s => value.includes(s))
  const label =
    value.length === 0 ? t('noStatuses')
    : value.length === STATUS_OPTIONS.length ? t('allStatuses')
    : isDefault ? t('activeDeals')
    : value.length === 1 ? labels[value[0]]
    : t('statusCount', { count: value.length })

  function toggle(s: Deal['status']) {
    onChange(value.includes(s) ? value.filter(x => x !== s) : [...value, s])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`h-9 px-3 rounded-md border bg-background text-sm inline-flex items-center gap-1.5 hover:bg-muted/50 ${isDefault ? 'border-input' : 'border-foreground/30'}`}
        >
          {label}
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1.5">
        <div className="flex items-center gap-1 px-1 pb-1.5 mb-1 border-b text-xs">
          <button onClick={() => onChange(DEFAULT_STATUSES)} className="px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground">{t('active')}</button>
          <button onClick={() => onChange([...STATUS_OPTIONS])} className="px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground">{t('all')}</button>
          <button onClick={() => onChange([])} className="px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground">{t('none')}</button>
        </div>
        {STATUS_OPTIONS.map(s => (
          <label
            key={s}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-muted"
          >
            <input
              type="checkbox"
              checked={value.includes(s)}
              onChange={() => toggle(s)}
              className="h-3.5 w-3.5 rounded border-input accent-foreground"
            />
            <span>{labels[s]}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  )
}

const BOARD_COLUMNS: Deal['status'][] = ['new', 'reviewing', 'advancing', 'met', 'diligence', 'invested', 'passed']

function DealsBoard({ deals, onMove }: { deals: Deal[]; onMove: (id: string, status: Deal['status']) => void }) {
  const t = useTranslations('Deals')
  const format = useFormatter()
  const labels = useDealLabels()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<Deal['status'] | null>(null)

  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(DEAL_BOARD_MIME, id)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setOverColumn(null)
  }

  function handleDragOver(e: React.DragEvent, status: Deal['status']) {
    if (!Array.from(e.dataTransfer.types).includes(DEAL_BOARD_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverColumn(status)
  }

  function handleDrop(e: React.DragEvent, status: Deal['status']) {
    if (!Array.from(e.dataTransfer.types).includes(DEAL_BOARD_MIME)) return
    e.preventDefault()
    const id = e.dataTransfer.getData(DEAL_BOARD_MIME) || draggingId
    if (id) {
      const deal = deals.find(d => d.id === id)
      if (deal && deal.status !== status) onMove(id, status)
    }
    setDraggingId(null)
    setOverColumn(null)
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${BOARD_COLUMNS.length}, minmax(220px, 1fr))`, minWidth: `${BOARD_COLUMNS.length * 220}px` }}>
      {BOARD_COLUMNS.map(status => {
        const colDeals = deals.filter(d => d.status === status)
        const isOver = overColumn === status
        return (
          <div
            key={status}
            onDragOver={e => handleDragOver(e, status)}
            onDragLeave={() => setOverColumn(null)}
            onDrop={e => handleDrop(e, status)}
            className={`rounded-md border bg-card flex flex-col min-h-[400px] transition-colors ${isOver ? 'ring-2 ring-primary border-primary' : ''}`}
          >
            <div className="p-2 border-b flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{labels[status]}</span>
              <span className="text-xs text-muted-foreground">{colDeals.length}</span>
            </div>
            <div className="p-2 space-y-2 flex-1 overflow-y-auto">
              {colDeals.length === 0 ? (
                <div className="text-xs text-muted-foreground/60 italic px-1 py-4 text-center">{t('board.dropHere')}</div>
              ) : colDeals.map(d => (
                <div
                  key={d.id}
                  draggable
                  onDragStart={e => handleDragStart(e, d.id)}
                  onDragEnd={handleDragEnd}
                  className={`group rounded border bg-background p-2 cursor-grab active:cursor-grabbing hover:border-primary/50 ${draggingId === d.id ? 'opacity-40' : ''}`}
                >
                  <Link href={`/deals/${d.id}`} className="block" onClick={e => { if (draggingId) e.preventDefault() }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm truncate">{d.company_name ?? '—'}</div>
                      {d.thesis_fit_score && (
                        <span className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${FIT_BADGE[d.thesis_fit_score].cls}`}>
                          {labels[d.thesis_fit_score]}
                        </span>
                      )}
                    </div>
                    {d.founder_name && <div className="text-xs text-muted-foreground truncate">{d.founder_name}</div>}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      {d.intro_source && <span>{labels[d.intro_source]}</span>}
                      {d.stage && <span>· {d.stage}</span>}
                      <span className="ml-auto">{format.dateTime(new Date(d.created_at), { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </Link>
                  <div className="mt-1 flex justify-end">
                    <AnalystContextActions snapshot={snapshotDealBoard(d)} presentation="compact-hover" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}

function SortableTh({ label, sortKey, sort, onToggle }: {
  label: string
  sortKey: SortKey
  sort: SortState
  onToggle: (key: SortKey) => void
}) {
  const active = sort.key === sortKey
  return (
    <th className="px-3 py-2 font-medium select-none">
      <button
        onClick={() => onToggle(sortKey)}
        className="inline-flex items-center gap-1 uppercase hover:text-foreground"
      >
        <span>{label}</span>
        {active && (sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </button>
    </th>
  )
}

function compareDeals(a: Deal, b: Deal, key: SortKey): number {
  switch (key) {
    case 'date':    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    case 'company': return strCmp(a.company_name, b.company_name)
    case 'founder': return strCmp(a.founder_name, b.founder_name)
    case 'source':  return strCmp(a.intro_source, b.intro_source)
    case 'fit': {
      const av = a.thesis_fit_score ? FIT_ORDER[a.thesis_fit_score] : -1
      const bv = b.thesis_fit_score ? FIT_ORDER[b.thesis_fit_score] : -1
      return av - bv
    }
    case 'status':  return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  }
}

function strCmp(a: string | null, b: string | null): number {
  // Null / empty values sort to the bottom on asc.
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.localeCompare(b)
}

function exportCsv(deals: Deal[], headers: string[]) {
  const rows = deals.map(d => [
    d.created_at,
    d.company_name ?? '',
    d.founder_name ?? '',
    d.founder_email ?? '',
    d.intro_source ?? '',
    d.referrer_name ?? '',
    d.thesis_fit_score ?? '',
    d.stage ?? '',
    d.industry ?? '',
    d.raise_amount ?? '',
    d.status,
  ])
  const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `deals-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function escape(v: string): string {
  if (v.includes('"') || v.includes(',') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}
