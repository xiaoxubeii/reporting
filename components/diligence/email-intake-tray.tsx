'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Mail, Paperclip, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFormatter, useTranslations } from 'next-intl'

/**
 * Inbound emails the router matched to this deal, waiting for a human to accept
 * them into the data room.
 *
 * Nothing here is imported automatically. The router only proposes: a mailbox is
 * a firehose, and a wrong match would put a stranger's attachment in front of the
 * memo agent as evidence. The partner picks the deal's emails — and which of
 * their attachments are worth keeping (dropping signatures, logos, tracking
 * pixels).
 */

interface PendingAttachment {
  index: number
  name: string
  content_type: string
  size_bytes: number
}

interface PendingEmail {
  id: string
  subject: string | null
  from_address: string | null
  received_at: string | null
  confidence: number | null
  reasoning: string | null
  body_preview: string
  attachments: PendingAttachment[]
}

export function EmailIntakeTray({
  dealId,
  onAccepted,
}: {
  dealId: string
  onAccepted: () => void
}) {
  const t = useTranslations('Diligence.emailIntake')
  const format = useFormatter()
  const [emails, setEmails] = useState<PendingEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Per-email attachment selection. Defaults to "take everything"; the partner
  // unticks what they don't want.
  const [selection, setSelection] = useState<Record<string, Set<number>>>({})
  const [includeBody, setIncludeBody] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/diligence/${dealId}/email-intake`)
      if (!res.ok) return
      const body = await res.json()
      const rows = (body.emails ?? []) as PendingEmail[]
      setEmails(rows)
      setSelection(prev => {
        const next = { ...prev }
        for (const e of rows) {
          if (!next[e.id]) next[e.id] = new Set(e.attachments.map(a => a.index))
        }
        return next
      })
      setIncludeBody(prev => {
        const next = { ...prev }
        for (const e of rows) if (next[e.id] === undefined) next[e.id] = true
        return next
      })
    } finally {
      setLoading(false)
    }
  }, [dealId])

  useEffect(() => { load() }, [load])

  function toggleAttachment(emailId: string, index: number) {
    setSelection(prev => {
      const set = new Set(prev[emailId] ?? [])
      if (set.has(index)) set.delete(index)
      else set.add(index)
      return { ...prev, [emailId]: set }
    })
  }

  async function accept(email: PendingEmail) {
    setBusyId(email.id)
    setError(null)
    try {
      const res = await fetch(`/api/emails/${email.id}/accept-to-diligence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deal_id: dealId,
          attachment_indexes: Array.from(selection[email.id] ?? []),
          include_body: includeBody[email.id] !== false,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? t('addFailed'))
        return
      }
      setEmails(prev => prev.filter(e => e.id !== email.id))
      onAccepted()
    } catch {
      setError(t('addFailed'))
    } finally {
      setBusyId(null)
    }
  }

  async function reject(email: PendingEmail) {
    setBusyId(email.id)
    try {
      await fetch(`/api/emails/${email.id}/accept-to-diligence`, { method: 'DELETE' })
      setEmails(prev => prev.filter(e => e.id !== email.id))
    } finally {
      setBusyId(null)
    }
  }

  if (loading || emails.length === 0) return null

  return (
    <div className="mb-4 rounded-lg border border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Mail className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        <h3 className="text-sm font-semibold">
          {t('matchedCount', { count: emails.length })}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {t('description')}
      </p>

      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}

      <div className="space-y-3">
        {emails.map(email => {
          const selected = selection[email.id] ?? new Set<number>()
          const busy = busyId === email.id
          return (
            <div key={email.id} className="rounded-md border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {email.subject || t('noSubject')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {email.from_address ?? t('unknownSender')}
                    {email.received_at && ` · ${format.dateTime(new Date(email.received_at), { dateStyle: 'medium', timeStyle: 'short' })}`}
                    {typeof email.confidence === 'number' && ` · ${t('matchConfidence', { value: format.number(email.confidence, { style: 'percent', maximumFractionDigits: 0 }) })}`}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" onClick={() => accept(email)} disabled={busy}>
                    {busy
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Check className="h-3.5 w-3.5 mr-1" />}
                    {busy ? '' : t('accept')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => reject(email)} disabled={busy} aria-label={t('reject')} title={t('reject')}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {email.body_preview && (
                <p className="mt-2 text-xs text-muted-foreground line-clamp-3">
                  {email.body_preview}
                </p>
              )}

              <label className="mt-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeBody[email.id] !== false}
                  onChange={e =>
                    setIncludeBody(prev => ({ ...prev, [email.id]: e.target.checked }))
                  }
                />
                {t('includeBody')}
              </label>

              {email.attachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    {t('attachments')}
                  </div>
                  {email.attachments.map(att => (
                    <label key={att.index} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selected.has(att.index)}
                        onChange={() => toggleAttachment(email.id, att.index)}
                      />
                      <span className="truncate">{att.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        {att.size_bytes === 0 ? '' : att.size_bytes < 1024
                          ? `${format.number(att.size_bytes)} B`
                          : att.size_bytes < 1024 * 1024
                            ? `${format.number(att.size_bytes / 1024, { maximumFractionDigits: 0 })} KB`
                            : `${format.number(att.size_bytes / 1024 / 1024, { maximumFractionDigits: 1 })} MB`}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
