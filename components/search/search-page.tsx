'use client'

import React, { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'
import { BookOpen, ExternalLink, Filter, Loader2, Search as SearchIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { FeedReaderSheet } from '@/components/feeds/feed-reader-sheet'
import type { FeedEntryView } from '@/lib/feeds/today-state'
import type { SearchResponse, SearchSourceId, SearchSourceStatus } from '@/lib/search/contracts'
import { initialSearchPageState, isSearchStale, requestFromState, searchPageReducer } from './state'

export interface SearchSourceOption {
  readonly id: SearchSourceId
  readonly label: string
  readonly group: 'personal' | 'professional' | 'web'
  readonly available: boolean
  readonly reason?: string
}

interface SearchEnvelope {
  readonly success: boolean
  readonly data: SearchResponse | null
  readonly error: { readonly message?: string } | null
}

export function SearchPage({ sources }: { readonly sources: readonly SearchSourceOption[] }) {
  const t = useTranslations('SearchProduct')
  const defaults = useMemo(() => sources
    .filter(source => source.available && (source.id === 'feeds' || source.id === 'web'))
    .map(source => source.id), [sources])
  const [state, dispatch] = useReducer(searchPageReducer, defaults, initialSearchPageState)
  const [mobileSelection, setMobileSelection] = useState<ReadonlySet<SearchSourceId>>(new Set())
  const [readerEntryId, setReaderEntryId] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const readerReturnFocusRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!state.query.trim()) {
      dispatch({ type: 'submit_failed', message: t('errors.query') })
      inputRef.current?.focus()
      return
    }
    if (state.selected.size === 0) {
      dispatch({ type: 'submit_failed', message: t('errors.sources') })
      return
    }
    dispatch({ type: 'submit_started' })
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestFromState(state)),
      })
      const body = await response.json().catch(() => null) as SearchEnvelope | null
      if (!response.ok || !body?.success || !body.data) {
        throw new Error(body?.error?.message || t('errors.failed'))
      }
      dispatch({ type: 'submit_succeeded', response: body.data })
    } catch (error) {
      dispatch({ type: 'submit_failed', message: error instanceof Error ? error.message : t('errors.failed') })
    }
  }

  const stale = isSearchStale(state)

  function setFiltersOpen(open: boolean) {
    dispatch({ type: 'filters_opened', open })
    if (!open) window.setTimeout(() => filterButtonRef.current?.focus(), 0)
  }

  function openMobileFilters() {
    setMobileSelection(new Set(state.selected))
    setFiltersOpen(true)
  }

  function toggleMobileSource(sourceId: SearchSourceId) {
    setMobileSelection(current => {
      const next = new Set(current)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }

  function applyMobileFilters() {
    dispatch({ type: 'sources_replaced', sourceIds: Array.from(mobileSelection) })
    setFiltersOpen(false)
  }

  function openFeedReader(entryId: number, trigger: HTMLButtonElement) {
    readerReturnFocusRef.current = trigger
    setReaderEntryId(entryId)
  }

  function closeFeedReader() {
    setReaderEntryId(null)
    window.setTimeout(() => readerReturnFocusRef.current?.focus(), 0)
  }

  function updateFeedReaderState(entry: FeedEntryView) {
    const entryId = Number(entry.upstreamId)
    if (!Number.isSafeInteger(entryId)) return
    dispatch({
      type: 'feed_state_changed',
      entryId,
      isRead: entry.isRead,
      isSaved: entry.isSaved,
    })
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('description')}</p>
      </header>

      <form onSubmit={submit} className="mt-7 flex gap-2" aria-label={t('formLabel')}>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t('queryLabel')}</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={state.query}
            onChange={event => dispatch({ type: 'query_changed', query: event.target.value })}
            placeholder={t('placeholder')}
            maxLength={200}
            className="h-11 pl-9"
          />
        </label>
        <Button type="button" variant="outline" className="h-11 lg:hidden" ref={filterButtonRef} onClick={openMobileFilters}>
          <Filter /> <span className="sr-only sm:not-sr-only">{t('sources')}</span>
        </Button>
        <Button type="submit" className="h-11" disabled={state.loading}>
          {state.loading ? <Loader2 className="animate-spin" /> : <SearchIcon />}
          {t('submit')}
        </Button>
      </form>

      {state.error && <div role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{state.error}</div>}
      <p className="sr-only" aria-live="polite">{state.loading ? t('loading') : state.response ? t('loaded', { count: state.response.results.length }) : ''}</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_240px]">
        <main className="min-w-0">
          <div className="flex min-h-8 items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t('results')}</h2>
            {stale && <Badge variant="outline">{t('stale')}</Badge>}
          </div>
          <SearchResults
            response={state.response}
            loading={state.loading}
            sources={sources}
            onOpenFeed={openFeedReader}
          />
        </main>
        <aside className="hidden lg:block" aria-label={t('sources')}>
          <div className="sticky top-6 rounded-lg border bg-card p-4">
            <h2 className="font-semibold">{t('sources')}</h2>
            <SourceControls
              sources={sources}
              selected={state.selected}
              statuses={state.response?.sources ?? []}
              loading={state.loading}
              onToggle={sourceId => dispatch({ type: 'source_toggled', sourceId })}
            />
          </div>
        </aside>
      </div>

      <Sheet open={state.filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-[88vw] max-w-sm overflow-y-auto" dialogTitle={t('sources')} dialogDescription={t('sourceHelp')}>
          <div>
            <h2 className="text-lg font-semibold">{t('sources')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('sourceHelp')}</p>
          </div>
          <div className="mt-5">
            <SourceControls
              sources={sources}
              selected={mobileSelection}
              statuses={state.response?.sources ?? []}
              loading={state.loading}
              onToggle={toggleMobileSource}
            />
          </div>
          <div className="sticky bottom-0 mt-6 flex gap-2 border-t bg-background pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setFiltersOpen(false)}>
              {t('cancelFilters')}
            </Button>
            <Button type="button" className="flex-1" onClick={applyMobileFilters}>
              {t('applyFilters')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <FeedReaderSheet
        entry={null}
        entryId={readerEntryId === null ? null : String(readerEntryId)}
        open={readerEntryId !== null}
        onOpenChange={open => { if (!open) closeFeedReader() }}
        onStateChange={updateFeedReaderState}
        onStateCommitted={() => undefined}
        loadRemoteImages={false}
      />
    </div>
  )
}

