'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Check, Loader2, RefreshCw, Rss, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  feedsRequest,
  type ExploreCategoryResult,
  type ExploreEntriesPayload,
  type ExploreEntryResult,
} from './api'
import { ExploreReaderSheet } from './explore-reader-sheet'
import { FeedRowsSkeleton, FeedsStatePanel } from './state-panel'
import { TodayViewTabs } from './today-view-tabs'
import { groupExploreEntriesByCategory, mergeExploreEntryPages } from '@/lib/feeds/explore-state'

const ALL_CATEGORY_ID = 'explore-category:all'

export function ExploreFeed() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const entryId = searchParams.get('exploreEntry')
  const [categories, setCategories] = useState<ExploreCategoryResult[]>([])
  const [categoryRef, setCategoryRef] = useState<string | null>(null)
  const [entries, setEntries] = useState<ExploreEntryResult[]>([])
  const [total, setTotal] = useState(0)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [followedSources, setFollowedSources] = useState<Set<string>>(() => new Set())
  const [followStateReady, setFollowStateReady] = useState(false)
  const [followingSources, setFollowingSources] = useState<Set<string>>(() => new Set())
  const [followErrors, setFollowErrors] = useState<Record<string, string>>({})
  const [announcement, setAnnouncement] = useState('')
  const requestGeneration = useRef(0)

  const loadCategories = useCallback(async () => {
    const data = await feedsRequest<{ categories: ExploreCategoryResult[] }>(
      '/api/feeds/explore/categories',
    )
    setCategories(data.categories)
  }, [])

  const loadFollowedSources = useCallback(async () => {
    try {
      const data = await feedsRequest<{ sourceIds: string[] }>('/api/feeds/explore/following')
      setFollowedSources(new Set(data.sourceIds))
    } catch {
      // Personal Miniflux availability must not prevent curated Explore browsing.
      setFollowedSources(new Set())
    } finally {
      setFollowStateReady(true)
    }
  }, [])

  const loadEntries = useCallback(async (offset = 0, append = false) => {
    const generation = requestGeneration.current + 1
    requestGeneration.current = generation
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '30', offset: String(offset) })
      if (categoryRef) params.set('category', categoryRef)
      if (query.trim()) params.set('q', query.trim())
      const data = await feedsRequest<ExploreEntriesPayload>(
        `/api/feeds/explore/entries?${params.toString()}`,
      )
      if (generation !== requestGeneration.current) return
      setEntries(current => append ? mergeExploreEntryPages(current, data.items) : data.items)
      setTotal(data.total)
      setNextOffset(data.nextOffset)
      setAnnouncement(append ? 'More curated articles loaded' : 'Curated articles refreshed')
    } catch (value) {
      if (generation !== requestGeneration.current) return
      setError(value instanceof Error ? value.message : 'Curated articles could not be loaded')
    } finally {
      if (generation === requestGeneration.current) {
        setLoading(false)
        setLoadingMore(false)
        setRefreshing(false)
      }
    }
  }, [categoryRef, query])

  useEffect(() => {
    void loadCategories().catch(value => {
      setError(value instanceof Error ? value.message : 'Curated categories could not be loaded')
      setLoading(false)
    })
  }, [loadCategories])

  useEffect(() => { void loadFollowedSources() }, [loadFollowedSources])

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadEntries() }, query.trim() ? 250 : 0)
    return () => window.clearTimeout(timeout)
  }, [loadEntries, query])

  const selected = entryId ? entries.find(item => item.id === entryId) ?? null : null
  const groups = useMemo(() => groupExploreEntriesByCategory(entries), [entries])

  async function refreshExplore() {
    setRefreshing(true)
    setError(null)
    try {
      await Promise.all([loadCategories(), loadEntries(), loadFollowedSources()])
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Curated Explore could not be loaded')
    } finally {
      setRefreshing(false)
    }
  }

  function selectCategory(reference: string) {
    setCategoryRef(reference === ALL_CATEGORY_ID ? null : reference)
  }

  function openEntry(entry: ExploreEntryResult) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', 'explore')
    params.set('exploreEntry', entry.id)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function closeReader() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('exploreEntry')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  async function followSource(sourceId: string) {
    if (followingSources.has(sourceId) || followedSources.has(sourceId)) return
    setFollowingSources(current => new Set([...Array.from(current), sourceId]))
    setFollowErrors(current => Object.fromEntries(
      Object.entries(current).filter(([id]) => id !== sourceId),
    ))
    try {
      await feedsRequest(
        `/api/feeds/explore/sources/${encodeURIComponent(sourceId)}/follow`,
        { method: 'POST', body: '{}' },
      )
      setFollowedSources(current => new Set([...Array.from(current), sourceId]))
      setAnnouncement('Source followed in your personal feed')
    } catch (value) {
      const message = value instanceof Error ? value.message : 'Source could not be followed'
      setFollowErrors(current => ({ ...current, [sourceId]: message }))
      setAnnouncement(message)
    } finally {
      setFollowingSources(current => new Set(Array.from(current).filter(id => id !== sourceId)))
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-muted-foreground">Curated healthcare and investment intelligence.</p>
        </div>
        <Button variant="outline" size="icon" aria-label="Refresh curated articles" onClick={() => { void refreshExplore() }} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'animate-spin' : ''} />
        </Button>
      </header>

      <TodayViewTabs active="explore" />

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="Explore categories">
          <button
            type="button"
            aria-pressed={categoryRef === null}
            onClick={() => selectCategory(ALL_CATEGORY_ID)}
            className={`min-h-9 shrink-0 rounded-md border px-3 text-sm font-medium ${categoryRef === null ? 'border-foreground bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground'}`}
          >All</button>
          {categories.map(category => (
            <button
              key={category.id}
              type="button"
              aria-pressed={categoryRef === category.id}
              onClick={() => selectCategory(category.id)}
              className={`min-h-9 shrink-0 rounded-md border px-3 text-sm font-medium ${categoryRef === category.id ? 'border-foreground bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground'}`}
            >{category.title} <span className="ml-1 opacity-70">{category.sourceCount}</span></button>
          ))}
        </div>
        <label className="relative block w-full md:max-w-xs">
          <span className="sr-only">Search curated articles</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search curated articles" className="pl-9" />
        </label>
      </div>

      <p className="sr-only" aria-live="polite">{announcement}</p>

      <div className="mt-6">
        {loading && <FeedRowsSkeleton />}
        {!loading && error && (
          <FeedsStatePanel tone="error" title="Curated Explore could not be loaded" description={error} actionLabel="Retry" onAction={() => { void refreshExplore() }} />
        )}
        {!loading && !error && entries.length === 0 && (
          <FeedsStatePanel title="No curated articles match" description="Try another category or search term." actionLabel="Show all" onAction={() => { setCategoryRef(null); setQuery('') }} />
        )}
        {!loading && !error && entries.length > 0 && (
          <div>
            {groups.map(group => (
              <section key={group.key} className="mb-7">
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">Latest in {group.label}</h2>
                <div className="divide-y border-y">
                  {group.items.map(entry => {
                    const following = followingSources.has(entry.source.id)
                    const followed = followedSources.has(entry.source.id)
                    const checkingFollowState = !followStateReady
                    return (
                      <article key={entry.id} className="relative flex gap-4 py-5">
                        <div className="flex h-[72px] w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/50">
                          {entry.imageUrl
                            ? <img src={entry.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                            : <Rss className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <button type="button" onClick={() => openEntry(entry)} className="line-clamp-2 text-left text-base font-semibold leading-5 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {entry.title}
                          </button>
                          <p className="mt-1 text-xs text-muted-foreground">{entry.source.title} · {relativeTime(entry.publishedAt)}</p>
                          {entry.summary && <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{entry.summary}</p>}
                          {followErrors[entry.source.id] && <p className="mt-2 text-xs text-destructive" role="alert">{followErrors[entry.source.id]}</p>}
                        </div>
                        <Button variant={followed ? 'secondary' : 'outline'} size="sm" disabled={checkingFollowState || following || followed} onClick={() => followSource(entry.source.id)}>
                          {checkingFollowState || following ? <Loader2 className="animate-spin" /> : followed ? <Check /> : <Rss />}
                          {checkingFollowState ? 'Checking…' : following ? 'Following…' : followed ? 'Following' : 'Follow'}
                        </Button>
                      </article>
                    )
                  })}
                </div>
              </section>
            ))}
            <div className="flex items-center justify-between py-2">
              <p className="text-xs text-muted-foreground">Showing {entries.length} of {total}</p>
              {nextOffset !== null && (
                <Button variant="outline" onClick={() => loadEntries(nextOffset, true)} disabled={loadingMore}>
                  {loadingMore && <Loader2 className="animate-spin" />} Load more
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <ExploreReaderSheet
        entry={selected}
        entryId={entryId}
        open={!!entryId}
        onOpenChange={open => { if (!open) closeReader() }}
      />
    </div>
  )
}

function relativeTime(value: string | null): string {
  if (!value) return 'Unknown time'
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000))
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
