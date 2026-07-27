'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Circle, Loader2, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type StepKey = 'profile' | 'mailbox' | 'branding' | 'email' | 'members'
interface SetupStep { key: StepKey; complete: boolean; optional: boolean; href: string }
interface SetupState {
  fund: { name: string; slug: string; emailSubdomain: string | null }
  steps: SetupStep[]
  completeCount: number
  totalCount: number
}

export default function FundSetupPage() {
  const t = useTranslations('FundSetup')
  const [setup, setSetup] = useState<SetupState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/onboarding/setup', { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok || !body.setup) throw new Error(body.error || t('error'))
      setSetup(body.setup)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{t('eyebrow')}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{setup ? t('description', { fundName: setup.fund.name }) : t('loadingDescription')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {t('refresh')}
        </Button>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {loading && !setup ? (
        <Card><CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('loading')}</CardContent></Card>
      ) : setup ? (
        <>
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base">{t('progress.title')}</CardTitle>
                  <CardDescription>{t('progress.description', { complete: setup.completeCount, total: setup.totalCount })}</CardDescription>
                </div>
                <span className="font-mono text-2xl font-semibold tabular-nums">{setup.completeCount}/{setup.totalCount}</span>
              </div>
            </CardHeader>
            <CardContent><div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={t('progress.title')} aria-valuemin={0} aria-valuemax={setup.totalCount} aria-valuenow={setup.completeCount}><div className="h-full bg-foreground transition-all" style={{ width: `${(setup.completeCount / setup.totalCount) * 100}%` }} /></div></CardContent>
          </Card>

          <div className="grid gap-3">
            {setup.steps.map(step => (
              <Link key={step.key} href={step.href} className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${step.complete ? 'border-emerald-600 bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                  {step.complete ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                  <span className="sr-only">{t(step.complete ? 'completed' : 'pending')}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{t(`steps.${step.key}.title`)}</span>
                    <Badge variant="secondary">{step.optional ? t('optional') : t('required')}</Badge>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t(`steps.${step.key}.description`)}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
