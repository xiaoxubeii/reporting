'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { BriefcaseBusiness, ExternalLink, Flame, Loader2, Newspaper, Radar, RefreshCw } from 'lucide-react'
import { ManualDealDialog, type ManualDealPrefill } from '@/components/deals/manual-deal-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { buildArticleDealPrefill } from '@/lib/feeds/deal-prefill'
import { useCanWrite } from '@/components/access-context'
import { FeedRowsSkeleton, FeedsStatePanel } from './state-panel'
import { TodayViewTabs } from './today-view-tabs'
import { ExploreViewTabs } from './explore-view-tabs'
import {
  feedErrorMessageKey,
  feedsRequest,
  type DealSignalDiscoveryResult,
  type DiscoveryPayload,
  type TrendingDiscoveryResult,
} from './api'

const PAGE_SIZE = 20
type DiscoveryItem = TrendingDiscoveryResult | DealSignalDiscoveryResult

export function ExploreDiscovery({ kind }: { kind: 'trending' | 'deal_signal' }) {
  const t = useTranslations('Feeds.discovery')
  const feedError = useTranslations('Feeds.errors')
  const router = useRouter()
  const canCreateDeal = useCanWrite('dealflow')
  const [page, setPage] = useState<DiscoveryPayload<DiscoveryItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DiscoveryItem | null>(null)
  const [dealPrefill, setDealPrefill] = useState<ManualDealPrefill | null>(null)
  const pageRef = useRef<DiscoveryPayload<DiscoveryItem> | null>(null)
  const requestSequence = useRef(0)
  const activeRequest = useRef<AbortController | null>(null)

  const load = useCallback(async (offset = 0, append = false, silent = false) => {
    const requestId = requestSequence.current + 1
    requestSequence.current = requestId
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    const previousPage = pageRef.current
    if (append) setLoadingMore(true)
    else if (!silent) setLoading(true)
    setError(null)
    try {
      let shouldAppend = append
      let data = await feedsRequest<DiscoveryPayload<DiscoveryItem>>(
        `/api/feeds/explore/discovery?kind=${kind}&limit=${PAGE_SIZE}&offset=${offset}`,
        { signal: controller.signal },
      )
      if (shouldAppend && previousPage?.generationId !== data.generationId) {
        data = await feedsRequest<DiscoveryPayload<DiscoveryItem>>(
          `/api/feeds/explore/discovery?kind=${kind}&limit=${PAGE_SIZE}&offset=0`,
          { signal: controller.signal },
        )
        shouldAppend = false
      }
      if (requestSequence.current !== requestId) return
      const nextPage = shouldAppend && previousPage
        ? { ...data, items: [...previousPage.items, ...data.items], offset: 0 }
        : data
      pageRef.current = nextPage
      setPage(nextPage)
    } catch (value) {
      if (controller.signal.aborted || requestSequence.current !== requestId) return
      setError(feedError(feedErrorMessageKey(value)))
    } finally {
      if (requestSequence.current === requestId) {
        activeRequest.current = null
        if (!silent) setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [feedError, kind])

  const requestRefresh = useCallback(async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      await feedsRequest<{ jobId: string; status: string }>(
        '/api/feeds/explore/discovery/refresh',
        { method: 'POST', body: '{}' },
      )
      await load()
    } catch (value) {
      if (value instanceof Error && value.message.includes('Discovery AI is not configured')) {
        // Re-read the server-owned status so the existing results and the
        // retryable provider state stay in one canonical UI surface.
        await load()
        setRefreshError(feedError(feedErrorMessageKey(value)))
      } else {
        setRefreshError(feedError(feedErrorMessageKey(value)))
      }
    } finally {
      setRefreshing(false)
    }
  }, [feedError, load])

  useEffect(() => {
    pageRef.current = null
    setPage(null)
    setSelected(null)
    setDealPrefill(null)
    void load()
    return () => {
      requestSequence.current += 1
      activeRequest.current?.abort()
      activeRequest.current = null
    }
  }, [load])

  useEffect(() => {
    if (page?.refresh?.state !== 'queued' && page?.refresh?.state !== 'running') return
    const interval = window.setInterval(() => { void load(0, false, true) }, 1_500)
    return () => window.clearInterval(interval)
  }, [load, page?.refresh?.state])
  const items = page?.items ?? []
  const hasMore = page ? items.length < page.total : false

  function createDeal(item: DealSignalDiscoveryResult) {
    const source = item.sources[0]
    setDealPrefill(buildArticleDealPrefill({
      key: item.id,
      title: source?.title ?? item.companyName,
      url: source?.url,
      summary: `${item.companyName}${item.stage ? ` · ${item.stage}` : ''}${item.amount ? ` · ${item.amount}` : ''}`,
      companyName: item.companyName,
      companyDomain: item.companyDomain,
      evidence: item.evidence,
    }))
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header className="flex items-end justify-between gap-4 pb-2">
        <div><h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('description')}</p></div>
        <Button variant="outline" size="icon" aria-label={t('refresh')} onClick={() => { void requestRefresh() }} disabled={loading || refreshing}><RefreshCw className={loading || refreshing ? 'animate-spin' : ''} /></Button>
      </header>
      <TodayViewTabs active="explore" />
      <ExploreViewTabs active={kind} />

      {page && <DiscoveryRefreshBanner status={page.refresh} legacyStale={page.isStale} refreshing={refreshing} onRetry={() => { void requestRefresh() }} />}
      {refreshError && <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{refreshError}</p>}
      <div className="mt-6">
        {loading && <FeedRowsSkeleton />}
        {!loading && error && <FeedsStatePanel tone="error" title={t('states.errorTitle')} description={error} actionLabel={t('retry')} onAction={() => load()} />}
        {!loading && !error && items.length === 0 && <FeedsStatePanel title={kind === 'trending' ? t('states.noTrendingTitle') : t('states.noSignalsTitle')} description={kind === 'trending' ? t('states.noTrendingDescription') : t('states.noSignalsDescription')} />}
        {!loading && !error && items.length > 0 && (
          <div className="space-y-4">
            {items.map(item => item.kind === 'trending'
              ? <TrendingCard key={item.id} item={item} onDetails={() => setSelected(item)} />
              : <DealSignalCard key={item.id} item={item} canCreate={canCreateDeal} onDetails={() => setSelected(item)} onCreate={() => createDeal(item)} />)}
            <div className="flex items-center justify-between py-2">
              <p className="text-xs text-muted-foreground">{t('showing', { visible: items.length, total: page?.total ?? 0 })}</p>
              {hasMore && <Button variant="outline" onClick={() => load(items.length, true)} disabled={loadingMore}>{loadingMore && <Loader2 className="animate-spin" />}{t('loadMore')}</Button>}
            </div>
          </div>
        )}
      </div>

      <DiscoveryDetails item={selected} onOpenChange={open => { if (!open) setSelected(null) }} />
      <ManualDealDialog open={dealPrefill !== null} onOpenChange={open => { if (!open) setDealPrefill(null) }} prefill={dealPrefill} onCreated={dealId => { setDealPrefill(null); if (dealId) router.push(`/deals/${dealId}`) }} />
    </div>
  )
}

