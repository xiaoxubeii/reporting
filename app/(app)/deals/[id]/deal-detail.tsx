'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw, ExternalLink, UserPlus, Loader2, ChevronDown, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAnalystContext } from '@/components/analyst-context'
import { PortfolioNotesProvider, PortfolioNotesButton, PortfolioNotesPanel } from '@/components/portfolio-notes'
import { DealResearchCard } from '@/components/deals/research-card'
import { useFormatter, useTranslations } from 'next-intl'

type DealStatus = 'new' | 'reviewing' | 'advancing' | 'met' | 'diligence' | 'invested' | 'passed'

interface Deal {
  id: string
  email_id: string
  fund_id: string
  company_name: string | null
  company_url: string | null
  company_domain: string | null
  founder_name: string | null
  founder_email: string | null
  co_founders: Array<{ name: string; email?: string; role?: string }> | null
  intro_source: string | null
  referrer_name: string | null
  referrer_email: string | null
  company_summary: string | null
  thesis_fit_analysis: string | null
  thesis_fit_score: 'strong' | 'moderate' | 'weak' | 'out_of_thesis' | 'spam' | null
  stage: string | null
  industry: string | null
  raise_amount: string | null
  status: DealStatus
  prior_deal_id: string | null
  promoted_diligence_id: string | null
  created_at: string
  // External web research — only run for deals that cleared the fund's interest
  // bar (see lib/deals/research.ts).
  research_status: 'pending' | 'running' | 'done' | 'failed' | 'skipped' | null
  research_summary: string | null
  research_findings: {
    founder_background?: string
    prior_companies?: string[]
    traction_corroboration?: string
    market_context?: string
    red_flags?: string[]
    open_questions?: string[]
  } | null
  research_sources: Array<{ url: string; title: string }> | null
  research_error: string | null
  researched_at: string | null
}

interface EmailRow {
  id: string
  from_address: string
  subject: string | null
  received_at: string | null
  raw_payload: any
  routing_label: string | null
  routing_confidence: number | null
  routing_reasoning: string | null
}

