'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { MessageCircle, Send, Loader2, CheckCircle2, CircleDot } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ContactPage() {
  const t = useTranslations('Contact')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const loadedAt = useRef(Date.now())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError('')

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t('form.errors.email'))
      setSending(false)
      return
    }

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, website, t: loadedAt.current }),
      })

      if (!res.ok) {
        throw new Error('send-failed')
      }

      setSent(true)
    } catch (err) {
      setError(err instanceof Error && err.message === 'send-failed'
        ? t('form.errors.send')
        : t('form.errors.generic'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-4 pt-6 md:p-8">
      <h1 className="text-2xl font-semibold tracking-tight mb-6 flex items-center gap-3">
        <MessageCircle className="h-6 w-6 text-muted-foreground" />
        {t('title')}
      </h1>

      <div className="max-w-3xl space-y-6 text-sm leading-relaxed">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2 flex items-start gap-4 pt-3">
            <Image
              src="/tdavidson.jpg"
              alt="Taylor Davidson"
              width={80}
              height={80}
              className="rounded-lg shrink-0"
            />
            <div>
              <p className="text-muted-foreground">
                {t('intro.beforeEmail')}{' '}
                <a
                  href="mailto:hello@hemrock.com"
                  className="text-foreground underline underline-offset-4 hover:text-foreground/80"
                >
                  hello@hemrock.com
                </a>
                {' '}{t('intro.between')}{' '}
                <a
                  href="tel:+16467700052"
                  className="text-foreground underline underline-offset-4 hover:text-foreground/80"
                >
                  +1 646 770 0052
                </a>
                .
              </p>
            </div>
          </div>
          <a
            href="https://github.com/tdavidson/reporting/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3 flex items-start gap-3 transition-colors hover:bg-amber-100 dark:hover:bg-amber-950/60"
          >
            <CircleDot className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-muted-foreground">
              {t('github.before')}{' '}
              <span className="text-foreground underline underline-offset-4">{t('github.link')}</span>{t('github.after')}
            </p>
          </a>
        </div>

        {sent ? (
          <div className="rounded-lg border bg-card p-6 flex items-center gap-3 text-sm">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <p>{t('success')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-5 space-y-4">
            <h2 className="text-base font-medium">{t('form.title')}</h2>
            {/* Honeypot */}
            <div className="absolute opacity-0 -z-10" aria-hidden="true">
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-sm text-muted-foreground">{t('form.name.label')}</label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder={t('form.name.placeholder')}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm text-muted-foreground">{t('form.email.label')}</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder={t('form.email.placeholder')}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="message" className="text-sm text-muted-foreground">{t('form.message.label')}</label>
              <textarea
                id="message"
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y min-h-[80px]"
                placeholder={t('form.message.placeholder')}
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <Button type="submit" disabled={sending} className="gap-2">
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sending ? t('form.sending') : t('form.submit')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('form.orEmail')}{' '}
                <a href="mailto:hello@hemrock.com" className="text-foreground underline underline-offset-4 hover:text-foreground/80">
                  hello@hemrock.com
                </a>
              </span>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
