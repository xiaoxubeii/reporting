'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Bookmark, BookmarkCheck, CheckCheck, Loader2, RefreshCw, Rss, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FeedReaderSheet } from './feed-reader-sheet'
import { ExploreFeed } from './explore-feed'
import { FeedRowsSkeleton, FeedsStatePanel } from './state-panel'
import { TodayViewTabs } from './today-view-tabs'
import { feedsRequest, type EntriesPayload, FeedsApiError } from './api'
import {
  groupFeedEntriesByCategory,
  mergeFeedEntryPages,
  shouldResetFeedPagination,
  type FeedEntryView,
  type FeedFilter,
} from '@/lib/feeds/today-state'

export function TodayFeed() {
  const searchParams = useSearchParams()
  const isExplore = searchParams.get('view') === 'explore'
  return isExplore ? <ExploreFeed /> : <PersonalTodayFeed />
}

function PersonalTodayFeed() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const entryId = searchParams.get('entry')
  const [entries, setEntries] = useState<FeedEntryView[]>([])
  const [total, setTotal] = useState(0)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [connected, setConnected] = useState(true)
  const [hasSubscriptions, setHasSubscriptions] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FeedFilter>('unread')
  const [query, setQuery] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const openedFromList = useRef(false)

  const load = useCallback(async (offset = 0, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '30', offset: String(offset), filter })
      if (query.trim()) params.set('q', query.trim())
      const data = await feedsRequest<EntriesPayload>(`/api/feeds/entries?${params.toString()}`)
      setEntries(current => append ? mergeFeedEntryPages(current, data.items) : data.items)
      setTotal(data.total)
      setNextOffset(data.nextOffset)
      setConnected(data.connected)
      setHasSubscriptions(data.hasSubscriptions)
      setAnnouncement(append ? 'More articles loaded' : 'Articles refreshed')
    } catch (value) {
      const message = value instanceof Error ? value.message : 'Articles could not be loaded'
      setError(message)
      if (value instanceof FeedsApiError && ['not_configured', 'authentication'].includes(value.detail.code)) {
        setConnected(false)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }, [filter, query])

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load() }, query.trim() ? 250 : 0)
    return () => window.clearTimeout(timeout)
  }, [load, query])

  const visible = entries
  const selectedId = entryId ? Number(entryId) : null
  const selected = selectedId ? entries.find(item => item.upstreamId === selectedId) ?? null : null
  const grouped = useMemo(() => groupFeedEntriesByCategory(visible), [visible])

  function openEntry(entry: FeedEntryView) {
    openedFromList.current = true
    const params = new URLSearchParams(searchParams.toString())
    params.set('entry', String(entry.upstreamId))
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function closeReader() {
    if (openedFromList.current) {
      openedFromList.current = false
      router.back()
      return
    }
    const params = new URLSearchParams(searchParams.toString())
    params.delete('entry')
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false })
  }

  function mergeState(updated: FeedEntryView) {
    setEntries(current => current.map(item => item.externalId === updated.externalId ? updated : item))
  }

  async function resetFilteredPage() {
    await load(0, false)
  }

  async function toggleSaved(entry: FeedEntryView) {
    const previous = entry
    const optimistic = { ...entry, isSaved: !entry.isSaved }
    mergeState(optimistic)
    try {
      const data = await feedsRequest<{ state: { isRead: boolean; isSaved: boolean } }>(
        `/api/feeds/entries/${encodeURIComponent(entry.upstreamId)}/state`,
        { method: 'PATCH', body: JSON.stringify({ isSaved: !entry.isSaved }) },
      )
      const updated = { ...optimistic, ...data.state }
      mergeState(updated)
      if (shouldResetFeedPagination(filter, { isSaved: updated.isSaved })) await resetFilteredPage()
      setAnnouncement(data.state.isSaved ? 'Article saved' : 'Article removed from saved')
    } catch {
      mergeState(previous)
      setAnnouncement('Article state could not be updated')
    }
  }

  async function markVisibleRead() {
    const unread = entries.filter(item => !item.isRead)
    if (!unread.length) return
    setEntries(current => current.map(item => ({ ...item, isRead: true })))
    const results = await Promise.allSettled(unread.map(item => feedsRequest(
      `/api/feeds/entries/${encodeURIComponent(item.upstreamId)}/state`,
      { method: 'PATCH', body: JSON.stringify({ isRead: true }) },
    )))
    await resetFilteredPage()
    if (results.some(result => result.status === 'rejected')) {
      setAnnouncement('Some articles could not be marked read')
    } else {
      setAnnouncement('All loaded articles marked read')
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-muted-foreground">The latest from sources you follow.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={markVisibleRead} disabled={!entries.some(item => !item.isRead)}>
            <CheckCheck /> Mark all as read
          </Button>
          <Button variant="outline" size="icon" aria-label="Refresh articles" onClick={() => { setRefreshing(true); void load() }} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />
          </Button>
        </div>
      </header>

      <TodayViewTabs active="me" />

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="inline-flex w-fit rounded-md bg-muted p-1" aria-label="Article filter">
          {(['unread', 'all', 'saved'] as FeedFilter[]).map(value => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`min-h-9 rounded px-3 text-sm font-medium capitalize transition-colors ${filter === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >{value}</button>
          ))}
        </div>
        <label className="relative block w-full md:max-w-xs">
          <span className="sr-only">Search articles</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search articles" className="pl-9" />
        </label>
      </div>

      <p className="sr-only" aria-live="polite">{announcement}</p>

      <div className="mt-6">
        {loading && <FeedRowsSkeleton />}
        {!loading && !connected && (
          <FeedsStatePanel title="Connect Miniflux to start reading" description="Connect your personal non-admin Miniflux account before articles can be loaded." actionLabel="Open Follow sources" actionHref="/feeds/sources" />
        )}
        {!loading && connected && !hasSubscriptions && (
          <FeedsStatePanel title="No sources followed yet" description="Follow trusted publications and their latest articles will appear here." actionLabel="Follow sources" actionHref="/feeds/sources" />
        )}
        {!loading && error && connected && (
          <FeedsStatePanel tone="error" title="Articles could not be loaded" description={error} actionLabel="Retry" onAction={() => load()} />
        )}
        {!loading && !error && connected && hasSubscriptions && visible.length === 0 && (
          <FeedsStatePanel
            title={nextOffset !== null ? 'No matching articles on this page' : filter === 'unread' ? "You're all caught up" : 'No articles match these filters'}
            description={nextOffset !== null ? 'More articles are available from followed sources.' : filter === 'unread' ? 'There are no unread articles in the loaded feed.' : 'Try another filter or search term.'}
            actionLabel={nextOffset !== null ? 'Load more' : filter === 'unread' ? 'Show all' : 'Clear filters'}
            onAction={() => {
              if (nextOffset !== null) {
                void load(nextOffset, true)
                return
              }
              setFilter('all')
              setQuery('')
            }}
          />
        )}
        {!loading && !error && visible.length > 0 && (
          <div>
            {grouped.map(group => (
              <section key={group.key} className="mb-7">
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">{group.label}</h2>
                <div className="divide-y border-y">
                  {group.items.map(entry => (
                    <article key={entry.externalId} className="relative flex gap-4 py-5">
                      {!entry.isRead && <span className="absolute -left-3 top-8 h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
                      <div className="flex h-[72px] w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/50">
                        {entry.imageUrl
                          ? <img src={entry.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                          : <Rss className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <button type="button" onClick={() => openEntry(entry)} className={`line-clamp-2 text-left text-base leading-5 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${entry.isRead ? 'font-medium text-foreground/80' : 'font-semibold'}`}>
                          {entry.title}
                        </button>
                        <p className="mt-1 text-xs text-muted-foreground">{entry.source.title} · {relativeTime(entry.publishedAt ?? entry.createdAt)}</p>
                        {entry.summary && <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{entry.summary}</p>}
                      </div>
                      <Button variant="ghost" size="icon" aria-label={entry.isSaved ? 'Remove from saved' : 'Save for later'} onClick={() => toggleSaved(entry)}>
                        {entry.isSaved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
                      </Button>
                    </article>
                  ))}
                </div>
              </section>
            ))}
            <div className="flex items-center justify-between py-2">
              <p className="text-xs text-muted-foreground">Showing {entries.length} of {total}</p>
              {nextOffset !== null && (
                <Button variant="outline" onClick={() => load(nextOffset, true)} disabled={loadingMore}>
                  {loadingMore && <Loader2 className="animate-spin" />} Load more
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <FeedReaderSheet
        entry={selected}
        entryId={entryId}
        open={!!entryId}
        onOpenChange={open => { if (!open) closeReader() }}
        onStateChange={mergeState}
        onStateCommitted={async patch => {
          if (shouldResetFeedPagination(filter, patch)) await resetFilteredPage()
        }}
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
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