const FIT_BADGE: Record<string, { cls: string }> = {
  strong: { cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  moderate: { cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  weak: { cls: 'bg-muted text-muted-foreground' },
  out_of_thesis: { cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
  spam: { cls: 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 line-through' },
}

const STATUS_OPTIONS: DealStatus[] = ['new', 'reviewing', 'advancing', 'met', 'diligence', 'invested', 'passed']

function useDealDetailLabels(): Record<string, string> {
  const t = useTranslations('DealDetail.labels')
  return {
    new: t('new'), reviewing: t('reviewing'), advancing: t('advancing'), met: t('met'),
    diligence: t('diligence'), invested: t('invested'), passed: t('passed'),
    strong: t('strongFit'), moderate: t('moderateFit'), weak: t('weakFit'), out_of_thesis: t('outOfThesis'), spam: t('spam'),
    referral: t('referral'), cold: t('cold'), warm_intro: t('warmIntro'), accelerator: t('accelerator'),
    demo_day: t('demoDay'), event: t('event'), other: t('other'), heartbeat: t('heartbeat'),
    reporting: t('reporting'), interactions: t('interactions'), audit: t('audit'),
  }
}

export function DealDetail({ deal: initial, email, priorDeal }: { deal: Deal; email: EmailRow | null; priorDeal: { id: string; company_name: string | null; created_at: string | null } | null }) {
  const t = useTranslations('DealDetail')
  const format = useFormatter()
  const labels = useDealDetailLabels()
  const router = useRouter()
  const { setDealId } = useAnalystContext()
  const [deal, setDeal] = useState(initial)
  const [regenerating, setRegenerating] = useState(false)
  const [rerouting, setRerouting] = useState(false)
  const [addingReferrer, setAddingReferrer] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)

  // Scope the analyst panel to this deal while the page is mounted.
  useEffect(() => {
    setDealId(deal.id)
    return () => setDealId(null)
  }, [deal.id, setDealId])

  async function updateStatus(status: DealStatus) {
    // Picking "Diligence" for the first time creates the diligence record so
    // there's a single mental model: stages are the lifecycle, and `diligence`
    // is the stage that has a memo workspace behind it. Once promoted, picking
    // it again is a no-op nav (the existing record opens via the side button).
    if (status === 'diligence' && !deal.promoted_diligence_id) {
      if (!confirm(t('confirmPromote'))) return
      setStatusBusy(true)
      const res = await fetch(`/api/deals/${deal.id}/promote-to-diligence`, { method: 'POST' })
      setStatusBusy(false)
      if (res.ok) {
        const body = await res.json()
        setDeal(d => ({ ...d, status: 'diligence', promoted_diligence_id: body.diligence_id }))
        router.push(`/diligence/${body.diligence_id}`)
      } else {
        const body = await res.json().catch(() => ({}))
        if (res.status === 409 && body.diligence_id) {
          setDeal(d => ({ ...d, status: 'diligence', promoted_diligence_id: body.diligence_id }))
          router.push(`/diligence/${body.diligence_id}`)
        } else {
          alert(body.error ?? t('errors.promote'))
        }
      }
      return
    }
    setDeal(d => ({ ...d, status }))
    await fetch(`/api/deals/${deal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  async function regenerate() {
    setRegenerating(true)
    const res = await fetch(`/api/deals/${deal.id}/regenerate`, { method: 'POST' })
    setRegenerating(false)
    if (res.ok) {
      const body = await res.json()
      setDeal(d => ({
        ...d,
        company_summary: body.analysis?.company_summary ?? d.company_summary,
        thesis_fit_analysis: body.analysis?.thesis_fit_analysis ?? d.thesis_fit_analysis,
        thesis_fit_score: body.analysis?.thesis_fit_score ?? d.thesis_fit_score,
      }))
    }
  }

  async function reroute(label: 'reporting' | 'interactions' | 'audit') {
    if (!confirm(t('confirmReroute', { destination: labels[label] }))) return
    setRerouting(true)
    const res = await fetch(`/api/emails/${deal.email_id}/reroute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: label }),
    })
    setRerouting(false)
    if (res.ok) {
      router.push('/deals')
    } else {
      alert(t('errors.reroute'))
    }
  }

  async function addReferrer() {
    if (!deal.referrer_email) return
    setAddingReferrer(true)
    const res = await fetch('/api/known-referrers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: deal.referrer_email, name: deal.referrer_name ?? null }),
    })
    setAddingReferrer(false)
    if (res.ok) alert(t('referrerAdded'))
  }

  const payload = email?.raw_payload as { TextBody?: string; HtmlBody?: string; Attachments?: Array<{ Name: string; ContentType: string; ContentLength: number }> } | undefined
  const bodyText = payload?.TextBody ?? ''
  const attachments = payload?.Attachments ?? []

  const founderValue = deal.founder_name
    ? deal.founder_email
      ? `${deal.founder_name} <${deal.founder_email}>`
      : deal.founder_name
    : deal.founder_email ?? null

  const websiteHref = deal.company_url ? ensureHttps(deal.company_url) : null
  const websiteLabel = deal.company_url ?? deal.company_domain ?? null

  const formatDealDate = (value: string | null | undefined) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return format.dateTime(date, { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' })
  }

  return (
    <PortfolioNotesProvider pageContext="deals">
    <div className="p-4 md:py-8 md:pl-8 md:pr-4 flex flex-col lg:flex-row gap-6 items-start">
    <div className="flex-1 min-w-0 max-w-4xl">
      <Link href="/deals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> {t('backToDeals')}
      </Link>

      {/* Header row: title left, notes + analyst right (mirrors interactions). */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h1 className="text-2xl font-semibold tracking-tight">{deal.company_name ?? t('unknownCompany')}</h1>
        <div className="flex items-center gap-2">
          <PortfolioNotesButton />
        </div>
      </div>

      {/* Action row: fit badge + status dropdown + reroute + promote. All controls
          share the same h-8 outline/button shape so they read as one cluster. */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {deal.thesis_fit_score && (
          <span className={`inline-flex items-center h-8 px-3 rounded-md text-xs font-medium ${FIT_BADGE[deal.thesis_fit_score].cls}`}>
            {labels[deal.thesis_fit_score]}
          </span>
        )}
        <StatusDropdown value={deal.status} onPick={updateStatus} disabled={statusBusy} />
        <RerouteDropdown onPick={reroute} disabled={rerouting} />
        {deal.promoted_diligence_id && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/diligence/${deal.promoted_diligence_id}`}>
              <ArrowRight className="h-3.5 w-3.5 mr-1" /> {t('openDiligence')}
            </Link>
          </Button>
        )}
      </div>

      {priorDeal && (
        <Card className="mb-4 border-amber-200 bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="py-3 text-sm">
            {t.rich('priorPitch', {
              date: formatDealDate(priorDeal.created_at) ?? t('unknownDate'),
              strong: chunks => <span className="font-medium">{chunks}</span>,
            })}{' '}
            <Link href={`/deals/${priorDeal.id}`} className="underline">{t('viewPriorDeal')}</Link>
          </CardContent>
        </Card>
      )}

      {/* Details on the left, Summary on the right. Details is rendered as a
          single Row-style table so company info reads as one block. */}
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('details.title')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <Row k={t('details.founder')} v={founderValue} />
            <Row
              k={t('details.website')}
              v={websiteLabel}
              href={websiteHref ?? undefined}
            />
            <Row
              k={t('details.received')}
              v={formatDealDate(email?.received_at)}
            />
            <Row k={t('details.stage')} v={deal.stage} />
            <Row k={t('details.industry')} v={deal.industry} />
            <Row k={t('details.raise')} v={deal.raise_amount} />
            <Row k={t('details.introSource')} v={deal.intro_source ? labels[deal.intro_source] : null} />
            {deal.referrer_name && (
              <Row
                k={t('details.referrer')}
                v={deal.referrer_email ? `${deal.referrer_name} (${deal.referrer_email})` : deal.referrer_name}
              />
            )}
            {(deal.co_founders ?? []).length > 0 && (
              <Row
                k={t('details.coFounders')}
                v={(deal.co_founders ?? [])
                  .map(cf => cf.role ? `${cf.name} (${cf.role})` : cf.name)
                  .join(', ')}
              />
            )}
            {deal.referrer_email && (
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={addReferrer} disabled={addingReferrer}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> {t('addKnownReferrer')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('summary.title')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {deal.company_summary || <span className="text-muted-foreground italic">{t('summary.empty')}</span>}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t('thesis.title')}</CardTitle>
          <Button variant="outline" size="sm" onClick={regenerate} disabled={regenerating}>
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            {t('thesis.regenerate')}
          </Button>
        </CardHeader>
        <CardContent className="text-sm whitespace-pre-wrap">
          {deal.thesis_fit_analysis || <span className="text-muted-foreground italic">{t('thesis.empty')}</span>}
        </CardContent>
      </Card>

      {/* External research sits right after thesis fit: it exists to corroborate
          (or contradict) the pitch that fit was scored on. */}
      <DealResearchCard
        dealId={deal.id}
        status={deal.research_status}
        summary={deal.research_summary}
        findings={deal.research_findings}
        sources={deal.research_sources}
        error={deal.research_error}
        researchedAt={deal.researched_at}
        onQueued={() => setDeal(d => d ? { ...d, research_status: 'pending', research_error: null } : d)}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('sourceEmail.title')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="text-xs text-muted-foreground">
            {t('sourceEmail.from')}: {email?.from_address ?? '—'} · {t('sourceEmail.subject')}: {email?.subject ?? '—'}
          </div>
          <div className="whitespace-pre-wrap rounded border bg-muted/30 p-3 max-h-72 overflow-y-auto">
            {bodyText || <span className="italic text-muted-foreground">{t('sourceEmail.noBody')}</span>}
          </div>
          {attachments.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('sourceEmail.attachments')}</div>
              <ul className="text-xs space-y-1">
                {attachments.map((a, i) => (
                  <li key={i}>
                    <Link href={`/api/emails/${deal.email_id}/attachment/${i}`} className="hover:underline">
                      {a.Name} <span className="text-muted-foreground">({a.ContentType}, {format.number(a.ContentLength / 1024, { maximumFractionDigits: 0 })} KB)</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {email?.routing_reasoning && (
            <div className="text-xs text-muted-foreground border-t pt-2">
              {t('sourceEmail.classifier')}: {email.routing_label} @ {email.routing_confidence == null ? '—' : format.number(email.routing_confidence, { maximumFractionDigits: 2 })}, {email.routing_reasoning}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    <PortfolioNotesPanel />
    </div>
    </PortfolioNotesProvider>
  )
}

function StatusDropdown({ value, onPick, disabled }: { value: DealStatus; onPick: (s: DealStatus) => void; disabled?: boolean }) {
  const labels = useDealDetailLabels()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
          {labels[value]}
          <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1">
        {STATUS_OPTIONS.map(s => (
          <button
            key={s}
            onClick={() => { setOpen(false); onPick(s) }}
            className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted ${s === value ? 'bg-muted font-medium' : ''}`}
          >
            {labels[s]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function RerouteDropdown({ onPick, disabled }: { onPick: (label: 'reporting' | 'interactions' | 'audit') => void; disabled: boolean }) {
  const t = useTranslations('DealDetail.reroute')
  const labels = useDealDetailLabels()
  const [open, setOpen] = useState(false)
  const targets: Array<'reporting' | 'interactions' | 'audit'> = ['reporting', 'interactions', 'audit']
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          {t('button')}
          <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <div className="text-[11px] text-muted-foreground px-2 py-1.5">
          {t('description')}
        </div>
        {targets.map(target => (
          <button
            key={target}
            onClick={() => { setOpen(false); onPick(target) }}
            className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted"
          >
            {labels[target]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function Row({ k, v, href }: { k: string; v: string | null; href?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right min-w-0 truncate">
        {v == null ? (
          '—'
        ) : href ? (
          <a href={href} target="_blank" rel="noreferrer" className="hover:underline inline-flex items-center gap-1">
            {v}<ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          v
        )}
      </span>
    </div>
  )
}

function ensureHttps(url: string): string {
  if (url.startsWith('http')) return url
  return `https://${url}`
}
