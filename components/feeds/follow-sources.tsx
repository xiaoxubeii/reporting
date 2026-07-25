'use client'

import { FormEvent, useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { AlertCircle, ChevronDown, Globe2, Loader2, Plus, Rss, Search, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FeedsStatePanel } from './state-panel'
import { ExploreSourceCatalog } from './explore-source-catalog'
import { FollowCategoryPopover } from './follow-category-popover'
import { FollowingSourceActions } from './following-source-actions'
import { filterFollowingSources, groupFollowingSources } from './following-groups'
import {
  feedErrorMessageKey,
  feedsRequest,
  type ConnectionStatus,
  type DiscoveredFeed,
  type FeedCategoryResult,
  type FeedEndpointResult,
  type FeedSourceResult,
  type FeedTopicResult,
} from './api'

export function FollowSources() {
  const locale = useLocale()
  const t = useTranslations('Feeds.sources')
  const feedError = useTranslations('Feeds.errors')
  const canManageSources = true
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const followingGroupIdPrefix = useId()
  const isFollowingView = searchParams.get('view') === 'following'
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [sources, setSources] = useState<FeedSourceResult[]>([])
  const [topics, setTopics] = useState<FeedTopicResult[]>([])
  const [categories, setCategories] = useState<FeedCategoryResult[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [exploreQuery, setExploreQuery] = useState('')
  const [followingQuery, setFollowingQuery] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState<DiscoveredFeed[]>([])
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0)
  const [personalCatalogStale, setPersonalCatalogStale] = useState(false)

  useEffect(() => {
    setLoadError(null)
    setRowError({})
    setAnnouncement('')
    setDiscoveryError(null)
  }, [locale])

  async function loadCatalog() {
    const catalog = await feedsRequest<{ sources: FeedSourceResult[]; topics: FeedTopicResult[]; categories?: FeedCategoryResult[] }>('/api/feeds/sources')
    setSources(catalog.sources ?? [])
    setTopics(catalog.topics ?? [])
    setCategories(catalog.categories ?? (catalog.topics ?? []).map(item => ({ id: item.id, name: item.name })))
    setPersonalCatalogStale(false)
  }

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const status = await feedsRequest<ConnectionStatus>('/api/feeds/connection')
      setConnection(status)
      if (status.connected) {
        await loadCatalog()
      } else {
        setSources([])
        setTopics([])
        setCategories([])
      }
    } catch (value) {
      setLoadError(feedError(feedErrorMessageKey(value)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isFollowingView && personalCatalogStale && connection?.connected) void loadCatalog().catch(value => {
      setLoadError(feedError(feedErrorMessageKey(value)))
    })
  }, [isFollowingView, personalCatalogStale]) // eslint-disable-line react-hooks/exhaustive-deps

  async function connect(event: FormEvent) {
    event.preventDefault()
    if (!token.trim()) return
    setConnecting(true)
    setLoadError(null)
    try {
      await feedsRequest('/api/feeds/connection', { method: 'POST', body: JSON.stringify({ apiToken: token.trim() }) })
      setToken('')
      setAnnouncement(t('announcements.connected'))
      await load()
    } catch (value) {
      setLoadError(feedError(feedErrorMessageKey(value)))
    } finally {
      setConnecting(false)
    }
  }

  async function provision() {
    if (connecting) return
    setConnecting(true)
    setLoadError(null)
    try {
      await feedsRequest('/api/feeds/connection', { method: 'POST', body: JSON.stringify({}) })
      setAnnouncement(t('announcements.accountReady'))
      await load()
    } catch (value) {
      setLoadError(feedError(feedErrorMessageKey(value)))
    } finally {
      setConnecting(false)
    }
  }

  async function discover(event: FormEvent) {
    event.preventDefault()
    const value = exploreQuery.trim()
    if (!value || !looksLikeUrl(value)) return
    setDiscovering(true)
    setDiscoveryError(null)
    try {
      const data = await feedsRequest<{ results: DiscoveredFeed[] }>('/api/feeds/discover', {
        method: 'POST',
        body: JSON.stringify({ url: value }),
      })
      setDiscovered(data.results ?? [])
      if (!data.results?.length) setAnnouncement(t('announcements.noFeeds'))
    } catch (value) {
      setDiscoveryError(feedError(feedErrorMessageKey(value)))
    } finally {
      setDiscovering(false)
    }
  }

  async function follow(feed: FollowTarget, key: string, category: string | null): Promise<boolean> {
    setPending(current => new Set(current).add(key))
    setRowError(current => ({ ...current, [key]: '' }))
    try {
      try {
        await feedsRequest('/api/feeds/subscriptions', {
          method: 'POST',
          body: JSON.stringify({
            feedUrl: feed.url,
            title: feed.title,
            format: feed.type ?? null,
            siteUrl: feed.siteUrl ?? exploreQuery,
            topic: category,
          }),
        })
      } catch (value) {
        setRowError(current => ({ ...current, [key]: feedError(feedErrorMessageKey(value)) }))
        return false
      }
      setDiscovered(current => current.map(item => item.url === feed.url ? { ...item, isFollowing: true } : item))
      setAnnouncement(t('announcements.followed', { title: feed.title }))
      setCatalogRefreshKey(current => current + 1)
      try {
        await loadCatalog()
      } catch (value) {
        setLoadError(feedError(feedErrorMessageKey(value)))
      }
      return true
    } finally {
      setPending(current => { const next = new Set(current); next.delete(key); return next })
    }
  }

  async function unfollow(endpoint: FeedEndpointResult, key: string) {
    if (!endpoint.subscriptionId) return
    setPending(current => new Set(current).add(key))
    setRowError(current => ({ ...current, [key]: '' }))
    try {
      await feedsRequest(`/api/feeds/subscriptions/${encodeURIComponent(endpoint.subscriptionId)}`, { method: 'DELETE' })
      await loadCatalog()
      setAnnouncement(t('announcements.unfollowed', { title: endpoint.title }))
    } catch (value) {
      setRowError(current => ({ ...current, [key]: feedError(feedErrorMessageKey(value)) }))
    } finally {
      setPending(current => { const next = new Set(current); next.delete(key); return next })
    }
  }

  const filteredSources = useMemo(() => filterFollowingSources(sources, followingQuery), [followingQuery, sources])
  const followingGroups = useMemo(
    () => groupFollowingSources(filteredSources, topics, t('categoryMenu.uncategorized')),
    [filteredSources, t, topics],
  )

  function invalidatePersonalCatalog() {
    setPersonalCatalogStale(true)
    setCatalogRefreshKey(current => current + 1)
    if (connection?.connected) void loadCatalog().catch(value => {
      setLoadError(feedError(feedErrorMessageKey(value)))
    })
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header className="pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </header>

      <p className="sr-only" aria-live="polite">{announcement}</p>

      <nav className="mt-6 flex gap-7 border-b" aria-label={t('views.label')}>
        <Link href={pathname} scroll={false} className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${!isFollowingView ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`} aria-current={!isFollowingView ? 'page' : undefined}>
          {t('views.explore')}
        </Link>
        <Link href={`${pathname}?view=following`} scroll={false} className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${isFollowingView ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`} aria-current={isFollowingView ? 'page' : undefined}>
          {t('views.following')}
        </Link>
      </nav>

      {!isFollowingView && (
        <form onSubmit={discover} className="mt-4">
          <Label htmlFor="source-search" className="sr-only">{t('discovery.label')}</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input id="source-search" value={exploreQuery} onChange={event => { setExploreQuery(event.target.value); setDiscovered([]); setDiscoveryError(null) }} placeholder={t('discovery.placeholder')} className="h-14 pl-12 pr-14 text-base sm:pr-32" />
            <Button type="submit" size="sm" className="absolute right-2 top-2.5 px-3 sm:px-4" aria-label={t('discovery.action')} disabled={!looksLikeUrl(exploreQuery) || discovering || !connection?.connected}>
              {discovering ? <Loader2 className="animate-spin" /> : <Globe2 />} <span className="hidden sm:inline">{t('discovery.action')}</span>
            </Button>
          </div>
        </form>
      )}

      {isFollowingView && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Label htmlFor="following-source-search" className="sr-only">{t('followingSearch.label')}</Label>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="following-source-search"
              type="search"
              value={followingQuery}
              onChange={event => setFollowingQuery(event.target.value)}
              placeholder={t('followingSearch.placeholder')}
              className="h-12 pl-12 text-base"
            />
          </div>
          <Button asChild variant="outline" className="h-12 shrink-0">
            <Link href={pathname} scroll={false}>
              <Plus />
              {t('followingSearch.addSource')}
            </Link>
          </Button>
        </div>
      )}

      {!isFollowingView && discoveryError && <div className="mt-5 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert"><AlertCircle className="h-4 w-4" />{discoveryError}</div>}

      {!isFollowingView && looksLikeUrl(exploreQuery) && discovered.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t('discovered.title')}</h2>
          <div className="mt-3 divide-y rounded-lg border">
            {discovered.map(feed => {
              const key = `discover:${feed.url}`
              return (
                <div key={feed.url} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted"><Rss className="h-5 w-5 text-muted-foreground" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{feed.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{feed.url}</p>
                  </div>
                  {canManageSources && connection?.connected ? (
                    <FollowCategoryPopover categories={categories} pending={pending.has(key)} error={rowError[key]} following={feed.isFollowing} onFollow={category => follow(feed, key, category)} />
                  ) : <span className="text-xs font-medium text-muted-foreground">{t('readOnly')}</span>}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {!isFollowingView && (
        <ExploreSourceCatalog
          query={looksLikeUrl(exploreQuery) ? '' : exploreQuery}
          personalConnected={Boolean(connection?.connected)}
          personalConnectionLoading={loading}
          personalConnectionError={loadError && !connection ? loadError : null}
          canManageSources={canManageSources && Boolean(connection?.canManage)}
          personalCategories={categories}
          refreshKey={catalogRefreshKey}
          onRetryConnection={() => void load()}
          onPersonalCatalogInvalidated={invalidatePersonalCatalog}
        />
      )}

      {isFollowingView && loading && <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {isFollowingView && !loading && loadError && !connection && <div className="mt-6"><FeedsStatePanel tone="error" title={t('states.loadError.title')} description={loadError} actionLabel={t('retry')} onAction={load} /></div>}

      {isFollowingView && !loading && connection && !connection.baseUrlConfigured && (
        <div className="mt-6"><FeedsStatePanel tone="error" title={t('states.notConfigured.title')} description={t('states.notConfigured.description')} /></div>
      )}

      {isFollowingView && !loading && connection?.managed && connection.baseUrlConfigured && !connection.connected && (
        <div className="mt-6">
          <FeedsStatePanel
            tone="error"
            title={t('states.accountNotReady.title')}
            description={loadError ?? t('states.accountNotReady.description')}
            actionLabel={connecting ? t('states.accountNotReady.provisioning') : t('states.accountNotReady.action')}
            onAction={provision}
          />
        </div>
      )}

      {isFollowingView && !loading && connection?.baseUrlConfigured && !connection.connected && !connection.managed && (
        <section className="mt-8 rounded-lg border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-muted p-2"><Unplug className="h-5 w-5 text-muted-foreground" /></div>
            <div className="flex-1">
              <h2 className="font-semibold">{t('connect.title')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('connect.description')}</p>
              {canManageSources ? (
                <form onSubmit={connect} className="mt-5 max-w-xl space-y-3">
                  <Label htmlFor="miniflux-token">{t('connect.tokenLabel')}</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input id="miniflux-token" type="password" value={token} onChange={event => setToken(event.target.value)} autoComplete="new-password" placeholder={t('connect.tokenPlaceholder')} />
                    <Button type="submit" disabled={connecting || !token.trim()}>{connecting && <Loader2 className="animate-spin" />} {t('connect.action')}</Button>
                  </div>
                </form>
              ) : (
                <p className="mt-4 text-sm font-medium">{t('connect.readOnly')}</p>
              )}
              {loadError && <p className="mt-3 text-sm text-destructive" role="alert">{loadError}</p>}
            </div>
          </div>
        </section>
      )}

      {isFollowingView && !loading && connection?.connected && (
        <>
          {loadError && <div className="mt-5 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert"><AlertCircle className="h-4 w-4" />{loadError}</div>}

          <section className="mt-8" aria-label={t('followingSearch.resultsLabel')}>
            <p className="sr-only">{t('sourceCount', { count: filteredSources.length })}</p>
            {filteredSources.length === 0 ? (
              <div className="mt-4"><FeedsStatePanel title={followingQuery ? t('empty.noMatchTitle', { query: followingQuery }) : t('empty.noneTitle')} description={followingQuery ? t('empty.noMatchDescription') : t('empty.noneDescription')} /></div>
            ) : (
              <div className="space-y-4">
                {followingGroups.map((group, index) => {
                  const headingId = `${followingGroupIdPrefix}-group-${index}`
                  return (
                    <details key={group.key} open className="group overflow-hidden rounded-lg border bg-card">
                      <summary aria-labelledby={headingId} className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
                        <span className="flex min-w-0 items-center gap-2">
                          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                          <span id={headingId} className="truncate text-sm font-semibold">{group.label}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{t('sourceCount', { count: group.sources.length })}</span>
                      </summary>
                      <SourceList
                        sources={group.sources}
                        pending={pending}
                        rowError={rowError}
                        canManage={canManageSources}
                        onCopied={(endpoint, key) => {
                          setRowError(current => ({ ...current, [key]: '' }))
                          setAnnouncement(t('announcements.rssCopied', { title: endpoint.title }))
                        }}
                        onActionError={(key, message) => setRowError(current => ({ ...current, [key]: message }))}
                        onUnfollow={unfollow}
                      />
                    </details>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

type FollowTarget = { url: string; title: string; type?: string; siteUrl?: string | null }

function SourceList({ sources, pending, rowError, canManage, onCopied, onActionError, onUnfollow }: {
  sources: FeedSourceResult[]
  pending: Set<string>
  rowError: Record<string, string>
  canManage: boolean
  onCopied: (endpoint: FeedEndpointResult, key: string) => void
  onActionError: (key: string, message: string) => void
  onUnfollow: (endpoint: FeedEndpointResult, key: string) => void
}) {
  const t = useTranslations('Feeds.sources')
  return (
    <div className="divide-y border-t">
      {sources.flatMap(source => source.endpoints.map(endpoint => {
              const key = `endpoint:${endpoint.id}`
              const endpointTitle = source.endpoints.length > 1
                ? endpoint.title.trim() !== source.name.trim()
                  ? endpoint.title
                  : sourcePath(endpoint.feedUrl)
                : null
              const metadata = [
                endpointTitle,
                sourceHost(source.siteUrl ?? endpoint.feedUrl),
                endpoint.format?.toUpperCase(),
              ].filter(Boolean).join(' · ')
              return (
                <div key={`${source.id}:${endpoint.id}`} className="flex min-h-[4.75rem] items-center gap-3 px-4 py-3 sm:gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/50">
                    {source.logoUrl ? <img src={source.logoUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <span className="text-sm font-semibold text-muted-foreground">{source.name.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{source.name}</p>
                    {metadata && <p className="mt-0.5 truncate text-xs text-muted-foreground">{metadata}</p>}
                    {endpoint.health !== 'healthy' && endpoint.health !== 'unknown' && <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">{endpoint.health === 'degraded' ? t('health.degraded') : t('health.unavailable')}</p>}
                    {rowError[key] && <p className="mt-1 text-xs text-destructive" role="alert">{rowError[key]}</p>}
                  </div>
                  {canManage ? (
                    <FollowingSourceActions
                      sourceName={source.name}
                      siteUrl={source.siteUrl}
                      feedUrl={endpoint.feedUrl}
                      endpointLabel={endpointTitle}
                      pending={pending.has(key)}
                      onCopied={() => onCopied(endpoint, key)}
                      onError={message => onActionError(key, message)}
                      onUnfollow={() => onUnfollow(endpoint, key)}
                    />
                  ) : <span className="text-xs font-medium text-muted-foreground">{t('readOnly')}</span>}
                </div>
              )
            }))}
    </div>
  )
}

function sourceHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

function sourcePath(value: string): string {
  try {
    const url = new URL(value)
    return `${url.pathname}${url.search}` || url.hostname
  } catch {
    return value
  }
}

function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) || /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(trimmed)
}
