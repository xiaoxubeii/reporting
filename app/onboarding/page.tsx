'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, Loader2, X, Plus, Building2, HardDrive } from 'lucide-react'
import { useTenantBranding } from '@/components/tenant-branding-provider'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Sender {
  email: string
  label: string
}

interface OnboardingState {
  fundId: string | null
  webhookToken: string | null
}

interface MatchingFund {
  id: string
  name: string
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = [
  { n: 1, key: 'steps.fundSetup' },
  { n: 2, key: 'steps.emailIntegration' },
  { n: 3, key: 'steps.senders' },
  { n: 4, key: 'steps.googleDrive' },
] as const

function StepIndicator({ current }: { current: number }) {
  const t = useTranslations('Onboarding')

  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((step, i) => (
        <div key={step.n} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {current > step.n ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : current === step.n ? (
              <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary-foreground">{step.n}</span>
              </div>
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
            <span
              className={`text-sm ${
                current === step.n ? 'font-medium' : 'text-muted-foreground'
              }`}
            >
              {t(step.key)}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="w-8 h-px bg-border mx-1" />
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('Onboarding')
  const tenant = useTenantBranding()

  const [loading, setLoading] = useState(true)
  const [matchingFund, setMatchingFund] = useState<MatchingFund | null>(null)
  const [mode, setMode] = useState<'detect' | 'join' | 'create' | 'tenant-blocked'>('detect')
  const [step, setStep] = useState(1)
  const [state, setState] = useState<OnboardingState>({ fundId: null, webhookToken: null })
  const emailConfirmed = searchParams.get('confirmed') === 'true'

  const detectFund = useCallback(async () => {
    // Check if returning from Google Drive OAuth
    const googleConnected = searchParams.get('google_connected') === 'true'

    // Check if the user has an in-progress onboarding to resume
    const statusRes = await fetch('/api/onboarding/fund')
    if (statusRes.ok) {
      const status = await statusRes.json()
      if (status.step === 'complete' && !googleConnected) {
        router.push('/dashboard')
        return
      }
      if (status.fundId) {
        setState({ fundId: status.fundId, webhookToken: status.webhookToken })

        if (googleConnected) {
          // Returning from Google OAuth — go to step 4 with success
          setStep(4)
        } else if (status.step === 'complete') {
          // All required steps done, show optional Google Drive step
          setStep(4)
        } else if (typeof status.step === 'number' && status.step > 1) {
          setStep(status.step)
        }

        setMode('create')
        setLoading(false)
        return
      }
    }

    // No existing fund — check for domain-matching fund to join
    const res = await fetch('/api/onboarding/check-domain')
    if (res.ok) {
      const data = await res.json()
      if (data.fund) {
        setMatchingFund(data.fund)
        setMode('join')
        setLoading(false)
        return
      }
    }

    setMode(tenant ? 'tenant-blocked' : 'create')
    setLoading(false)
  }, [router, searchParams, tenant])

  useEffect(() => { detectFund() }, [detectFund])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const confirmedBanner = emailConfirmed ? (
    <Alert className="mb-6 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
      <AlertDescription className="text-green-800 dark:text-green-200">
        {t('emailConfirmed')}
      </AlertDescription>
    </Alert>
  ) : null

  if (mode === 'join' && matchingFund) {
    return (
      <JoinFundScreen
        fund={matchingFund}
        onCreateInstead={tenant ? undefined : () => setMode('create')}
        confirmedBanner={confirmedBanner}
      />
    )
  }

  if (mode === 'tenant-blocked' && tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded bg-muted">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle>
              <h1>{t('join.workspaceTitle', { fundName: tenant.name })}</h1>
            </CardTitle>
            <CardDescription>{t('join.workspaceUnavailable')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-lg">
        {confirmedBanner}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('description')}
          </p>
        </div>

        <StepIndicator current={step} />

        {step === 1 && (
          <Step1
            onComplete={(fundId, webhookToken) => {
              setState({ fundId, webhookToken })
              setStep(2)
            }}
          />
        )}
        {step === 2 && state.fundId && state.webhookToken && (
          <Step2
            fundId={state.fundId}
            webhookToken={state.webhookToken}
            onComplete={() => setStep(3)}
          />
        )}
        {step === 3 && state.fundId && (
          <Step3
            fundId={state.fundId}
            onComplete={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <Step4
            googleConnected={searchParams.get('google_connected') === 'true'}
            onComplete={() => router.push('/dashboard')}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Join existing fund screen
// ---------------------------------------------------------------------------

function JoinFundScreen({
  fund,
  onCreateInstead,
  confirmedBanner,
}: {
  fund: MatchingFund
  onCreateInstead?: () => void
  confirmedBanner?: React.ReactNode
}) {
  const router = useRouter()
  const t = useTranslations('Onboarding')
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function requestJoin() {
    setRequesting(true)
    setError(null)

    try {
      const res = await fetch('/api/onboarding/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundId: fund.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : t('errors.generic'))
        setRequesting(false)
        return
      }
      setRequested(true)
      setTimeout(() => router.push('/pending'), 1500)
    } catch {
      setError(t('errors.generic'))
    }
    setRequesting(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-4">
        {confirmedBanner}
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t('join.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('join.description')}
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {requested ? (
              <div className="text-center py-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-medium">{t('join.requestSent')}</p>
                <p className="text-sm text-muted-foreground">{t('join.redirecting')}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/50">
                  <Building2 className="h-8 w-8 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium">{fund.name}</p>
                    <p className="text-xs text-muted-foreground">{t('join.existingFund')}</p>
                  </div>
                </div>

                <Button className="w-full" onClick={requestJoin} disabled={requesting}>
                  {requesting ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('join.requesting')}</>
                  ) : (
                    t('join.request')
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  {t('join.reviewNotice')}
                </p>

                {onCreateInstead && (
                  <>
                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">{t('join.or')}</span>
                      </div>
                    </div>

                    <Button variant="outline" className="w-full" onClick={onCreateInstead}>
                      {t('join.createInstead')}
                    </Button>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1: Fund name + Claude API key
// ---------------------------------------------------------------------------

function Step1({ onComplete }: { onComplete: (fundId: string, webhookToken: string) => void }) {
  const t = useTranslations('Onboarding')
  const [fundName, setFundName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function testKey() {
    if (!apiKey.trim()) return
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      const res = await fetch('/api/test-claude-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      const data = await res.json()
      if (res.ok) {
        setTestResult('success')
      } else {
        setTestResult('error')
        setTestError(data.error ?? t('errors.connectionFailed'))
      }
    } catch {
      setTestResult('error')
      setTestError(t('errors.network'))
    }
    setTesting(false)
  }

  async function submit() {
    if (!fundName.trim() || !apiKey.trim()) {
      setError(t('step1.bothRequired'))
      return
    }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundName, claudeApiKey: apiKey }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : t('errors.generic'))
        setSaving(false)
        return
      }
      onComplete(data.fundId, data.webhookToken)
    } catch {
      setError(t('errors.generic'))
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('step1.title')}</CardTitle>
        <CardDescription>
          {t('step1.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="fund-name">{t('step1.fundName')}</Label>
          <Input
            id="fund-name"
            placeholder={t('step1.fundNamePlaceholder')}
            value={fundName}
            onChange={e => setFundName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="api-key">{t('step1.apiKey')}</Label>
          <div className="flex gap-2">
            <Input
              id="api-key"
              type="password"
              placeholder="sk-ant-…"
              value={apiKey}
              onChange={e => {
                setApiKey(e.target.value)
                setTestResult(null)
              }}
              className="flex-1"
            />
            <Button variant="outline" onClick={testKey} disabled={testing || !apiKey.trim()}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : t('step1.test')}
            </Button>
          </div>
          {testResult === 'success' && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> {t('step1.connected')}
            </p>
          )}
          {testResult === 'error' && (
            <p className="text-sm text-destructive">{testError}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {t('step1.getKeyAt')}{' '}
            <a
              href="https://console.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              console.anthropic.com
            </a>
          </p>
        </div>

        <Button className="w-full" onClick={submit} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('saving')}</> : t('next')}
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Inbound email setup (Postmark or Mailgun)
// ---------------------------------------------------------------------------

function Step2({
  fundId,
  webhookToken,
  onComplete,
}: {
  fundId: string
  webhookToken: string
  onComplete: () => void
}) {
  const t = useTranslations('Onboarding')
  const [provider, setProvider] = useState<'postmark' | 'mailgun'>('postmark')
  const [inboundAddress, setInboundAddress] = useState('')
  const [mgDomain, setMgDomain] = useState('')
  const [mgSigningKey, setMgSigningKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const defaultBase = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_APP_URL || window.location.origin)
    : ''
  const [baseUrl, setBaseUrl] = useState(defaultBase)
  const postmarkWebhookUrl = `${baseUrl}/api/inbound-email?token=${webhookToken}`
  const mailgunWebhookUrl = `${baseUrl}/api/inbound-email/mailgun`

  async function submit() {
    if (provider === 'postmark' && !inboundAddress.trim()) {
      setError(t('step2.postmarkAddressRequired'))
      return
    }
    if (provider === 'mailgun' && !mgDomain.trim()) {
      setError(t('step2.mailgunDomainRequired'))
      return
    }
    setError(null)
    setSaving(true)
    try {
      const body: Record<string, string> = { fundId, provider }
      if (provider === 'postmark') {
        body.postmarkInboundAddress = inboundAddress
      } else {
        body.mailgunInboundDomain = mgDomain
        if (mgSigningKey.trim()) body.mailgunSigningKey = mgSigningKey
      }
      const res = await fetch('/api/onboarding/inbound-email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : t('errors.generic'))
        setSaving(false)
        return
      }
      onComplete()
    } catch {
      setError(t('errors.generic'))
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('step2.title')}</CardTitle>
        <CardDescription>
          {t('step2.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label>{t('step2.provider')}</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setProvider('postmark')}
              className={`flex-1 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                provider === 'postmark'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'hover:bg-accent'
              }`}
            >
              <span className="font-medium">Postmark</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('step2.postmarkDescription')}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setProvider('mailgun')}
              className={`flex-1 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                provider === 'mailgun'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'hover:bg-accent'
              }`}
            >
              <span className="font-medium">Mailgun</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('step2.mailgunDescription')}
              </p>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="webhook-base-url">{t('step2.baseUrl')}</Label>
          <Input
            id="webhook-base-url"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="https://your-app.vercel.app"
          />
          <p className="text-xs text-muted-foreground">
            {t('step2.baseUrlHelp')}
          </p>
        </div>

        <div className="space-y-2">
          <Label>{t('step2.webhookUrl')}</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted rounded-md px-3 py-2 text-xs break-all font-mono">
              {provider === 'postmark' ? postmarkWebhookUrl : mailgunWebhookUrl}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(
                provider === 'postmark' ? postmarkWebhookUrl : mailgunWebhookUrl
              )}
            >
              {t('step2.copy')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {provider === 'postmark' ? (
              t.rich('step2.postmarkWebhookHelp', {
                settings: chunks => (
                <a
                  href="https://account.postmarkapp.com/servers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {chunks}
                </a>
                ),
                strong: chunks => <strong>{chunks}</strong>,
              })
            ) : (
              t.rich('step2.mailgunWebhookHelp', {
                strong: chunks => <strong>{chunks}</strong>,
              })
            )}
          </p>
        </div>

        {provider === 'postmark' && (
          <div className="space-y-2">
            <Label htmlFor="inbound-address">{t('step2.postmarkAddress')}</Label>
            <Input
              id="inbound-address"
              type="email"
              placeholder="abc123@inbound.postmarkapp.com"
              value={inboundAddress}
              onChange={e => setInboundAddress(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t('step2.postmarkAddressHelp')}
            </p>
          </div>
        )}

        {provider === 'mailgun' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="mg-domain">{t('step2.mailgunDomain')}</Label>
              <Input
                id="mg-domain"
                placeholder="mg.yourdomain.com"
                value={mgDomain}
                onChange={e => setMgDomain(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('step2.mailgunDomainHelp')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mg-signing-key">{t('step2.signingKey')}</Label>
              <Input
                id="mg-signing-key"
                type="password"
                placeholder={t('step2.signingKeyPlaceholder')}
                value={mgSigningKey}
                onChange={e => setMgSigningKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('step2.signingKeyHelp')}
              </p>
            </div>
          </>
        )}

        <Button className="w-full" onClick={submit} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('saving')}</> : t('next')}
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Step 3: Authorized senders
// ---------------------------------------------------------------------------

function Step3({ fundId, onComplete }: { fundId: string; onComplete: () => void }) {
  const t = useTranslations('Onboarding')
  const [senders, setSenders] = useState<Sender[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addSender() {
    if (!newEmail.trim()) return
    setSenders(prev => [...prev, { email: newEmail.trim(), label: newLabel.trim() }])
    setNewEmail('')
    setNewLabel('')
  }

  function removeSender(index: number) {
    setSenders(prev => prev.filter((_, i) => i !== index))
  }

  async function submit() {
    const valid = senders.filter(s => s.email.trim())
    if (valid.length === 0) {
      setError(t('step3.senderRequired'))
      return
    }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/senders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundId, senders: valid }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : t('errors.generic'))
        setSaving(false)
        return
      }
      onComplete()
    } catch {
      setError(t('errors.generic'))
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('step3.title')}</CardTitle>
        <CardDescription>
          {t('step3.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Sender list */}
        {senders.length > 0 && (
          <div className="space-y-2">
            {senders.map((sender, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 bg-muted rounded-md px-3 py-2 text-sm flex items-center justify-between">
                  <span>{sender.email}</span>
                  {sender.label && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {sender.label}
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSender(i)}
                  aria-label={t('step3.removeSender', { email: sender.email })}
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add sender */}
        <div className="space-y-2">
          <Label>{t('step3.addSender')}</Label>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="cfo@portfolio.com"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSender()}
              className="flex-1"
            />
            <Input
              placeholder={t('step3.labelPlaceholder')}
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSender()}
              className="w-36"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={addSender}
              disabled={!newEmail.trim()}
              aria-label={t('step3.addSenderAction')}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Button className="w-full" onClick={submit} disabled={saving}>
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('saving')}</>
          ) : (
            t('next')
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Step 4: Google Drive (optional)
// ---------------------------------------------------------------------------

function Step4({
  googleConnected,
  onComplete,
}: {
  googleConnected: boolean
  onComplete: () => void
}) {
  const t = useTranslations('Onboarding')
  const [configured, setConfigured] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  // Credential entry
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [savingCreds, setSavingCreds] = useState(false)

  // Check if credentials exist (DB or env)
  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => setConfigured(!!data.hasGoogleCredentials))
      .catch(() => setConfigured(false))
  }, [])

  async function saveCredentials() {
    if (!clientId.trim() || !clientSecret.trim()) return
    setSavingCreds(true)
    setConnectError(null)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        googleClientId: clientId.trim(),
        googleClientSecret: clientSecret.trim(),
      }),
    })
    setSavingCreds(false)
    if (res.ok) {
      setConfigured(true)
    } else {
      const data = await res.json().catch(() => ({}))
      setConnectError(data.error || t('step4.saveCredentialsFailed'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('step4.title')}</CardTitle>
        <CardDescription>
          {t('step4.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {googleConnected ? (
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/50">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
            <div>
              <p className="font-medium text-sm">{t('step4.connected')}</p>
              <p className="text-xs text-muted-foreground">
                {t('step4.connectedHelp')}
              </p>
            </div>
          </div>
        ) : !configured ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed">
              <HardDrive className="h-6 w-6 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-sm">{t('step4.saveReports')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('step4.enterCredentials')}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <Label htmlFor="google-client-id">{t('step4.clientId')}</Label>
                <Input
                  id="google-client-id"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="123456789.apps.googleusercontent.com"
                />
              </div>
              <div>
                <Label htmlFor="google-client-secret">{t('step4.clientSecret')}</Label>
                <Input
                  id="google-client-secret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="GOCSPX-..."
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('step4.createCredentialsAt')}{' '}
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline">
                  {t('step4.googleCloudConsole')}
                </a>
                {t.rich('step4.redirectUriHelp', {
                  callback: () => (
                    <code className="text-[11px] bg-muted px-1 rounded">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/google/callback
                    </code>
                  ),
                })}
              </p>
              <Button
                className="w-full"
                variant="outline"
                onClick={saveCredentials}
                disabled={savingCreds || !clientId.trim() || !clientSecret.trim()}
              >
                {savingCreds ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t('step4.saveCredentials')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed">
            <HardDrive className="h-6 w-6 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-sm">{t('step4.saveReports')}</p>
              <p className="text-xs text-muted-foreground">
                {t('step4.credentialsConfigured')}
              </p>
            </div>
          </div>
        )}

        {connectError && (
          <Alert variant="destructive">
            <AlertDescription>{connectError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          {!googleConnected && configured && (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => {
                window.location.href = '/api/auth/google?return_to=/onboarding'
              }}
            >
              <HardDrive className="h-4 w-4 mr-2" />
              {t('step4.connect')}
            </Button>
          )}

          <Button className="w-full" onClick={onComplete}>
            {googleConnected ? t('step4.finish') : t('step4.skip')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
