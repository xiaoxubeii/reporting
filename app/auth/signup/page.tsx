'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AuthShell } from '@/components/auth-shell'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createClient } from '@/lib/supabase/client'
import { OtpCodeForm } from '@/components/auth/otp-code-form'
import { useLocale, useTranslations } from 'next-intl'
import { safeNextPath } from '@/lib/safe-redirect'

export default function SignUpPage() {
  return <Suspense><SignUpForm /></Suspense>
}

function SignUpForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptedLicense, setAcceptedLicense] = useState(false)
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [isHemrock, setIsHemrock] = useState(false)
  const t = useTranslations('Auth')
  const locale = useLocale()
  const searchParams = useSearchParams()
  const nextPath = safeNextPath(searchParams.get('next'))
  const destination = nextPath ?? '/'

  async function handleVerify(code: string) {
    setError(null)
    setVerifying(true)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      type: 'signup',
      email: email.trim().toLowerCase(),
      token: code,
    })
    if (error) {
      setError(locale === 'en' ? error.message : t('genericError'))
      setVerifying(false)
    } else {
      window.location.href = `/auth/post-login?method=signup&next=${encodeURIComponent(destination)}`
    }
  }

  async function handleResend() {
    setError(null)
    const supabase = createClient()
    await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() })
  }

  useEffect(() => {
    const host = window.location.hostname
    setIsHemrock(host === 'hemrock.com' || host.endsWith('.hemrock.com') || host.endsWith('.netlify.app') || host.endsWith('.vercel.app') || host === 'localhost')
  }, [])

  async function signUp() {
    if (!email.trim()) {
      setError(t('emailRequired'))
      return
    }
    if (!password || password.length < 8) {
      setError(t('passwordMinimumError'))
      return
    }
    if (!acceptedLicense) {
      setError(t('licenseRequired'))
      return
    }
    setError(null)
    setInfo(null)
    setLoading(true)

    // Step 1: server-side whitelist check. Each failure mode is handled
    // distinctly so a recurrence is diagnosable from the message + console
    // rather than collapsing into one generic "please try again".

    // 1a. Network-level failure reaching our own API.
    let whitelistRes: Response
    try {
      whitelistRes = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, acceptedLicense: true }),
      })
    } catch (err) {
      console.error('[signup] whitelist request failed to send:', err)
      setError(t('serverUnavailable'))
      setLoading(false)
      return
    }

    // 1b. Response arrived but isn't JSON — typically an infra error page
    // (gateway timeout, platform 5xx). The HTTP status pinpoints it.
    let whitelistData: { ok?: boolean; error?: string }
    try {
      whitelistData = await whitelistRes.json()
    } catch (err) {
      console.error(`[signup] whitelist response was not JSON (HTTP ${whitelistRes.status}):`, err)
      setError(t('signupUnexpectedResponse', { status: whitelistRes.status }))
      setLoading(false)
      return
    }

    // 1c. Whitelist rejected, or the API returned a handled error.
    if (!whitelistRes.ok) {
      if (whitelistData.error === 'not_whitelisted') {
        setError('not_whitelisted')
      } else {
        setError(whitelistData.error && locale === 'en' ? whitelistData.error : t('unableCreateAccount'))
      }
      setLoading(false)
      return
    }

    // Step 2: create the user via the browser client (PKCE flow — the
    // confirmation link will work). signUp normally *returns* errors, but a
    // 5xx from the Auth server can surface as a *thrown* exception — handle
    // both so neither is mistaken for the other.
    let signUpError: { message?: string } | null = null
    try {
      const supabase = createClient()
      const result = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
          data: {
            accepted_license_at: new Date().toISOString(),
          },
        },
      })
      signUpError = result.error
    } catch (err) {
      console.error('[signup] supabase.auth.signUp threw:', err)
      setError(
        err instanceof Error
          ? (locale === 'en' ? t('accountCreationFailed', { message: err.message }) : t('accountCreationUnexpected'))
          : t('accountCreationUnexpected')
      )
      setLoading(false)
      return
    }

    if (signUpError) {
      console.error('[signup] signUp returned an error:', signUpError)
      const msg = signUpError.message ?? ''
      if (msg.includes('already') || msg.includes('registered')) {
        setError(t('emailMayExist'))
      } else {
        setError(msg && locale === 'en' ? msg : t('unableCreateAccount'))
      }
    } else {
      // Email confirmation sent as a 6-digit code — move to the verify step.
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <AuthShell
      above={isHemrock && (
        <div className="rounded-lg border bg-card p-4 text-sm text-center">
          <p>{t('tryFirst')} <a href="/demo" className="text-primary underline underline-offset-4 hover:text-primary/80 font-medium">{t('launchDemo')}</a></p>
        </div>
      )}
    >

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('signupTitle')}</CardTitle>
            <CardDescription>{t('signupDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sent ? (
              <OtpCodeForm
                email={email.trim().toLowerCase()}
                onVerify={handleVerify}
                onResend={handleResend}
                verifying={verifying}
                error={error}
              />
            ) : (
              <>
            {error && error !== 'not_whitelisted' && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {error === 'not_whitelisted' && (
              <Alert className="!border-amber-500/50 !bg-amber-50 dark:!bg-amber-950/30 !text-amber-900 dark:!text-amber-200">
                <AlertDescription className="text-sm space-y-2">
                  <p>{t('hostedUnauthorized')}</p>
                  <p>
                    {t('selfHostNoticeBefore')}{' '}
                    <a href="/license" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4 hover:text-primary/80">{t('license')}</a>.{' '}
                    {t('selfHostNoticeAfter')}{' '}
                    <a href="https://www.hemrock.com/contact" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4 hover:text-primary/80">Taylor</a>.
                  </p>
                </AlertDescription>
              </Alert>
            )}
            {info && (
              <Alert className="!border-green-500/50 !bg-green-50 dark:!bg-green-950/30 !text-green-900 dark:!text-green-200">
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && signUp()}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && signUp()}
                autoComplete="new-password"
                placeholder={t('passwordMinimumPlaceholder')}
              />
            </div>

            <div className="flex items-start gap-2">
              <input
                id="accept-license"
                type="checkbox"
                checked={acceptedLicense}
                onChange={e => setAcceptedLicense(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-input accent-primary"
              />
              <label htmlFor="accept-license" className="text-xs text-muted-foreground leading-relaxed">
                {t('agreePrefix')}{' '}
                <a href="/license" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4 hover:text-primary/80">
                  {t('licenseAgreement')}
                </a>
                {isHemrock && (
                  <>
                    ,{' '}
                    <a href="https://www.hemrock.com/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4 hover:text-primary/80">
                      {t('termsOfService')}
                    </a>
                    , {t('and')}{' '}
                    <a href="https://www.hemrock.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4 hover:text-primary/80">
                      {t('privacyPolicy')}
                    </a>
                  </>
                )}
                .
              </label>
            </div>

            <Button className="w-full" onClick={signUp} disabled={loading || !acceptedLicense}>
              {loading ? t('creatingAccount') : t('createAccountAction')}
            </Button>
              </>
            )}

            <p className="text-center text-sm text-muted-foreground">
              {t('alreadyAccount')}{' '}
              <Link href={`/auth${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`} className="text-primary underline underline-offset-4 hover:text-primary/80">
                {t('signIn')}
              </Link>
            </p>
          </CardContent>
        </Card>
    </AuthShell>
  )
}
