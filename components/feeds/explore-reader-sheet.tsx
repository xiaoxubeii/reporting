'use client'

import { useEffect, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { ExternalLink, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent } from '@/components/ui/sheet'
import { feedErrorMessageKey, feedsRequest, type ExploreEntryResult } from './api'

export function ExploreReaderSheet({
  entry,
  entryId,
  open,
  onOpenChange,
}: {
  entry: ExploreEntryResult | null
  entryId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const locale = useLocale()
  const t = useTranslations('Feeds.reader')
  const feedError = useTranslations('Feeds.errors')
  const format = useFormatter()
  const [detail, setDetail] = useState<ExploreEntryResult | null>(entry)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    setError(null)
  }, [locale])

  useEffect(() => {
    setDetail(entry)
    setError(null)
  }, [entry, entryId])

  useEffect(() => {
    if (!open || !entryId) return
    let active = true
    setLoading(true)
    setError(null)
    feedsRequest<{ entry: ExploreEntryResult }>(
      `/api/feeds/explore/entries/${encodeURIComponent(entryId)}`,
    )
      .then(data => { if (active) setDetail(data.entry) })
      .catch(value => { if (active) setError(feedError(feedErrorMessageKey(value))) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [entryId, feedError, open, retryKey])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        overlayClassName="bg-black/35"
        className="w-screen max-w-none p-0 sm:w-[80vw] sm:max-w-[1040px] lg:w-[72vw]"
        aria-label={t('exploreLabel')}
        showCloseButton={false}
      >
        <SheetClose asChild>
          <Button type="button" variant="ghost" size="icon" className="absolute left-3 top-3 z-20" aria-label={t('close')}>
            <X />
          </Button>
        </SheetClose>
        {loading && <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        {error && (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <p className="font-medium">{t('loadFailed')}</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" className="mt-5" onClick={() => setRetryKey(value => value + 1)}>{t('retry')}</Button>
          </div>
        )}
        {!loading && !error && detail && (
          <div className="flex h-full flex-col">
            <div className="sticky top-0 z-10 flex min-h-16 items-center justify-end border-b bg-background/95 px-14 backdrop-blur">
              {detail.originalUrl && (
                <Button asChild variant="ghost" size="icon">
                  <a href={detail.originalUrl} target="_blank" rel="noopener noreferrer" aria-label={t('openOriginal')}><ExternalLink /></a>
                </Button>
              )}
            </div>
            <article className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-12">
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{detail.title}</h1>
                <p className="mt-3 text-sm text-muted-foreground">
                  {detail.source.title}{detail.author ? ` · ${detail.author}` : ''}{detail.publishedAt ? ` · ${format.dateTime(new Date(detail.publishedAt), { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                </p>
                {detail.imageUrl && <img src={detail.imageUrl} alt="" className="mt-8 max-h-[480px] w-full rounded-lg border object-cover" referrerPolicy="no-referrer" />}
                {detail.contentText ? (
                  <div className="mt-8 whitespace-pre-wrap text-[16px] leading-7 text-foreground/90">{detail.contentText}</div>
                ) : (
                  <p className="mt-8 text-muted-foreground">{t('previewOnly')}</p>
                )}
                {detail.originalUrl && (
                  <Button asChild variant="outline" className="mt-10 w-full">
                    <a href={detail.originalUrl} target="_blank" rel="noopener noreferrer">{t('visitOriginal')} <ExternalLink /></a>
                  </Button>
                )}
              </div>
            </article>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