function DiscoveryRefreshBanner({ status, legacyStale, refreshing, onRetry }: {
  status?: DiscoveryPayload<DiscoveryItem>['refresh']
  legacyStale: boolean
  refreshing: boolean
  onRetry: () => void
}) {
  const t = useTranslations('Feeds.discovery')
  const effectiveStatus = status ?? {
    state: legacyStale ? 'stale' : 'ready',
    reason: legacyStale ? 'results_stale' : null,
    retryable: legacyStale,
    lastAttemptAt: null,
  }
  if (effectiveStatus.state === 'ready' && !legacyStale) return null
  if (effectiveStatus.state === 'ready' && legacyStale) {
    return <div role="status" className="mt-5 rounded-md border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{t('stale')}</div>
  }
  const key = effectiveStatus.state === 'queued'
    ? 'refreshQueued'
    : effectiveStatus.state === 'running'
      ? 'refreshRunning'
      : effectiveStatus.reason === 'provider_not_configured'
        ? 'providerNotConfigured'
        : effectiveStatus.reason === 'refresh_failed'
          ? 'refreshFailed'
          : 'resultsStale'
  return (
    <div role="status" className="mt-5 flex flex-col gap-3 rounded-md border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="font-medium">{t(`states.${key}Title`)}</p><p className="mt-1 text-xs opacity-90">{t(`states.${key}Description`)}</p></div>
      {effectiveStatus.retryable && <Button variant="outline" size="sm" onClick={onRetry} disabled={refreshing}>{refreshing && <Loader2 className="animate-spin" />}{t('retry')}</Button>}
    </div>
  )
}

