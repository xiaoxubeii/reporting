'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Copy, ExternalLink, Loader2, MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function FollowingSourceActions({
  sourceName,
  siteUrl,
  feedUrl,
  endpointLabel,
  pending,
  onCopied,
  onError,
  onUnfollow,
}: {
  sourceName: string
  siteUrl: string | null
  feedUrl: string
  endpointLabel?: string | null
  pending: boolean
  onCopied: () => void
  onError: (message: string) => void
  onUnfollow: () => void
}) {
  const t = useTranslations('Feeds.sources')
  const [open, setOpen] = useState(false)
  const sourceUrl = siteUrl ?? feedUrl
  const actionName = endpointLabel ? `${sourceName}, ${endpointLabel}` : sourceName

  async function copyRss() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(feedUrl)
      onCopied()
      setOpen(false)
    } catch {
      onError(t('actions.copyFailed'))
    }
  }

  function unfollow() {
    if (pending) return
    setOpen(false)
    onUnfollow()
  }

  return (
    <Popover open={open} onOpenChange={nextOpen => { if (!pending) setOpen(nextOpen) }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={pending}
          aria-label={t('actions.menuLabel', { name: actionName })}
        >
          {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={8}
        className="w-52 p-1"
        aria-label={t('actions.menuLabel', { name: actionName })}
      >
        <Button asChild variant="ghost" className="h-10 w-full justify-start px-3 font-normal">
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={t('actions.openSourceLabel', { name: actionName })}>
            <ExternalLink />
            {t('actions.openSource')}
          </a>
        </Button>
        <Button type="button" variant="ghost" className="h-10 w-full justify-start px-3 font-normal" aria-label={t('actions.copyRssLabel', { name: actionName })} onClick={() => void copyRss()}>
          <Copy />
          {t('actions.copyRss')}
        </Button>
        <Button type="button" variant="ghost" className="h-10 w-full justify-start px-3 font-normal text-destructive hover:text-destructive" aria-label={t('actions.unfollowLabel', { name: actionName })} onClick={unfollow}>
          <Trash2 />
          {t('actions.unfollow')}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
