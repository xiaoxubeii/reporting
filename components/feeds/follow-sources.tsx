'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, Check, ExternalLink, Globe2, Loader2, Rss, Search, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { FeedsStatePanel } from './state-panel'
import {
  feedsRequest,
  type ConnectionStatus,
  type DiscoveredFeed,
  type FeedEndpointResult,
  type FeedSourceResult,
  type FeedTopicResult,
} from './api'

export function FollowSources() {
  const canManageSources = true
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const topicSlug = searchParams.get('topic')
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [sources, setSources] = useState<FeedSourceResult[]>([])
  const [topics, setTopics] = useState<FeedTopicResult[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState<DiscoveredFeed[]>([])
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  async function loadCatalog() {
    const catalog = await feedsRequest<{ sources: FeedSourceResult[]; topics: FeedTopicResult[] }>('/api/feeds/sources')
    setSources(catalog.sources ?? [])
    setTopics(catalog.topics ?? [])
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
      }
    } catch (value) {
      setLoadError(value instanceof Error ? value.message : 'Sources could not be loaded')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function connect(event: FormEvent) {
    event.preventDefault()
    if (!token.trim()) return
    setConnecting(true)
    setLoadError(null)
    try {
      await feedsRequest('/api/feeds/connection', { method: 'POST', body: JSON.stringify({ apiToken: token.trim() }) })
      setToken('')
      setAnnouncement('Miniflux connected')
      await load()
    } catch (value) {
      setLoadError(value instanceof Error ? value.message : 'Miniflux could not be connected')
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
      setAnnouncement('Personal Miniflux account is ready')
      await load()
    } catch (value) {
      setLoadError(value instanceof Error ? value.message : 'Feed account provisioning failed')
    } finally {
      setConnecting(false)
    }
  }

  async function discover(event: FormEvent) {
    event.preventDefault()
    const value = query.trim()
    if (!value || !looksLikeUrl(value)) return
    setDiscovering(true)
    setLoadError(null)
    try {
      const data = await feedsRequest<{ results: DiscoveredFeed[] }>('/api/feeds/discover', {
        method: 'POST',
        body: JSON.stringify({ url: value }),
      })
      setDiscovered(data.results ?? [])
      if (!data.results?.length) setAnnouncement('No feeds found for that website')
    } catch (value) {
      setLoadError(value instanceof Error ? value.message : 'Feed discovery failed')
    } finally {
      setDiscovering(false)
    }
  }

  async function follow(feed: { url: string; title: string; type?: string; siteUrl?: string | null }, key: string) {
    setPending(current => new Set(current).add(key))
    setRowError(current => ({ ...current, [key]: '' }))
    try {
      await feedsRequest('/api/feeds/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          feedUrl: feed.url,
          title: feed.title,
          format: feed.type ?? null,
          siteUrl: feed.siteUrl ?? query,
          topic: topic.trim() || null,
        }),
      })
      setDiscovered(current => current.map(item => item.url === feed.url ? { ...item, isFollowing: true } : item))
      setAnnouncement(`${feed.title} followed`)
      await loadCatalog()
    } catch (value) {
      setRowError(current => ({ ...current, [key]: value instanceof Error ? value.message : 'Follow failed' }))
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
      setAnnouncement(`${endpoint.title} unfollowed`)
    } catch (value) {
      setRowError(current => ({ ...current, [key]: value instanceof Error ? value.message : 'Unfollow failed' }))
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
  const selectedTopic = topics.find(topic => String(topic.id) === topicSlug) ?? null
  const selectedTopicSources = selectedTopic
    ? sources.filter(source => source.topics.includes(selectedTopic.name))
    : []

  function closeTopic() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('topic')
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false })
  }

  function openTopic(topicId: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('topic', String(topicId))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header className="pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Follow sources</h1>
        <p className="mt-1 text-sm text-muted-foreground">Discover and follow publications in your personal feed.</p>
      </header>

      <p className="sr-only" aria-live="polite">{announcement}</p>

      {loading && <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {!loading && loadError && !connection && <div className="mt-6"><FeedsStatePanel tone="error" title="Sources could not be loaded" description={loadError} actionLabel="Retry" onAction={load} /></div>}

      {!loading && connection && !connection.baseUrlConfigured && (
        <div className="mt-6"><FeedsStatePanel tone="error" title="Miniflux is not safely configured" description="Set the server-only Miniflux URL and confirm its feed-fetch network blocks private and metadata destinations." /></div>
      )}

      {!loading && connection?.managed && connection.baseUrlConfigured && !connection.connected && (
        <div className="mt-6">
          <FeedsStatePanel
            tone="error"
            title="Feed account is not ready"
            description={loadError ?? connection.lastError ?? 'Your personal Miniflux user and credentials are managed automatically. Retry provisioning, or ask an administrator to check the feed service.'}
            actionLabel={connecting ? 'Provisioning…' : 'Retry provisioning'}
            onAction={provision}
          />
        </div>
      )}

      {!loading && connection?.baseUrlConfigured && !connection.connected && !connection.managed && (
        <section className="mt-8 rounded-lg border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-muted p-2"><Unplug className="h-5 w-5 text-muted-foreground" /></div>
            <div className="flex-1">
              <h2 className="font-semibold">Connect your Miniflux account</h2>
              <p className="mt-1 text-sm text-muted-foreground">Use your own non-admin Miniflux user so subscriptions, read status, and saved articles remain personal. The token stays encrypted on the server.</p>
              {canManageSources ? (
                <form onSubmit={connect} className="mt-5 max-w-xl space-y-3">
                  <Label htmlFor="miniflux-token">Personal API token</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input id="miniflux-token" type="password" value={token} onChange={event => setToken(event.target.value)} autoComplete="new-password" placeholder="Paste a dedicated non-admin Miniflux token" />
                    <Button type="submit" disabled={connecting || !token.trim()}>{connecting && <Loader2 className="animate-spin" />} Connect</Button>
                  </div>
                </form>
              ) : (
                <p className="mt-4 text-sm font-medium">Your account has read-only access and cannot connect or change sources.</p>
              )}
              {loadError && <p className="mt-3 text-sm text-destructive" role="alert">{loadError}</p>}
            </div>
          </div>
        </section>
      )}

      {!loading && connection?.connected && (
        <>
          <form onSubmit={discover} className="mt-4">
            <Label htmlFor="source-search">Find a source</Label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input id="source-search" value={query} onChange={event => { setQuery(event.target.value); setDiscovered([]) }} placeholder="Search by topic, website, or RSS link" className="h-12 pl-12 pr-28 text-base" />
              <Button type="submit" size="sm" className="absolute right-2 top-2" disabled={!looksLikeUrl(query) || discovering}>
                {discovering ? <Loader2 className="animate-spin" /> : <Globe2 />} Find feeds
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Search your followed sources by category, or paste a website/RSS URL to discover a new source.</p>
            <div className="mt-4 max-w-sm">
              <Label htmlFor="source-topic">Topic (optional)</Label>
              <Input id="source-topic" value={topic} onChange={event => setTopic(event.target.value)} placeholder="Technology, Healthcare, Markets…" className="mt-2" maxLength={100} />
            </div>
          </form>

          {loadError && <div className="mt-5 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert"><AlertCircle className="h-4 w-4" />{loadError}</div>}

          {discovered.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold">Discovered feeds</h2>
              <div className="mt-3 divide-y rounded-lg border">
                {discovered.map(feed => {
                  const key = `discover:${feed.url}`
                  return (
                    <div key={feed.url} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted"><Rss className="h-5 w-5 text-muted-foreground" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{feed.title}</p>
                        <p className="truncate text-sm text-muted-foreground">{feed.url}</p>
                        {rowError[key] && <p className="mt-1 text-xs text-destructive" role="alert">{rowError[key]}</p>}
                      </div>
                      {canManageSources ? (
                        <Button variant={feed.isFollowing ? 'secondary' : 'outline'} disabled={feed.isFollowing || pending.has(key)} onClick={() => follow(feed, key)}>
                          {pending.has(key) ? <Loader2 className="animate-spin" /> : feed.isFollowing ? <Check /> : <Rss />}{feed.isFollowing ? 'Following' : 'Follow'}
                        </Button>
                      ) : <span className="text-xs font-medium text-muted-foreground">Read only</span>}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {!query && topics.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg font-semibold">Explore topics</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {topics.map(topic => (
                  <button key={topic.id} type="button" onClick={() => openTopic(topic.id)} className="rounded-lg border bg-card p-5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <div className="flex items-center justify-between gap-3"><span className="font-semibold">{topic.name}</span><span className="text-xs text-muted-foreground">{topic.count} {topic.count === 1 ? 'source' : 'sources'}</span></div>
                    {topic.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{topic.description}</p>}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="mt-10">
            <div className="flex items-baseline justify-between gap-3"><h2 className="text-lg font-semibold">{query && !looksLikeUrl(query) ? 'Source results' : 'Sources you follow'}</h2><span className="text-xs text-muted-foreground">{filteredSources.length} sources</span></div>
            {filteredSources.length === 0 ? (
              <div className="mt-4"><FeedsStatePanel title={query ? `No sources match “${query}”` : 'No sources followed yet'} description={query ? 'Try another category, or paste a website or RSS URL above.' : 'Paste a website or RSS URL above to follow your first source.'} /></div>
            ) : (
              <SourceList sources={filteredSources} pending={pending} rowError={rowError} canManage={canManageSources} onFollow={follow} onUnfollow={unfollow} />
            )}
          </section>

          <TopicSourcesSheet topic={selectedTopic} sources={selectedTopicSources} open={!!selectedTopic} onOpenChange={open => { if (!open) closeTopic() }} pending={pending} rowError={rowError} canManage={canManageSources} onFollow={follow} onUnfollow={unfollow} />
        </>
      )}
    </div>
  )
}

function SourceList({ sources, pending, rowError, canManage, onFollow, onUnfollow }: {
  sources: FeedSourceResult[]
  pending: Set<string>
  rowError: Record<string, string>
  canManage: boolean
  onFollow: (feed: { url: string; title: string; type?: string; siteUrl?: string | null }, key: string) => void
  onUnfollow: (endpoint: FeedEndpointResult, key: string) => void
}) {
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
                {source.siteUrl && <a href={source.siteUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" aria-label={`Open ${source.name} website`}><ExternalLink className="h-3.5 w-3.5" /></a>}
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
                    {endpoint.health !== 'healthy' && endpoint.health !== 'unknown' && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Feed {endpoint.health}</p>}
                    {rowError[key] && <p className="mt-1 text-xs text-destructive" role="alert">{rowError[key]}</p>}
                  </div>
                  {canManage ? (
                    <Button size="sm" variant={endpoint.isFollowing ? 'secondary' : 'outline'} disabled={pending.has(key) || endpoint.health === 'unavailable'} onClick={() => endpoint.isFollowing ? onUnfollow(endpoint, key) : onFollow({ url: endpoint.feedUrl, title: endpoint.title, type: endpoint.format ?? undefined, siteUrl: source.siteUrl }, key)}>
                      {pending.has(key) ? <Loader2 className="animate-spin" /> : endpoint.isFollowing ? <Check /> : <Rss />}{endpoint.isFollowing ? 'Following' : 'Follow'}
                    </Button>
                  ) : <span className="text-xs font-medium text-muted-foreground">Read only</span>}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function TopicSourcesSheet(props: Parameters<typeof SourceList>[0] & { topic: FeedTopicResult | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" overlayClassName="bg-black/35" className="w-screen max-w-none overflow-y-auto p-0 sm:w-[80vw] sm:max-w-[880px]">
        <div className="px-5 py-8 md:px-10">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Topic</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">{props.topic?.name}</h2>
          {props.topic?.description && <p className="mt-3 text-muted-foreground">{props.topic.description}</p>}
          {props.sources.length > 0 ? <SourceList {...props} /> : <div className="mt-8"><FeedsStatePanel title="No sources in this topic" description="Add a website or RSS source, then assign it to this topic." /></div>}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) || /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(trimmed)
}