function SourceControls({ sources, selected, statuses, loading, onToggle }: {
  readonly sources: readonly SearchSourceOption[]
  readonly selected: ReadonlySet<SearchSourceId>
  readonly statuses: readonly SearchSourceStatus[]
  readonly loading: boolean
  readonly onToggle: (sourceId: SearchSourceId) => void
}) {
  const t = useTranslations('SearchProduct')
  const controlId = useId()
  function statusText(sourceId: SearchSourceId): string | null {
    if (loading && selected.has(sourceId)) return t('sourceStatus.loading')
    const status = statuses.find(candidate => candidate.id === sourceId)
    if (!status) return null
    switch (status.status) {
      case 'ok': return t('sourceStatus.ok', { count: status.resultCount })
      case 'empty': return t('sourceStatus.empty')
      case 'partial': return t('sourceStatus.partial')
      case 'unavailable': return t('sourceStatus.unavailable')
      case 'timeout': return t('sourceStatus.timeout')
      case 'rate_limited': return t('sourceStatus.rateLimited')
      case 'invalid_response': return t('sourceStatus.invalidResponse')
      case 'failed': return t('sourceStatus.failed')
    }
  }
  return <div className="mt-3 space-y-5">
    {(['personal', 'professional', 'web'] as const).map(group => {
      const options = sources.filter(source => source.group === group)
      if (options.length === 0) return null
      return <fieldset key={group} className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group === 'personal' ? t('groups.personal') : group === 'professional' ? t('groups.professional') : t('groups.web')}</legend>
        {options.map(source => {
          const currentStatus = statusText(source.id)
          const inputId = `${controlId}-${source.id}`
          const descriptionId = `${inputId}-description`
          return (
          <div key={source.id} className={`flex min-h-10 items-start gap-3 rounded-md px-2 py-2 text-sm ${source.available ? 'hover:bg-accent' : 'opacity-60'}`}>
            <input id={inputId} aria-describedby={descriptionId} type="checkbox" className="mt-0.5 h-4 w-4" checked={selected.has(source.id)} disabled={!source.available} onChange={() => onToggle(source.id)} />
            <span className="min-w-0">
              <label htmlFor={inputId} className={`block font-medium ${source.available ? 'cursor-pointer' : 'cursor-not-allowed'}`}>{source.label}</label>
              <span id={descriptionId} aria-live="polite" className="block text-xs text-muted-foreground">
                {!source.available ? source.reason ?? t('unavailable') : currentStatus}
              </span>
            </span>
          </div>
          )
        })}
      </fieldset>
    })}
  </div>
}

