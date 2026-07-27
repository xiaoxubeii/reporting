'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowRight, Building2, CheckCircle2, KeyRound, Loader2, LockKeyhole } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeFundSlugCandidate } from '@/lib/tenancy/host'
import { useTenantBranding } from '@/components/tenant-branding-provider'

type PageState = 'loading' | 'create' | 'tenant-invitation' | 'redirecting'

export default function OnboardingClient({ rootDomain }: { rootDomain: string }) {
  const t = useTranslations('Onboarding.identity')
  const searchParams = useSearchParams()
  const tenant = useTenantBranding()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [fundName, setFundName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [claudeApiKey, setClaudeApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const normalizedSlug = useMemo(() => normalizeFundSlugCandidate(slug), [slug])
  const preview = normalizedSlug ? `${normalizedSlug}.${rootDomain}` : `—.${rootDomain}`

  useEffect(() => {
    let active = true
    void fetch('/api/onboarding/fund', { cache: 'no-store' })
      .then(async response => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!active) return
        if (response.ok && body.state === 'created' && typeof body.canonicalOrigin === 'string') {
          setPageState('redirecting')
          window.location.assign(`${body.canonicalOrigin}/funds/setup`)
          return
        }
        setPageState(tenant ? 'tenant-invitation' : 'create')
      })
      .catch(() => {
        if (active) setPageState(tenant ? 'tenant-invitation' : 'create')
      })
    return () => { active = false }
  }, [tenant])

  function updateFundName(value: string) {
    setFundName(value)
    if (!slugTouched) setSlug(normalizeFundSlugCandidate(value) ?? '')
  }

  async function createFund() {
    if (!fundName.trim() || !normalizedSlug) {
      setError(t('errors.required'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/onboarding/fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundName,
          slug: normalizedSlug,
          ...(claudeApiKey.trim() ? { claudeApiKey: claudeApiKey.trim() } : {}),
        }),
      })
      const body = await response.json()
      if (!response.ok) {
        setError(body.code === 'fund_identity_conflict' ? t('errors.conflict') : (body.error || t('errors.generic')))
        return
      }
      if (typeof body.canonicalOrigin !== 'string') throw new Error('missing canonical origin')
      setPageState('redirecting')
      window.location.assign(`${body.canonicalOrigin}/funds/setup`)
    } catch {
      setError(t('errors.generic'))
    } finally {
      setSaving(false)
    }
  }

  if (pageState === 'loading' || pageState === 'redirecting') {
    return (
      <main className="min-h-screen bg-muted/30 px-4 py-16">
        <div className="mx-auto flex max-w-md items-center justify-center rounded-xl border bg-background p-12 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="ml-3 text-sm text-muted-foreground">{t(pageState === 'loading' ? 'loading' : 'redirecting')}</span>
        </div>
      </main>
    )
  }

  if (pageState === 'tenant-invitation') {
    return (
      <main className="min-h-screen bg-muted/30 px-4 py-16">
        <Card className="mx-auto max-w-lg border-border/80 shadow-sm">
          <CardHeader>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border bg-muted">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <CardTitle>{t('tenant.title', { fundName: tenant?.name ?? '' })}</CardTitle>
            <CardDescription>{t('tenant.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full"><a href="/invite">{t('tenant.openInvite')}</a></Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10 sm:py-16">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border bg-background shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
        <section className="flex flex-col justify-between border-b bg-foreground p-7 text-background lg:border-b-0 lg:border-r lg:p-10">
          <div>
            <div className="mb-10 flex items-center gap-2 text-sm font-medium text-background/70">
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
              {t('eyebrow')}
            </div>
            <h1 className="max-w-sm text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-background/65">{t('description')}</p>
          </div>
          <div className="mt-12 rounded-xl border border-background/15 bg-background/5 p-5">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-background/50">{t('previewLabel')}</p>
            <p className="mt-2 break-all font-mono text-lg text-background">{preview}</p>
            <p className="mt-3 text-xs leading-5 text-background/55">{t('immutableHelp')}</p>
          </div>
        </section>

        <section className="p-6 sm:p-10">
          {searchParams.get('confirmed') === 'true' && (
            <Alert className="mb-6 border-emerald-500/30 bg-emerald-500/5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertDescription>{t('emailConfirmed')}</AlertDescription>
            </Alert>
          )}
          <div className="mb-7">
            <h2 className="text-xl font-semibold tracking-tight">{t('formTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('formDescription')}</p>
          </div>
          <form className="space-y-5" onSubmit={event => { event.preventDefault(); void createFund() }}>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="space-y-2">
              <Label htmlFor="fund-name">{t('fundName')}</Label>
              <Input
                id="fund-name"
                autoComplete="organization"
                value={fundName}
                onChange={event => updateFundName(event.target.value)}
                placeholder={t('fundNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fund-slug">{t('slug')}</Label>
              <div className="flex min-w-0 rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <input
                  id="fund-slug"
                  value={slug}
                  onChange={event => { setSlugTouched(true); setSlug(event.target.value) }}
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                  placeholder="cci"
                  spellCheck={false}
                  autoCapitalize="none"
                  aria-describedby="fund-slug-help"
                />
                <span className="max-w-[55%] truncate border-l bg-muted px-3 py-2 text-sm text-muted-foreground">.{rootDomain}</span>
              </div>
              <p id="fund-slug-help" className="text-xs text-muted-foreground">{t('slugHelp')}</p>
            </div>

            <details className="group rounded-lg border bg-muted/20">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium">
                <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {t('optionalAi')}
              </summary>
              <div className="border-t px-4 py-4">
                <Label htmlFor="claude-key">{t('claudeKey')}</Label>
                <Input
                  id="claude-key"
                  type="password"
                  autoComplete="off"
                  value={claudeApiKey}
                  onChange={event => setClaudeApiKey(event.target.value)}
                  placeholder="sk-ant-…"
                  className="mt-2"
                />
                <p className="mt-2 text-xs text-muted-foreground">{t('optionalAiHelp')}</p>
              </div>
            </details>

            <Button type="submit" className="w-full" size="lg" disabled={saving || !fundName.trim() || !normalizedSlug}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('create')}
              {!saving ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
            </Button>
            <p className="text-center text-xs leading-5 text-muted-foreground">{t('reauthNotice')}</p>
          </form>
        </section>
      </div>
    </main>
  )
}
