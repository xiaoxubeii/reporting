import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { AlertCircle, Rss } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

export function FeedsStatePanel({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  tone = 'neutral',
}: {
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  tone?: 'neutral' | 'error'
}) {
  const Icon: LucideIcon = tone === 'error' ? AlertCircle : Rss
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 py-12 text-center">
      <div className={`mb-4 rounded-full p-3 ${tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {actionLabel && actionHref && (
        <Button asChild className="mt-5"><Link href={actionHref}>{actionLabel}</Link></Button>
      )}
      {actionLabel && onAction && (
        <Button className="mt-5" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  )
}

export function FeedRowsSkeleton() {
  const t = useTranslations('Feeds.shared')
  return (
    <div className="divide-y" aria-label={t('loadingArticles')} aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex gap-4 py-5 animate-pulse">
          <div className="h-[72px] w-[112px] shrink-0 rounded-md bg-muted" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/3 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}
