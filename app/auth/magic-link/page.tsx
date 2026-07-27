'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AuthShell } from '@/components/auth-shell'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { OtpCodeForm } from '@/components/auth/otp-code-form'
import { useLocale, useTranslations } from 'next-intl'
import { safeNextPath } from '@/lib/safe-redirect'

export default function MagicLinkPage() {
  return <Suspense><MagicLinkForm /></Suspense>
}

function MagicLinkForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const t = useTranslations('Auth')
  const locale = useLocale()
  const searchParams = useSearchParams()
  const nextPath = safeNextPath(searchParams.get('next'))
  const destination = nextPath ?? '/'

  const supabase = createClient()

  async function handleSend() {
    if (!email.trim()) {
      setError(t('emailAddressRequired'))
      return
    }
    setError(null)
    setLoading(true)
    // Sign-in only — don't create accounts from this flow.
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    })
    if (error) setError(locale === 'en' ? error.message : t('genericError'))
    else setSent(true)
    setLoading(false)
  }

  async function handleVerify(code: string) {
    setError(null)
    setVerifying(true)
    const { error } = await supabase.auth.verifyOtp({
      type: 'email',
      email: email.trim().toLowerCase(),
      token: code,
    })
    if (error) {
      setError(locale === 'en' ? error.message : t('genericError'))
      setVerifying(false)
    } else {
      // Run server-side post-login side effects, then land the user.
      window.location.href = `/auth/post-login?method=magic_link&next=${encodeURIComponent(destination)}`
    }
  }

  return (
    <AuthShell>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('magicTitle')}</CardTitle>
            <CardDescription>
              {sent
                ? t('magicSentDescription')
                : t('magicDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sent ? (
              <OtpCodeForm
                email={email.trim().toLowerCase()}
                onVerify={handleVerify}
                onResend={handleSend}
                verifying={verifying}
                error={error}
              />
            ) : (
              <>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
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
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                <Button className="w-full" onClick={handleSend} disabled={loading}>
                  {loading ? t('sending') : t('emailCode')}
                </Button>
              </>
            )}

            <p className="text-center text-sm text-muted-foreground">
              <Link href={`/auth${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`} className="text-primary underline underline-offset-4 hover:text-primary/80">
                {t('signInPassword')}
              </Link>
            </p>
          </CardContent>
        </Card>
    </AuthShell>
  )
}