function TrendingCard({ item, onDetails }: { item: TrendingDiscoveryResult; onDetails: () => void }) {
  const t = useTranslations('Feeds.discovery')
  return (
    <article className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Flame className="h-5 w-5" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1"><p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">{t('trendingBadge')}</p><h2 className="mt-1 text-lg font-semibold">{item.label}</h2><p className="mt-2 text-sm text-muted-foreground">{item.summary}</p><div className="mt-4 flex flex-wrap gap-2"><Metric value={item.metrics.articleCount} label={t('articles')} /><Metric value={item.metrics.sourceCount} label={t('sources')} /><Metric value={`${Math.round(item.metrics.growth * 100)}%`} label={t('growth')} /></div></div>
        <Button variant="outline" size="sm" onClick={onDetails}><Newspaper />{t('viewSources')}</Button>
      </div>
    </article>
  )
}

function DealSignalCard({ item, canCreate, onDetails, onCreate }: { item: DealSignalDiscoveryResult; canCreate: boolean; onDetails: () => void; onCreate: () => void }) {
  const t = useTranslations('Feeds.discovery')
  return (
    <article className="rounded-xl border border-emerald-200 bg-card p-5 shadow-sm dark:border-emerald-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Radar className="h-5 w-5" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1"><p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{t('signalBadge')}</p><h2 className="mt-1 text-lg font-semibold">{item.companyName}</h2><p className="mt-2 text-sm text-muted-foreground">{[item.stage, item.amount].filter(Boolean).join(' · ') || t('openRaise')}</p>{item.evidence[0] && <p className="mt-3 border-l-2 border-emerald-400 pl-3 text-sm text-foreground/80">{item.evidence[0]}</p>}</div>
        <div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={onDetails}><Newspaper />{t('evidence')}</Button>{item.existingDealId ? <Button asChild size="sm" variant="secondary"><Link href={`/deals/${item.existingDealId}`}><BriefcaseBusiness />{t('openDeal')}</Link></Button> : canCreate ? <Button size="sm" onClick={onCreate}><BriefcaseBusiness />{t('createDeal')}</Button> : null}</div>
      </div>
    </article>
  )
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return <span className="rounded-full bg-muted px-3 py-1 text-xs"><strong>{value}</strong> {label}</span>
}

function DiscoveryDetails({ item, onOpenChange }: { item: DiscoveryItem | null; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('Feeds.discovery')
  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{item?.kind === 'trending' ? item.label : item?.companyName}</DialogTitle><DialogDescription>{item?.kind === 'trending' ? t('whyTrending') : t('whySignal')}</DialogDescription></DialogHeader>
        {item?.kind === 'deal_signal' && <ul className="space-y-2">{item.evidence.map(evidence => <li key={evidence} className="rounded-md bg-muted/60 px-3 py-2 text-sm">{evidence}</li>)}</ul>}
        <div><h3 className="mb-2 text-sm font-semibold">{t('sourceArticles')}</h3><ul className="space-y-2">{item?.sources.map(source => <li key={source.entryId}><a href={source.url} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm hover:bg-muted/50"><span><strong className="block">{source.title}</strong><span className="text-xs text-muted-foreground">{source.sourceTitle}</span></span><ExternalLink className="h-4 w-4 shrink-0" /></a></li>)}</ul></div>
      </DialogContent>
    </Dialog>
  )
}
