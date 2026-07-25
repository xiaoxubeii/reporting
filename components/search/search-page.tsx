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
import { SEARCH_ADAPTER_DESCRIPTORS } from '@/lib/search/adapter-contracts'
import type { SearchCategoryOption } from '@/lib/search/categories'
import type { SearchResponse, SearchSourceStatus } from '@/lib/search/contracts'
import { initialSearchPageState, isSearchStale, requestFromState, searchPageReducer } from './state'

interface SearchEnvelope {
  readonly success: boolean
  readonly data: SearchResponse | null
  readonly error: { readonly message?: string } | null
}

export function SearchPage({ categories, configurationUnavailable = false }: {
  readonly categories: readonly SearchCategoryOption[]
  readonly configurationUnavailable?: boolean
}) {
  const t = useTranslations('SearchProduct')
  const defaults = useMemo(() => categories
    .filter(category => category.available && category.defaultSelected)
    .map(category => category.id), [categories])
  const [state, dispatch] = useReducer(searchPageReducer, defaults, initialSearchPageState)
  const [mobileSelection, setMobileSelection] = useState<ReadonlySet<string>>(new Set())
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

  function toggleMobileCategory(categoryId: string) {
    setMobileSelection(current => {
      const next = new Set(current)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  function applyMobileFilters() {
    dispatch({ type: 'categories_replaced', categoryIds: Array.from(mobileSelection) })
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
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
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
        <Button type="button" variant="outline" className="h-11 lg:hidden" ref={filterButtonRef} onClick={openMobileFilters} disabled={configurationUnavailable}>
          <Filter /> <span className="sr-only sm:not-sr-only">{t('sources')}</span>
        </Button>
        <Button type="submit" className="h-11" disabled={state.loading || configurationUnavailable}>
          {state.loading ? <Loader2 className="animate-spin" /> : <SearchIcon />}
          {t('submit')}
        </Button>
      </form>

      {configurationUnavailable && <div role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{t('errors.configurationUnavailable')}</div>}
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
            onOpenFeed={openFeedReader}
          />
        </main>
        <aside className="hidden lg:block" aria-label={t('sources')}>
          <div className="sticky top-6 rounded-lg border bg-card p-4">
            <h2 className="font-semibold">{t('sources')}</h2>
            <CategoryControls
              categories={categories}
              selected={state.selected}
              loading={state.loading}
              onToggle={categoryId => dispatch({ type: 'category_toggled', categoryId })}
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
            <CategoryControls
              categories={categories}
              selected={mobileSelection}
              loading={state.loading}
              onToggle={toggleMobileCategory}
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

function CategoryControls({ categories, selected, loading, onToggle }: {
  readonly categories: readonly SearchCategoryOption[]
  readonly selected: ReadonlySet<string>
  readonly loading: boolean
  readonly onToggle: (categoryId: string) => void
}) {
  const t = useTranslations('SearchProduct')
  const controlId = useId()
  return <fieldset className="mt-3 space-y-2">
        <legend className="sr-only">{t('sources')}</legend>
        {categories.map(category => {
          const inputId = `${controlId}-${category.id}`
          const descriptionId = `${inputId}-description`
          return (
          <div key={category.id} className={`flex min-h-10 items-start gap-3 rounded-md px-2 py-2 text-sm ${category.available ? 'hover:bg-accent' : 'opacity-60'}`}>
            <input id={inputId} aria-describedby={descriptionId} type="checkbox" className="mt-0.5 h-4 w-4" checked={selected.has(category.id)} disabled={!category.available} onChange={() => onToggle(category.id)} />
            <span className="min-w-0">
              <label htmlFor={inputId} className={`block font-medium ${category.available ? 'cursor-pointer' : 'cursor-not-allowed'}`}>{category.label}</label>
              <span id={descriptionId} aria-live="polite" className="block text-xs text-muted-foreground">
                {!category.available ? category.reason ?? t('unavailable') : loading && selected.has(category.id) ? t('sourceStatus.loading') : category.description}
              </span>
            </span>
          </div>
          )
        })}
      </fieldset>
}

function SearchResults({ response, loading, onOpenFeed }: {
  readonly response: SearchResponse | null
  readonly loading: boolean
  readonly onOpenFeed: (entryId: number, trigger: HTMLButtonElement) => void
}) {
  const t = useTranslations('SearchProduct')
  if (!response && loading) return <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('loading')}</div>
  if (!response) return <div className="mt-6 rounded-lg border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">{t('emptyStart')}</div>
  return <div className={`mt-4 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
    <SourceStatusSummary statuses={response.sources} partial={response.partial} />
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
            <h3 className="mt-2 text-base font-semibold leading-6">
              {hit.url ? (
                <a
                  href={hit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm underline-offset-4 visited:text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {hit.title}
                  <span className="sr-only"> {t('opensInNewTab')}</span>
                  <ExternalLink className="ml-1 inline-block h-3.5 w-3.5 align-baseline opacity-50" aria-hidden="true" />
                </a>
              ) : hit.title}
            </h3>
            {hit.snippet && <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{hit.snippet}</p>}
            {hit.identifiers && <p className="mt-2 text-xs text-muted-foreground">{Object.entries(hit.identifiers).map(([key, value]) => `${key.toUpperCase()}: ${value}`).join(' · ')}</p>}
            {hit.feedEntryId && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={event => onOpenFeed(hit.feedEntryId!, event.currentTarget)}
                >
                  <BookOpen />{t('reader')}
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
    )}
  </div>
}

function SourceStatusSummary({ statuses, partial }: {
  readonly statuses: readonly SearchSourceStatus[]
  readonly partial: boolean
}) {
  const t = useTranslations('SearchProduct')
  const failures = statuses.filter(status => !['ok', 'empty'].includes(status.status))
  if (!partial && failures.length === 0) return null
  return <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
    <p className="font-medium">{t('partial')}</p>
    {failures.length > 0 && (
      <ul className="mt-1 list-inside list-disc text-muted-foreground">
        {failures.map(status => {
          const label = SEARCH_ADAPTER_DESCRIPTORS.find(source => source.id === status.id)?.label ?? status.id
          return <li key={status.id}><span className="font-medium text-foreground">{label}:</span> {status.message ?? status.status}</li>
        })}
      </ul>
    )}
  </div>
}
