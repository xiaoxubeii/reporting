'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

export interface AuditEmail {
  id: string
  from_address: string
  subject: string | null
  received_at: string | null
  routing_confidence: number | null
  routing_reasoning: string | null
  routing_secondary_label: string | null
}

const TARGETS = ['reporting', 'interactions', 'deals'] as const

export function EmailAuditList({ emails: initial }: { emails: AuditEmail[] }) {
  const router = useRouter()
  const format = useFormatter()
  const locale = useLocale()
  const t = useTranslations('Settings.emailRouting')
  const [emails, setEmails] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)

  async function reroute(id: string, to: string) {
    setBusy(id)
    const res = await fetch(`/api/emails/${id}/reroute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    })
    setBusy(null)
    if (res.ok) {
      setEmails(emails.filter(e => e.id !== id))
      router.refresh()
    }
  }

  if (emails.length === 0) {
    return (
      <div className="rounded-md border bg-card p-12 text-center text-sm text-muted-foreground">
        {t('emptyAudit')}
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-card divide-y">
      {emails.map(e => (
        <div key={e.id} className="p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{e.received_at ? format.dateTime(new Date(e.received_at), { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</span>
                {e.routing_confidence !== null && <span>· {t('confidence', { value: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(e.routing_confidence) })}</span>}
                {e.routing_secondary_label && <span>· {t('secondary', { label: e.routing_secondary_label })}</span>}
              </div>
              <div className="font-medium truncate">{e.subject ?? t('noSubject')}</div>
              <div className="text-xs text-muted-foreground truncate">{e.from_address}</div>
              {e.routing_reasoning && (
                <div className="text-xs text-muted-foreground italic mt-1">&ldquo;{e.routing_reasoning}&rdquo;</div>
              )}
            </div>
            <div className="flex flex-wrap gap-1 shrink-0">
              {TARGETS.map(target => (
                <Button
                  key={target}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={busy === e.id}
                  onClick={() => reroute(e.id, target)}
                >
                  → {t(`targets.${target}`)}
                </Button>
              ))}
              <Link href={`/emails/${e.id}`} className="inline-flex items-center px-2 h-7 text-xs text-muted-foreground hover:text-foreground">
                {t('view')}
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
