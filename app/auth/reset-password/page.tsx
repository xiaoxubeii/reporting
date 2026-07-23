'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AuthShell } from '@/components/auth-shell'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useLocale, useTranslations } from 'next-intl'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const t = useTranslations('Auth')
  const locale = useLocale()

  const router = useRouter()
  const supabase = createClient()

  async function resetPassword() {
    setError(null)

    if (!password || password.length < 8) {
      setError(t('passwordMinimumError'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('passwordMismatch'))
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(locale === 'en' ? error.message : t('genericError'))
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  return (
    <AuthShell>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('setPasswordTitle')}</CardTitle>
            <CardDescription>
              {success ? t('passwordUpdatedDescription') : t('choosePasswordDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success ? (
              <div className="space-y-4">
                <Alert>
                  <AlertDescription>
                    {t('passwordUpdated')}
                  </AlertDescription>
                </Alert>
                <Button className="w-full" onClick={() => router.push('/')}>
                  {t('continue')}
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('newPassword')}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && resetPassword()}
                    autoComplete="new-password"
                    placeholder={t('passwordMinimumPlaceholder')}
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t('confirmPassword')}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && resetPassword()}
                    autoComplete="new-password"
                  />
                </div>

                <Button className="w-full" onClick={resetPassword} disabled={loading}>
                  {loading ? t('updating') : t('updatePassword')}
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
