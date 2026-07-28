'use client'

import { useState } from 'react'
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const t = useTranslations('Auth')
  const locale = useLocale()

  const supabase = createClient()

  async function handleSend() {
    if (!email.trim()) {
      setError(t('emailAddressRequired'))
      return
    }
    setError(null)
    setLoading(true)
    // No redirectTo — the email carries a 6-digit recovery code, not a link.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase())
    if (error) setError(locale === 'en' ? error.message : t('genericError'))
    else setSent(true)
    setLoading(false)
  }

  async function handleVerify(code: string) {
    setError(null)
    setVerifying(true)
    const { error } = await supabase.auth.verifyOtp({
      type: 'recovery',
      email: email.trim().toLowerCase(),
      token: code,
    })
    if (error) {
      setError(locale === 'en' ? error.message : t('genericError'))
      setVerifying(false)
    } else {
      // verifyOtp has just issued a browser session. Re-enter the server-side
      // Host/Fund boundary before allowing that session to update credentials.
      window.location.href = `/auth/post-login?method=recovery&next=${encodeURIComponent('/auth/reset-password')}`
    }
  }

  return (
    <AuthShell>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg" role="heading" aria-level={2}>{t('forgotTitle')}</CardTitle>
            <CardDescription>
              {sent
                ? t('forgotSentDescription')
                : t('forgotDescription')}
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
              <Link href="/auth" className="text-primary underline underline-offset-4 hover:text-primary/80">
                {t('backToSignIn')}
              </Link>
            </p>
          </CardContent>
        </Card>
    </AuthShell>
  )
}
