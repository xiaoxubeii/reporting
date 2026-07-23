'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

const MAX_FILE_BYTES = 10 * 1024 * 1024  // 10 MB

export function SubmitForm({ token, fundName }: { token: string; fundName: string }) {
  const t = useTranslations('Submit')
  const [companyName, setCompanyName] = useState('')
  const [companyUrl, setCompanyUrl] = useState('')
  const [founderName, setFounderName] = useState('')
  const [founderEmail, setFounderEmail] = useState('')
  const [pitch, setPitch] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [honeypot, setHoneypot] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = !!companyName.trim() && !!founderName.trim() && !!founderEmail.trim() && !!pitch.trim() && pitch.trim().length >= 50 && !submitting

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)

    try {
      let attachment: { name: string; contentType: string; data: string } | null = null
      if (file) {
        if (file.size > MAX_FILE_BYTES) {
          throw new Error(t('errors.fileTooLarge'))
        }
        const buffer = await file.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let bin = ''
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
        const base64 = btoa(bin)
        attachment = { name: file.name, contentType: file.type || 'application/octet-stream', data: base64 }
      }

      const res = await fetch(`/api/public/submit/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          companyUrl,
          founderName,
          founderEmail,
          pitch,
          attachment,
          // Honeypot — bots will fill this in. Real users won't see it.
          website: honeypot,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? t('errors.submissionFailed'))
      }

      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.submissionFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500 mb-4" />
          <h2 className="text-lg font-medium mb-2">{t('success.title')}</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {t('success.description', { fundName })}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="py-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Honeypot, visually hidden but in the form. Bots fill it; humans skip. */}
          <div aria-hidden="true" className="absolute -left-[10000px] w-[1px] h-[1px] overflow-hidden">
            <Label htmlFor="website">{t('form.honeypot')}</Label>
            <Input
              id="website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={e => setHoneypot(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="companyName">{t('form.companyName')}</Label>
              <Input id="companyName" value={companyName} onChange={e => setCompanyName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="companyUrl">{t('form.website')}</Label>
              <Input id="companyUrl" value={companyUrl} onChange={e => setCompanyUrl(e.target.value)} placeholder="acme.com" />
            </div>
            <div>
              <Label htmlFor="founderName">{t('form.founderName')}</Label>
              <Input id="founderName" value={founderName} onChange={e => setFounderName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="founderEmail">{t('form.founderEmail')}</Label>
              <Input id="founderEmail" type="email" value={founderEmail} onChange={e => setFounderEmail(e.target.value)} required />
            </div>
          </div>

          <div>
            <Label htmlFor="pitch">{t('form.pitch')}</Label>
            <textarea
              id="pitch"
              value={pitch}
              onChange={e => setPitch(e.target.value)}
              rows={8}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={t('form.pitchPlaceholder')}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">{t('form.characterCount', { count: pitch.trim().length })}</p>
          </div>

          <div>
            <Label htmlFor="file">{t('form.file')}</Label>
            <Input
              id="file"
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={!canSubmit} className="w-full">
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('form.submitting')}</> : t('form.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