function SearchResults({ response, loading, sources, onOpenFeed }: {
  readonly response: SearchResponse | null
  readonly loading: boolean
  readonly sources: readonly SearchSourceOption[]
  readonly onOpenFeed: (entryId: number, trigger: HTMLButtonElement) => void
}) {
  const t = useTranslations('SearchProduct')
  if (!response && loading) return <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('loading')}</div>
  if (!response) return <div className="mt-6 rounded-lg border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">{t('emptyStart')}</div>
  return <div className={`mt-4 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
    <SourceStatusSummary statuses={response.sources} partial={response.partial} sources={sources} />
    {response.results.length === 0 ? (
      <div className="mt-5 rounded-lg border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">{t('noResults')}</div>
    ) : (
      <div className="divide-y border-y">
        {response.results.map(hit => (
          <article key={hit.id} className="py-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {hit.sources.map(source => <Badge key={`${source.id}:${source.label}`} variant="secondary">{source.label}</Badge>)}
              {hit.publishedAt && <time dateTime={hit.publishedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(hit.publishedAt))}</time>}
            </div>
            <h3 className="mt-2 text-base font-semibold leading-6">{hit.title}</h3>
            {hit.snippet && <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{hit.snippet}</p>}
            {hit.identifiers && <p className="mt-2 text-xs text-muted-foreground">{Object.entries(hit.identifiers).map(([key, value]) => `${key.toUpperCase()}: ${value}`).join(' · ')}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {hit.feedEntryId && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={event => onOpenFeed(hit.feedEntryId!, event.currentTarget)}
                >
                  <BookOpen />{t('reader')}
                </Button>
              )}
              {hit.url && <Button asChild size="sm" variant="outline"><a href={hit.url} target="_blank" rel="noopener noreferrer"><ExternalLink />{t('open')}</a></Button>}
            </div>
          </article>
        ))}
      </div>
    )}
  </div>
}

function SourceStatusSummary({ statuses, partial, sources }: {
  readonly statuses: readonly SearchSourceStatus[]
  readonly partial: boolean
  readonly sources: readonly SearchSourceOption[]
}) {
  const t = useTranslations('SearchProduct')
  const failures = statuses.filter(status => !['ok', 'empty'].includes(status.status))
  if (!partial && failures.length === 0) return null
  return <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
    <p className="font-medium">{t('partial')}</p>
    {failures.length > 0 && (
      <ul className="mt-1 list-inside list-disc text-muted-foreground">
        {failures.map(status => {
          const label = sources.find(source => source.id === status.id)?.label ?? status.id
          return <li key={status.id}><span className="font-medium text-foreground">{label}:</span> {status.message ?? status.status}</li>
        })}
      </ul>
    )}
  </div>
}
