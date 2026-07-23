'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useLpPortalEnabled } from '@/components/feature-visibility-context'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Loader2, Send, CheckCircle2, ArrowLeft, Paperclip, Users } from 'lucide-react'

interface Investor { id: string; name: string }

type Delivery = 'link' | 'attachment' | 'both'
type SendResult = { sent: number; primaryRecipients: number; ccRecipients: number; failures: string[] }
type Recipient = { to: string; name: string | null; cc: string[]; investorCount: number }
type PreviewData = { subject: string; itemTitle: string; fromName: string; html: string; attachment: boolean; recipients: Recipient[] }

/**
 * A "Send to LPs" button + modal for emailing an already-shared item to selected LPs.
 *
 * Two steps by design, because this actually sends email to investors: first COMPOSE
 * (recipients, delivery, subject, message), then REVIEW — a no-send preview that shows the exact
 * addresses each email goes To and Cc (authorized users are Cc'd automatically), and renders the
 * email itself — before a final Send. Nothing goes out until the review step is confirmed.
 */
export function LpSendControl({ kind, id, itemTitle }: {
  kind: 'snapshot' | 'letter' | 'document'; id: string; itemTitle?: string
}) {
  const t = useTranslations('LPs.admin.send')
  const lpPortalEnabled = useLpPortalEnabled()
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<'compose' | 'review' | 'result'>('compose')
  const [eligible, setEligible] = useState<Investor[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [portalEnabled, setPortalEnabled] = useState<boolean | null>(null)

  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [delivery, setDelivery] = useState<Delivery>('link')

  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SendResult | null>(null)

  const kindLabel = t(`kinds.${kind}`)
  const deliveryOptions: { value: Delivery; label: string; hint: string }[] = [
    { value: 'link', label: t('delivery.link.label'), hint: t('delivery.link.hint') },
    { value: 'attachment', label: t('delivery.attachment.label'), hint: t('delivery.attachment.hint') },
    { value: 'both', label: t('delivery.both.label'), hint: t('delivery.both.hint') },
  ]

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/lps/send?kind=${kind}&id=${encodeURIComponent(id)}`)
      .then(r => (r.ok ? r.json() : { investors: [], portalEnabled: null }))
      .then(data => {
        const invs = (Array.isArray(data.investors) ? data.investors : []).map((i: Investor) => ({ id: i.id, name: i.name }))
        setEligible(invs)
        setSelected(new Set(invs.map((i: Investor) => i.id))) // default: everyone who can see it
        setPortalEnabled(data.portalEnabled ?? null)
      })
      .finally(() => setLoading(false))
  }, [open, kind, id])

  const allSelected = eligible.length > 0 && eligible.every(i => selected.has(i.id))

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const body = () => ({ kind, id, lp_investor_ids: Array.from(selected), subject, message, delivery })

  async function goReview() {
    setPreviewing(true); setError(null)
    try {
      const res = await fetch('/api/lps/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body(), preview: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || t('errors.preview')); return }
      if (!data.recipients || data.recipients.length === 0) {
        setError(t('errors.noAccounts'))
        return
      }
      setPreview(data as PreviewData)
      setStage('review')
    } catch {
      setError(t('errors.preview'))
    } finally {
      setPreviewing(false)
    }
  }

  async function send() {
    setSending(true); setError(null)
    try {
      const res = await fetch('/api/lps/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body()),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || t('errors.send')); return }
      setResult(data as SendResult)
      setStage('result')
    } catch {
      setError(t('errors.send'))
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setStage('compose'); setResult(null); setPreview(null); setError(null)
    setSubject(''); setMessage(''); setDelivery('link')
  }

  // With the portal off there is nobody to send to: eligible recipients ARE the investors the
  // item is shared with, and sharing is a portal action. Hooks run first, then bail.
  if (!lpPortalEnabled) return null

  const totalTo = preview?.recipients.length ?? 0
  const totalCc = preview?.recipients.reduce((a, r) => a + r.cc.length, 0) ?? 0

  return (
    <>
      <Button variant="outline" size="sm" className="text-muted-foreground" onClick={() => { reset(); setOpen(true) }}>
        <Send className="h-4 w-4 mr-1" />
        {t('button')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {stage === 'review' ? t('reviewTitle') : stage === 'result' ? t('sentTitle') : t('title')}
            </DialogTitle>
            <DialogDescription>
              {stage === 'review'
                ? t('reviewDescription')
                : t('description', { kind: kindLabel })}
            </DialogDescription>
          </DialogHeader>

          {/* ---- RESULT ---- */}
          {stage === 'result' && result ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-md border border-emerald-300/50 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  {t('result.sent', { sent: result.sent, cc: result.ccRecipients })}
                  {result.failures.length > 0 && (
                    <div className="text-amber-700 dark:text-amber-400 mt-1">{t('result.failed', { count: result.failures.length, failures: result.failures.join(', ') })}</div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={reset}>{t('sendAnother')}</Button>
                <Button size="sm" onClick={() => setOpen(false)}>{t('done')}</Button>
              </div>
            </div>

          /* ---- REVIEW ---- */
          ) : stage === 'review' && preview ? (
            <div className="space-y-4 min-w-0">
              {/* Recipients — the actual addresses */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> {t('reviewRecipients', { to: totalTo, cc: totalCc })}
                </label>
                <div className="rounded-md border divide-y max-h-[26vh] overflow-y-auto text-sm">
                  {preview.recipients.map((r, i) => (
                    <div key={i} className="px-3 py-2 min-w-0">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0 w-6">{t('to')}</span>
                        <span className="font-mono text-xs truncate">{r.to}</span>
                        {r.name && <span className="text-xs text-muted-foreground truncate">({r.name})</span>}
                      </div>
                      {r.cc.map((c, j) => (
                        <div key={j} className="flex items-baseline gap-2 min-w-0 mt-0.5">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0 w-6">{t('cc')}</span>
                          <span className="font-mono text-xs truncate text-muted-foreground">{c}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* The email itself */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t('email')}</label>
                <div className="rounded-md border overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/40 text-xs space-y-0.5">
                    <div><span className="text-muted-foreground">{t('subject')}:</span> <span className="font-medium">{preview.subject}</span></div>
                    {preview.attachment && (
                      <div className="flex items-center gap-1 text-muted-foreground"><Paperclip className="h-3 w-3" /> {t('pdfAttached')}</div>
                    )}
                  </div>
                  <iframe title={t('emailPreview')} srcDoc={preview.html} className="w-full h-64 bg-white" sandbox="" />
                </div>
              </div>

              {error && <div className="text-xs rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-destructive">{error}</div>}

              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setStage('compose'); setError(null) }} disabled={sending}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> {t('edit')}
                </Button>
                <Button size="sm" onClick={send} disabled={sending}>
                  {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                  {t('sendToCount', { count: totalTo })}
                </Button>
              </div>
            </div>

          /* ---- COMPOSE ---- */
          ) : (
            <div className="space-y-4 min-w-0">
              {portalEnabled === false && delivery !== 'attachment' && (
                <div className="text-xs rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-2.5 py-2">
                  {t.rich('portalOff', { settings: chunks => <a href="/settings" className="underline">{chunks}</a> })}
                </div>
              )}

              {loading ? (
                <div className="text-xs text-muted-foreground py-4"><Loader2 className="h-3.5 w-3.5 inline animate-spin mr-1" /> {t('loading')}</div>
              ) : eligible.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4">
                  {t(kind === 'document' ? 'emptyDocument' : 'emptyShared', { kind: kindLabel })}
                </div>
              ) : (
                <>
                  {/* Recipients */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">{t('recipients', { selected: selected.size, total: eligible.length })}</label>
                      <button onClick={() => setSelected(allSelected ? new Set() : new Set(eligible.map(i => i.id)))} className="text-[11px] text-primary hover:underline">
                        {allSelected ? t('deselectAll') : t('selectAll')}
                      </button>
                    </div>
                    <div className="rounded-md border divide-y max-h-[28vh] overflow-y-auto min-w-0">
                      {eligible.map(inv => (
                        <label key={inv.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30 min-w-0">
                          <input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggle(inv.id)} className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 min-w-0 truncate">{inv.name}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{t('addressesHint')}</p>
                  </div>

                  {/* Delivery */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t('deliveryTitle')}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {deliveryOptions.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setDelivery(opt.value)}
                          title={opt.hint}
                          className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${
                            delivery === opt.value ? 'border-primary bg-primary/5 text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/40'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{deliveryOptions.find(o => o.value === delivery)?.hint}</p>
                  </div>

                  {/* Subject + message */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t('subject')}</label>
                    <input
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      placeholder={itemTitle ?? t('subjectPlaceholder')}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">{t('message')}</label>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      rows={4}
                      placeholder={t('messagePlaceholder')}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                    />
                  </div>

                  {error && <div className="text-xs rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-destructive">{error}</div>}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={previewing}>{t('cancel')}</Button>
                    <Button size="sm" onClick={goReview} disabled={previewing || selected.size === 0}>
                      {previewing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                      {t('reviewCount', { count: selected.size })}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
