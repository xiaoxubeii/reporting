'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Building2, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

type WelcomeError =
  | { code: 'activationFailed' | 'emailRequired' | 'invalidCode' | 'passwordTooShort' }
  | { detail: string }

/**
 * LP onboarding. The invite email is a durable link here (no expiring code) —
 * the LP requests a fresh sign-in code on demand, enters it, sets a password,
 * and we activate their account. Afterwards they sign in like any other user at
 * /auth and middleware routes them to the portal.
 */
export default function PortalWelcomePage() {
  const t = useTranslations('Portal')
  const [step, setStep] = useState<'request' | 'verify'>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<WelcomeError | null>(null)
  const [checking, setChecking] = useState(true)
  const [authedEmail, setAuthedEmail] = useState<string | null>(null)
  const [activating, setActivating] = useState(false)

  const supabase = createClient()

  function welcomeErrorMessage(value: WelcomeError): string {
    if ('detail' in value) return value.detail
    switch (value.code) {
      case 'activationFailed': return t('welcome.error.activationFailed')
      case 'emailRequired': return t('welcome.error.emailRequired')
      case 'invalidCode': return t('welcome.error.invalidCode')
      case 'passwordTooShort': return t('welcome.error.passwordTooShort')
    }
  }

  useEffect(() => {
    // Pre-fill the email from the invite link (?email=...).
    try {
      const e = new URLSearchParams(window.location.search).get('email')
      if (e) setEmail(e.trim().toLowerCase())
    } catch { /* ignore */ }
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setAuthedEmail(data.user.email ?? '')
      setChecking(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function directActivate() {
    setError(null); setActivating(true)
    const res = await fetch('/api/portal/activate', { method: 'POST' })
    if (res.ok) { window.location.href = '/portal/overview'; return }
    const b = await res.json().catch(() => ({}))
    setError(typeof b.error === 'string' ? { detail: b.error } : { code: 'activationFailed' })
    setActivating(false)
  }

  async function sendCode() {
    setError(null)
    const normEmail = email.trim().toLowerCase()
    if (!normEmail || !normEmail.includes('@')) { setError({ code: 'emailRequired' }); return }
    setSending(true)
    // The account already exists (created when you were invited); send a fresh code.
    const { error: otpErr } = await supabase.auth.signInWithOtp({ email: normEmail, options: { shouldCreateUser: false } })
    setSending(false)
    if (otpErr) { setError({ detail: otpErr.message }); return }
    setStep('verify')
  }

  async function complete() {
    setError(null)
    const normEmail = email.trim().toLowerCase()
    if (!code || code.length !== 6) { setError({ code: 'invalidCode' }); return }
    if (!password || password.length < 8) { setError({ code: 'passwordTooShort' }); return }
    setBusy(true)

    let verify = await supabase.auth.verifyOtp({ type: 'email', email: normEmail, token: code })
    if (verify.error) verify = await supabase.auth.verifyOtp({ type: 'invite', email: normEmail, token: code })
    if (verify.error) { setError({ detail: verify.error.message }); setBusy(false); return }

    const { error: pwErr } = await supabase.auth.updateUser({ password })
    if (pwErr) { setError({ detail: pwErr.message }); setBusy(false); return }

    const res = await fetch('/api/portal/activate', { method: 'POST' })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      setError(typeof b.error === 'string' ? { detail: b.error } : { code: 'activationFailed' })
      setBusy(false)
      return
    }
    window.location.href = '/portal/overview'
  }

  if (checking) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('common.loading')}
      </div>
    )
  }

  if (authedEmail !== null) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center mx-auto mb-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">{t('welcome.portalTitle')}</h1>
          </div>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">{t('welcome.activateTitle')}</CardTitle>
              <CardDescription>
                {authedEmail
                  ? t('welcome.signedInAsDescription', { email: authedEmail })
                  : t('welcome.signedInDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && <Alert variant="destructive"><AlertDescription>{welcomeErrorMessage(error)}</AlertDescription></Alert>}
              <Button className="w-full" onClick={directActivate} disabled={activating}>
                {activating ? t('welcome.activating') : t('welcome.activateAction')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center mx-auto mb-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">{t('welcome.portalTitle')}</h1>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('welcome.setupTitle')}</CardTitle>
            <CardDescription>
              {step === 'request'
                ? t('welcome.requestDescription')
                : t('welcome.verifyDescription', { email })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <Alert variant="destructive"><AlertDescription>{welcomeErrorMessage(error)}</AlertDescription></Alert>}

            {step === 'request' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('welcome.emailLabel')}</Label>
                  <Input id="email" type="email" placeholder="you@example.com" value={email}
                    onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendCode()}
                    autoComplete="email" autoFocus />
                </div>
                <Button className="w-full" onClick={sendCode} disabled={sending}>
                  {sending ? t('welcome.sending') : t('welcome.emailCodeAction')}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="code">{t('welcome.codeLabel')}</Label>
                  <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456"
                    value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="text-center text-lg tracking-[0.5em]" autoFocus />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('welcome.passwordLabel')}</Label>
                  <Input id="password" type="password" placeholder={t('welcome.passwordPlaceholder')} value={password}
                    onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
                </div>
                <Button className="w-full" onClick={complete} disabled={busy}>
                  {busy ? t('welcome.settingUp') : t('welcome.completeSetup')}
                </Button>
                <button type="button" onClick={sendCode} disabled={sending} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">
                  {sending ? t('welcome.sending') : t('welcome.resendCode')}
                </button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
