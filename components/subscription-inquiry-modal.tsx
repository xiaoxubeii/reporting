'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useTranslations } from 'next-intl'

export function SubscriptionInquiryButton({ children, className, variant, size }: { children: React.ReactNode; className?: string; variant?: "default" | "outline" | "secondary" | "destructive" | "ghost" | "link"; size?: "default" | "sm" | "lg" | "icon" }) {
  const t = useTranslations('SubscriptionInquiry')
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', fundName: '', message: '' })

  function openEmailFallback() {
    const subject = encodeURIComponent(t('email.subject', { fundName: form.fundName.trim() }))
    const body = encodeURIComponent(t('email.body', {
      name: form.name.trim(),
      email: form.email.trim(),
      fundName: form.fundName.trim(),
      message: form.message.trim(),
    }))
    window.open(`mailto:taylor@hemrock.com?subject=${subject}&body=${body}`, '_blank')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.fundName.trim() || !form.message.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          subject: t('email.subject', { fundName: form.fundName.trim() }),
          message: t('email.apiMessage', { fundName: form.fundName.trim(), message: form.message.trim() }),
        }),
      })
      if (res.ok) {
        setSent(true)
      } else {
        // Fallback: open mailto
        openEmailFallback()
        setSent(true)
      }
    } catch {
      openEmailFallback()
      setSent(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => { setOpen(true); setSent(false) }}>
        {children}
      </Button>
      <Dialog open={open} onOpenChange={o => { if (!o) setOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          {sent ? (
            <div className="py-6 text-center">
              <p className="text-sm font-medium mb-1 text-green-600 dark:text-green-400">{t('success.title')}</p>
              <p className="text-sm text-green-600/80 dark:text-green-400/80">{t('success.description')}</p>
            </div>
          ) : (
            <>
            <DialogHeader>
              <DialogTitle>{t('title')}</DialogTitle>
              <DialogDescription>
                {t.rich('description', {
                  email: chunks => <a href="mailto:hello@hemrock.com" className="underline underline-offset-2">{chunks}</a>,
                  phone: chunks => <a href="tel:+16467700052" className="underline underline-offset-2">{chunks}</a>,
                })}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-sm font-medium">{t('fields.name.label')} <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-input rounded px-3 py-2 text-sm bg-transparent text-foreground placeholder:text-muted-foreground mt-1"
                  placeholder={t('fields.name.placeholder')}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('fields.email.label')} <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-input rounded px-3 py-2 text-sm bg-transparent text-foreground placeholder:text-muted-foreground mt-1"
                  placeholder={t('fields.email.placeholder')}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('fields.fundName.label')} <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={form.fundName}
                  onChange={e => setForm(f => ({ ...f, fundName: e.target.value }))}
                  className="w-full border border-input rounded px-3 py-2 text-sm bg-transparent text-foreground placeholder:text-muted-foreground mt-1"
                  placeholder={t('fields.fundName.placeholder')}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('fields.message.label')} <span className="text-red-500">*</span></label>
                <textarea
                  required
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  rows={3}
                  className="w-full border border-input rounded px-3 py-2 text-sm bg-transparent text-foreground placeholder:text-muted-foreground mt-1"
                  placeholder={t('fields.message.placeholder')}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setOpen(false)}>{t('cancel')}</Button>
                <Button type="submit" disabled={sending || !form.name.trim() || !form.email.trim() || !form.fundName.trim()}>
                  {sending ? t('sending') : t('submit')}
                </Button>
              </DialogFooter>
            </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
