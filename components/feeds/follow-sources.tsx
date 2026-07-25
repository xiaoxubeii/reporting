'use client'

import { FormEvent, useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { AlertCircle, ExternalLink, Globe2, Loader2, Rss, Search, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FeedsStatePanel } from './state-panel'
import { ExploreSourceCatalog } from './explore-source-catalog'
import { FollowCategoryPopover } from './follow-category-popover'
import { groupFollowingSources } from './following-groups'
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
  const [query, setQuery] = useState('')
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
    const value = query.trim()
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
            siteUrl: feed.siteUrl ?? query,
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

  const filteredSources = useMemo(() => {
    const value = query.trim().toLocaleLowerCase()
    if (!value || looksLikeUrl(value)) return sources
    return sources.filter(source => [source.name, source.description, source.siteUrl, ...source.topics]
      .filter(Boolean)
      .some(field => String(field).toLocaleLowerCase().includes(value)))
  }, [query, sources])
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

      <form onSubmit={discover} className="mt-4">
        <Label htmlFor="source-search" className="sr-only">{t('discovery.label')}</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input id="source-search" value={query} onChange={event => { setQuery(event.target.value); setDiscovered([]); setDiscoveryError(null) }} placeholder={t('discovery.placeholder')} className="h-14 pl-12 pr-14 text-base sm:pr-32" />
          <Button type="submit" size="sm" className="absolute right-2 top-2.5 px-3 sm:px-4" aria-label={t('discovery.action')} disabled={!looksLikeUrl(query) || discovering || !connection?.connected}>
            {discovering ? <Loader2 className="animate-spin" /> : <Globe2 />} <span className="hidden sm:inline">{t('discovery.action')}</span>
          </Button>
        </div>
      </form>

      {discoveryError && <div className="mt-5 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert"><AlertCircle className="h-4 w-4" />{discoveryError}</div>}

      {looksLikeUrl(query) && discovered.length > 0 && (
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
          query={looksLikeUrl(query) ? '' : query}
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

          <section className="mt-10">
            <div className="flex items-baseline justify-between gap-3"><h2 className="text-lg font-semibold">{query && !looksLikeUrl(query) ? t('results') : t('followedSources')}</h2><span className="text-xs text-muted-foreground">{t('sourceCount', { count: filteredSources.length })}</span></div>
            {filteredSources.length === 0 ? (
              <div className="mt-4"><FeedsStatePanel title={query ? t('empty.noMatchTitle', { query }) : t('empty.noneTitle')} description={query ? t('empty.noMatchDescription') : t('empty.noneDescription')} /></div>
            ) : (
              <div className="mt-6 space-y-8">
                {followingGroups.map((group, index) => {
                  const headingId = `${followingGroupIdPrefix}-group-${index}`
                  return (
                    <section key={group.key} aria-labelledby={headingId}>
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 id={headingId} className="font-semibold">{group.label}</h3>
                        <span className="text-xs text-muted-foreground">{t('sourceCount', { count: group.sources.length })}</span>
                      </div>
                      <SourceList sources={group.sources} categories={categories} pending={pending} rowError={rowError} canManage={canManageSources} onFollow={follow} onUnfollow={unfollow} />
                    </section>
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
type FollowHandler = (feed: FollowTarget, key: string, category: string | null) => Promise<boolean>

function SourceList({ sources, categories, pending, rowError, canManage, onFollow, onUnfollow }: {
  sources: FeedSourceResult[]
  categories: FeedCategoryResult[]
  pending: Set<string>
  rowError: Record<string, string>
  canManage: boolean
  onFollow: FollowHandler
  onUnfollow: (endpoint: FeedEndpointResult, key: string) => void
}) {
  const t = useTranslations('Feeds.sources')
  return (
    <div className="mt-4 divide-y rounded-lg border">
      {sources.map(source => (
        <div key={source.id} className="p-4 sm:p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/50">
              {source.logoUrl ? <img src={source.logoUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <span className="font-semibold text-muted-foreground">{source.name.slice(0, 1).toUpperCase()}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{source.name}</h3>
                {source.siteUrl && <a href={source.siteUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" aria-label={t('openWebsite', { name: source.name })}><ExternalLink className="h-3.5 w-3.5" /></a>}
              </div>
              {source.description && <p className="mt-1 text-sm text-muted-foreground">{source.description}</p>}
              {source.topics.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{source.topics.join(' · ')}</p>}
            </div>
          </div>
          <div className="mt-4 space-y-2 sm:ml-16">
            {source.endpoints.map(endpoint => {
              const key = `endpoint:${endpoint.id}`
              return (
                <div key={endpoint.id} className="flex flex-col gap-2 rounded-md bg-muted/30 p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{endpoint.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{endpoint.feedUrl}</p>
                    {endpoint.health !== 'healthy' && endpoint.health !== 'unknown' && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{endpoint.health === 'degraded' ? t('health.degraded') : t('health.unavailable')}</p>}
                    {endpoint.isFollowing && rowError[key] && <p className="mt-1 text-xs text-destructive" role="alert">{rowError[key]}</p>}
                  </div>
                  {canManage ? (
                    <FollowCategoryPopover
                      categories={categories}
                      pending={pending.has(key)}
                      error={rowError[key]}
                      disabled={!endpoint.isFollowing && endpoint.health === 'unavailable'}
                      following={endpoint.isFollowing}
                      size="sm"
                      onFollow={category => onFollow({ url: endpoint.feedUrl, title: endpoint.title, type: endpoint.format ?? undefined, siteUrl: source.siteUrl }, key, category)}
                      onFollowingClick={() => onUnfollow(endpoint, key)}
                    />
                  ) : <span className="text-xs font-medium text-muted-foreground">{t('readOnly')}</span>}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) || /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(trimmed)
}
