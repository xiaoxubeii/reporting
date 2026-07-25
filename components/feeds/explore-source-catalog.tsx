'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ExternalLink, Loader2, Rss } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { FeedsStatePanel } from './state-panel'
import { FollowCategoryPopover } from './follow-category-popover'
import {
  feedErrorMessageKey,
  feedsRequest,
  type ExploreCategoryResult,
  type ExploreSourceResult,
  type FeedCategoryResult,
} from './api'

interface ExploreSourceCatalogProps {
  query: string
  personalConnected: boolean
  personalConnectionLoading: boolean
  personalConnectionError: string | null
  canManageSources: boolean
  personalCategories: FeedCategoryResult[]
  refreshKey: number
  onRetryConnection: () => void
  onPersonalCatalogInvalidated: () => void
}

export function ExploreSourceCatalog({
  query,
  personalConnected,
  personalConnectionLoading,
  personalConnectionError,
  canManageSources,
  personalCategories,
  refreshKey,
  onRetryConnection,
  onPersonalCatalogInvalidated,
}: ExploreSourceCatalogProps) {
  const locale = useLocale()
  const t = useTranslations('Feeds.sources')
  const feedError = useTranslations('Feeds.errors')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const categoryRef = searchParams.get('category')
  const [categories, setCategories] = useState<ExploreCategoryResult[]>([])
  const [sources, setSources] = useState<ExploreSourceResult[]>([])
  const [followedSourceIds, setFollowedSourceIds] = useState<Set<string>>(new Set())
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [followingLoading, setFollowingLoading] = useState(true)
  const [catalogReloadKey, setCatalogReloadKey] = useState(0)
  const [followingRefreshKey, setFollowingRefreshKey] = useState(0)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [followingError, setFollowingError] = useState<string | null>(null)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [announcement, setAnnouncement] = useState('')
  const requestGeneration = useRef(0)

  useEffect(() => {
    setCatalogError(null)
    setSourceError(null)
    setFollowingError(null)
    setRowError({})
    setAnnouncement('')
  }, [locale])

  useEffect(() => {
    let cancelled = false
    async function loadCatalog() {
      setCatalogLoading(true)
      try {
        const result = await feedsRequest<{ categories: ExploreCategoryResult[] }>('/api/feeds/explore/categories')
        if (cancelled) return
        setCategories(result.categories ?? [])
        setCatalogError(null)
      } catch (value) {
        if (!cancelled) setCatalogError(feedError(feedErrorMessageKey(value)))
      } finally {
        if (!cancelled) setCatalogLoading(false)
      }
    }
    void loadCatalog()
    return () => { cancelled = true }
  }, [catalogReloadKey, feedError])

  useEffect(() => {
    if (personalConnectionLoading || personalConnectionError || !personalConnected) {
      setFollowingLoading(false)
      setFollowingError(null)
      setFollowedSourceIds(new Set())
      return
    }
    let cancelled = false
    async function loadFollowingState() {
      setFollowingLoading(true)
      try {
        const result = await feedsRequest<{ sourceIds: string[] }>('/api/feeds/explore/following')
        if (cancelled) return
        setFollowedSourceIds(new Set(result.sourceIds ?? []))
        setFollowingError(null)
      } catch (value) {
        if (!cancelled) setFollowingError(feedError(feedErrorMessageKey(value)))
      } finally {
        if (!cancelled) setFollowingLoading(false)
      }
    }
    void loadFollowingState()
    return () => { cancelled = true }
  }, [feedError, followingRefreshKey, personalConnected, personalConnectionError, personalConnectionLoading, refreshKey])

  useEffect(() => {
    const search = query.trim()
    if (!categoryRef && !search) {
      requestGeneration.current += 1
      setSources([])
      setSourceError(null)
      setSourcesLoading(false)
      return
    }
    const generation = ++requestGeneration.current
    const timer = window.setTimeout(async () => {
      setSourcesLoading(true)
      setSourceError(null)
      const params = new URLSearchParams()
      if (categoryRef) params.set('category', categoryRef)
      if (search) params.set('q', search)
      try {
        const data = await feedsRequest<{ sources: ExploreSourceResult[] }>(`/api/feeds/explore/sources?${params.toString()}`)
        if (generation !== requestGeneration.current) return
        setSources(data.sources ?? [])
      } catch (value) {
        if (generation !== requestGeneration.current) return
        setSourceError(feedError(feedErrorMessageKey(value)))
        setSources([])
      } finally {
        if (generation === requestGeneration.current) setSourcesLoading(false)
      }
    }, categoryRef ? 0 : 250)
    return () => window.clearTimeout(timer)
  }, [categoryRef, feedError, query])

  const selectedCategory = useMemo(
    () => categories.find(category => category.id === categoryRef) ?? null,
    [categories, categoryRef],
  )
  const canFollow = personalConnected && canManageSources && !personalConnectionLoading && !personalConnectionError && !followingLoading && !followingError
  const isSearching = Boolean(query.trim()) && !categoryRef
  const followStatusError = personalConnectionError ?? (personalConnected ? followingError : null)
  const retryFollowState = personalConnectionError
    ? onRetryConnection
    : followingError
      ? () => setFollowingRefreshKey(current => current + 1)
      : null

  function openCategory(id: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('topic')
    params.set('category', id)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function closeCategory() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('category')
    router.push(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false })
  }

  async function follow(sourceId: string, title: string, category: string | null): Promise<boolean> {
    if (!canFollow || pending.has(sourceId)) return false
    setPending(current => new Set(current).add(sourceId))
    setRowError(current => ({ ...current, [sourceId]: '' }))
    try {
      await feedsRequest(`/api/feeds/explore/sources/${encodeURIComponent(sourceId)}/follow`, {
        method: 'POST',
        body: JSON.stringify({ topic: category }),
      })
      setFollowedSourceIds(current => {
        const next = new Set(current)
        next.add(sourceId)
        return next
      })
      setAnnouncement(t('announcements.followed', { title }))
      onPersonalCatalogInvalidated()
      return true
    } catch (value) {
      setRowError(current => ({ ...current, [sourceId]: feedError(feedErrorMessageKey(value)) }))
      return false
    } finally {
      setPending(current => {
        const next = new Set(current)
        next.delete(sourceId)
        return next
      })
    }
  }

  return (
    <section className="mt-8" aria-labelledby="explore-sources-heading">
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <div>
        <h2 id="explore-sources-heading" className="text-xl font-semibold tracking-tight">
          {isSearching ? t('searchResults') : t('exploreHeading')}
        </h2>
      </div>

      {!followingLoading && !personalConnectionLoading && (!personalConnected || followingError || personalConnectionError) && (
        <div className="mt-3 flex flex-wrap items-center gap-3" role="status">
          <p className="text-sm text-muted-foreground">
            {followStatusError ?? t('catalog.followUnavailable')}
          </p>
          {retryFollowState && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={retryFollowState}
            >
              {personalConnectionError ? t('retry') : t('catalog.retryFollowing')}
            </Button>
          )}
        </div>
      )}

      {catalogLoading && !isSearching && (
        <div className="flex min-h-56 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      )}
      {!catalogLoading && catalogError && !isSearching && (
        <div className="mt-4">
          <FeedsStatePanel
            tone="error"
            title={t('catalog.loadErrorTitle')}
            description={catalogError}
            actionLabel={t('retry')}
            onAction={() => setCatalogReloadKey(current => current + 1)}
          />
        </div>
      )}
      {!catalogLoading && !catalogError && !isSearching && (
        categories.length ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map(category => (
              <button
                key={category.id}
                type="button"
                onClick={() => openCategory(category.id)}
                className="group min-h-36 rounded-xl border bg-card p-5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-sm font-normal leading-normal tracking-normal">
                  #{categoryLabel(category.title)}
                </span>
                <div className="mt-8 flex items-center gap-3">
                  <SourceMark title={category.featuredSource.title} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t('featured')}</p>
                    <p className="truncate text-sm font-medium text-muted-foreground group-hover:text-foreground">{category.featuredSource.title}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : <div className="mt-4"><FeedsStatePanel title={t('catalog.emptyTitle')} description={t('catalog.emptyDescription')} /></div>
      )}

      {isSearching && (
        <SourceResults
          sources={sources}
          loading={sourcesLoading}
          error={sourceError}
          emptyTitle={t('empty.noMatchTitle', { query })}
          emptyDescription={t('empty.noMatchDescription')}
          followedSourceIds={followedSourceIds}
          pending={pending}
          rowError={rowError}
          canFollow={canFollow}
          personalCategories={personalCategories}
          onFollow={follow}
        />
      )}

      <Sheet open={Boolean(categoryRef)} onOpenChange={open => { if (!open) closeCategory() }}>
        <SheetContent
          side="right"
          overlayClassName="bg-black/35"
          className="w-screen max-w-none overflow-y-auto p-0 sm:w-[80vw] sm:max-w-[760px]"
          dialogTitle={selectedCategory ? `#${categoryLabel(selectedCategory.title)}` : t('categorySheet.titleFallback')}
          dialogDescription={t('categorySheet.dialogDescription')}
        >
          <div className="px-5 py-8 md:px-10">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('categorySheet.label')}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              {selectedCategory ? `#${categoryLabel(selectedCategory.title)}` : t('categorySheet.titleFallback')}
            </h2>
            <SourceResults
              sources={sources}
              loading={sourcesLoading}
              error={sourceError}
              emptyTitle={t('categorySheet.emptyTitle')}
              emptyDescription={t('categorySheet.emptyDescription')}
              followedSourceIds={followedSourceIds}
              pending={pending}
              rowError={rowError}
              canFollow={canFollow}
              personalCategories={personalCategories}
              onFollow={follow}
            />
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}

function SourceResults({ sources, loading, error, emptyTitle, emptyDescription, followedSourceIds, pending, rowError, canFollow, personalCategories, onFollow }: {
  sources: ExploreSourceResult[]
  loading: boolean
  error: string | null
  emptyTitle: string
  emptyDescription: string
  followedSourceIds: Set<string>
  pending: Set<string>
  rowError: Record<string, string>
  canFollow: boolean
  personalCategories: FeedCategoryResult[]
  onFollow: (sourceId: string, title: string, category: string | null) => Promise<boolean>
}) {
  const t = useTranslations('Feeds.sources')
  if (loading) return <div className="flex min-h-40 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  if (error) return <div className="mt-5"><FeedsStatePanel tone="error" title={t('catalog.sourcesErrorTitle')} description={error} /></div>
  if (!sources.length) return <div className="mt-5"><FeedsStatePanel title={emptyTitle} description={emptyDescription} /></div>
  return (
    <div className="mt-5 divide-y rounded-xl border bg-card">
      {sources.map(source => {
        const following = followedSourceIds.has(source.id)
        const isPending = pending.has(source.id)
        return (
          <div key={source.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
            <SourceMark title={source.title} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-semibold">{source.title}</h3>
                {source.siteUrl && <a href={source.siteUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={t('openWebsite', { name: source.title })}><ExternalLink className="size-3.5" /></a>}
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">#{categoryLabel(source.category.title)}</p>
              {rowError[source.id] && <p className="mt-2 text-sm text-destructive" role="alert">{rowError[source.id]}</p>}
            </div>
            <FollowCategoryPopover
              categories={personalCategories}
              pending={isPending}
              disabled={!canFollow}
              following={following}
              onFollow={category => onFollow(source.id, source.title, category)}
            />
          </div>
        )
      })}
    </div>
  )
}

function SourceMark({ title }: { title: string }) {
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-muted/50" aria-hidden="true">
      <span className="font-semibold text-muted-foreground">{title.trim().slice(0, 1).toLocaleUpperCase() || <Rss className="size-5" />}</span>
    </div>
  )
}

function categoryLabel(title: string): string {
  return title.replace(/^#+/, '')
}
