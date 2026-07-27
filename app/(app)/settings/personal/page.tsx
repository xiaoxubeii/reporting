'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, LockKeyhole, Mail, Palette, ShieldCheck, UserRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SettingsScopeNavigation } from '@/components/settings/settings-scope-navigation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MfaSettings } from '@/components/account/mfa-settings'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { AffinityConnect } from '@/components/settings/affinity-connect'
import { PersonalNotificationPreferences } from '@/components/settings/personal-notification-preferences'

interface PersonalState {
  externalEmail: string | null
  profile: { fullName: string | null }
  currentFund: null | { name: string; slug: string; emailDomain: string | null; role: 'admin' | 'member' }
  mailbox: null | { localPart: string; address: string | null; displayName: string; active: boolean }
}

export default function PersonalSettingsPage() {
  const t = useTranslations('SettingsIdentity.personal')
  const [data, setData] = useState<PersonalState | null>(null)
  const [fullName, setFullName] = useState('')
  const [mailboxLocalPart, setMailboxLocalPart] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'profile' | 'mailbox' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const internalEmail = data?.mailbox?.address ?? null

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/settings/personal', { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || t('errors.load'))
      setData(body)
      setFullName(body.profile?.fullName ?? '')
      setMailboxLocalPart(body.mailbox?.localPart ?? '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('errors.load'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  async function save(kind: 'profile' | 'mailbox') {
    setSaving(kind)
    setError(null)
    setMessage(null)
    const payload = kind === 'profile' ? { fullName } : { mailboxLocalPart }
    try {
      const response = await fetch('/api/settings/personal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || t('errors.save'))
      setMessage(t(kind === 'profile' ? 'profile.saved' : 'mailbox.saved'))
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('errors.save'))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>
      <SettingsScopeNavigation current="personal" isAdmin={data?.currentFund?.role === 'admin'} fundName={data?.currentFund?.name} />
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <Alert><Check className="h-4 w-4" /><AlertDescription>{message}</AlertDescription></Alert>}
      {loading && !data ? (
        <Card><CardContent className="flex min-h-44 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('loading')}</CardContent></Card>
      ) : data ? (
        <div className="grid gap-5">
          <Card id="profile" className="scroll-mt-6 shadow-sm">
            <CardHeader><div className="flex items-center gap-3"><UserRound className="h-5 w-5" /><div><CardTitle className="text-base">{t('profile.title')}</CardTitle><CardDescription>{t('profile.description')}</CardDescription></div></div></CardHeader>
            <CardContent className="space-y-5">
              <form className="space-y-5" onSubmit={event => { event.preventDefault(); void save('profile') }}>
                <div className="space-y-2"><Label htmlFor="full-name">{t('profile.fullName')}</Label><Input id="full-name" value={fullName} onChange={event => setFullName(event.target.value)} autoComplete="name" maxLength={120} /></div>
                <div className="space-y-2"><Label htmlFor="external-login-email">{t('profile.externalEmail')}</Label><Input id="external-login-email" value={data.externalEmail ?? ''} readOnly aria-describedby="external-login-email-help" /><p id="external-login-email-help" className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t('profile.externalEmailHelp')}</p></div>
                <Button type="submit" size="sm" disabled={saving !== null || !fullName.trim()}>{saving === 'profile' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('save')}</Button>
              </form>
            </CardContent>
          </Card>

          {data.currentFund && (
            <Card id="mailbox" className="scroll-mt-6 shadow-sm">
              <CardHeader><div className="flex items-center gap-3"><Mail className="h-5 w-5" /><div><CardTitle className="text-base">{t('mailbox.title')}</CardTitle><CardDescription>{t('mailbox.description')}</CardDescription></div></div></CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">{t('fund.current')}</p><p className="mt-1 text-sm font-medium">{data.currentFund.name}</p></div><div><p className="text-xs text-muted-foreground">{t('fund.role')}</p><Badge variant="secondary" className="mt-1">{t(`roles.${data.currentFund.role}`)}</Badge></div></div>
                {data.mailbox?.active ? (
                  <div className="space-y-2"><Label htmlFor="business-email">{t('mailbox.businessEmail')}</Label><Input id="business-email" value={internalEmail ?? ''} readOnly aria-describedby="business-email-help" /><p id="business-email-help" className="text-xs leading-5 text-muted-foreground">{t('mailbox.immutableHelp')}</p></div>
                ) : (
                  <form className="space-y-2" onSubmit={event => { event.preventDefault(); void save('mailbox') }}><Label htmlFor="mailbox-local-part">{t('mailbox.localPart')}</Label><div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:gap-0"><Input id="mailbox-local-part" value={mailboxLocalPart} onChange={event => setMailboxLocalPart(event.target.value.toLowerCase())} className="min-w-0 sm:rounded-r-none" maxLength={63} aria-describedby="mailbox-local-part-help" /><div className="min-w-0 break-all rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground sm:rounded-l-none sm:border-l-0">@{data.currentFund.emailDomain}</div></div><p id="mailbox-local-part-help" className="text-xs leading-5 text-muted-foreground">{t('mailbox.claimHelp')}</p><Button type="submit" size="sm" disabled={saving !== null || !mailboxLocalPart.trim() || !fullName.trim()}>{saving === 'mailbox' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('mailbox.claim')}</Button></form>
                )}
              </CardContent>
            </Card>
          )}
          <Card className="shadow-sm">
            <CardHeader><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" /><div><CardTitle className="text-base">{t('security.title')}</CardTitle><CardDescription>{t('security.description')}</CardDescription></div></div></CardHeader>
            <CardContent><MfaSettings /></CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader><div className="flex items-center gap-3"><Palette className="h-5 w-5" /><div><CardTitle className="text-base">{t('preferences.title')}</CardTitle><CardDescription>{t('preferences.description')}</CardDescription></div></div></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">{t('preferences.language')}</p><LanguageSwitcher className="w-full border bg-background" /></div>
              <div className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-xs font-medium text-muted-foreground">{t('preferences.theme')}</p><p className="mt-1 text-xs text-muted-foreground">{t('preferences.themeHelp')}</p></div><ThemeToggle /></div>
            </CardContent>
          </Card>
          {data.currentFund && <AffinityConnect />}
          {data.currentFund && <PersonalNotificationPreferences />}
        </div>
      ) : null}
    </div>
  )
}
