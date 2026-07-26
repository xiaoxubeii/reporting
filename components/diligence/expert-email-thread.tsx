'use client'

import React, { useEffect, useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ExpertEmailThreadView } from '@/lib/email/fund-thread-read'

type ThreadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; thread: ExpertEmailThreadView }

export function ExpertEmailThread({ dealId, requestId }: { dealId: string; requestId: string }) {
  const t = useTranslations('Diligence.expertValidation')
  const [state, setState] = useState<ThreadState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    const encodedDealId = encodeURIComponent(dealId)
    const encodedRequestId = encodeURIComponent(requestId)
    void fetch(`/api/diligence/${encodedDealId}/expert-validations/${encodedRequestId}/email-thread`, {
      cache: 'no-store',
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error('Thread unavailable')
      const body = await response.json() as { thread?: ExpertEmailThreadView }
      if (!body.thread) throw new Error('Thread unavailable')
      if (!controller.signal.aborted) setState({ status: 'ready', thread: body.thread })
    }).catch(() => {
      if (!controller.signal.aborted) setState({ status: 'error' })
    })
    return () => controller.abort()
  }, [dealId, requestId])

  return <section className="mt-4 rounded-md border bg-muted/20 p-3" aria-label={t('emailThread.title')}>
    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      <Mail className="h-3.5 w-3.5" />
      {t('emailThread.title')}
    </div>
    {state.status === 'loading' && <p className="mt-3 text-xs text-muted-foreground">
      <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />{t('emailThread.loading')}
    </p>}
    {state.status === 'error' && <p className="mt-3 text-xs text-destructive">{t('emailThread.error')}</p>}
    {state.status === 'ready' && state.thread.messages.length === 0 && <p className="mt-3 text-xs text-muted-foreground">{t('emailThread.empty')}</p>}
    {state.status === 'ready' && state.thread.messages.length > 0 && <div className="mt-3 space-y-3">
      {state.thread.messages.map(message => <article key={message.id} className="rounded-md border bg-background p-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
          <span className="font-medium text-foreground">{message.direction === 'inbound' ? t('emailThread.inbound') : t('emailThread.outbound')}</span>
          <span>{message.from}</span>
        </div>
        {message.subject && <div className="mt-2 font-medium">{message.subject}</div>}
        <p className="mt-2 whitespace-pre-wrap break-words text-foreground">{message.body.text || t('emailThread.noText')}</p>
        {message.attachments.length > 0 && <ul className="mt-2 space-y-1 border-t pt-2 text-muted-foreground">
          {message.attachments.map((attachment, index) => <li key={`${message.id}-${index}`}>
            {attachment.filename} · {formatBytes(attachment.sizeBytes)}
          </li>)}
        </ul>}
      </article>)}
    </div>}
  </section>
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
