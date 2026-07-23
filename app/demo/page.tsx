'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { getDemoCredentials } from './actions'

export default function DemoPage() {
  const t = useTranslations('Demo')
  const [failed, setFailed] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function startDemo() {
      // If already signed in, go to dashboard
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        router.replace('/dashboard')
        return
      }

      // Fetch demo credentials via server action (no secrets in client bundle)
      const result = await getDemoCredentials()
      if (!result.ok) {
        setFailed(true)
        return
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: result.email,
        password: result.password,
      })
      if (error) {
        console.error('[demo] signInWithPassword failed:', error.message, error.status)
        setFailed(true)
        return
      }

      router.replace('/dashboard')
    }
    startDemo()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">{t('error')}</p>
          <Link href="/auth" className="text-sm text-blue-600 underline">{t('signIn')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-muted-foreground">{t('loading')}</p>
    </div>
  )
}
