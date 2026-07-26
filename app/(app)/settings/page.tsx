'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import Link from 'next/link'
import { DefaultsEditor } from './memo-agent/defaults/editor'
import { LedgerAgentAccess } from '@/components/ledger-agent-access'
import { VehiclesSettings } from '@/components/vehicles-settings'
import { DefaultMetricsSettings } from '@/components/settings/default-metrics-settings'
import { StyleAnchorsInline } from './memo-agent/style-anchors/style-anchors-inline'
import { SchemasInline } from './memo-agent/schemas/schemas-inline'
import { AppearanceEditor } from './appearance/editor'
import { AlertCircle, Check, ChevronDown, ChevronRight, Loader2, Plus, Trash2, Copy, FolderOpen, Unlink, Shield, ImagePlus, X, Lock, Globe2 } from 'lucide-react'
import { DEFAULT_FEATURE_VISIBILITY } from '@/lib/types/features'
import type { FeatureKey, FeatureVisibility, FeatureVisibilityMap } from '@/lib/types/features'
import { FEATURE_META } from '@/lib/types/feature-meta'
import { AnalystToggleButton } from '@/components/analyst-button'
import { AccessGrid } from '@/components/settings-access-grid'
import { SettingsCard, SettingsCardGrid } from '@/components/settings-card'
import { AnalystPanel } from '@/components/analyst-panel'
import { AffinityConnect } from '@/components/settings/affinity-connect'
import { HeartbeatConnect } from '@/components/settings/heartbeat-connect'
import { DealResearchSettings } from '@/components/settings/deal-research-settings'
import { useTenantBranding } from '@/components/tenant-branding-provider'
import {
  FundResendInboundProviderFields,
  FundResendOutboundProviderFields,
} from '@/components/settings/fund-email-settings'
import { AdminSectionContext, GroupHeader, Section } from '@/components/settings/section'
import {
  CUSTOM_AI_PROVIDER_LABEL,
  parseCustomAIProviderRequestParameters,
  type CustomAIProviderRequestParameters,
} from '@/lib/ai/custom-provider'

interface Sender {
  id: string
  email: string
  label: string | null
  created_at: string
}

interface Settings {
  fundName: string
  fundLogo: string | null
  fundAddress: string | null
  postmarkInboundAddress: string
  postmarkWebhookToken: string
  hasClaudeKey: boolean
  claudeModel: string
  hasOpenAIKey: boolean
  openaiModel: string
  defaultAIProvider: string
  hasGeminiKey: boolean
  geminiModel: string
  ollamaBaseUrl: string
  ollamaModel: string
  hasOpenRouterKey: boolean
  openrouterModel: string
  openrouterBaseUrl: string
  openrouterRequestParameters: CustomAIProviderRequestParameters
  customAIProviderConfigured: boolean
  retainResolvedReviews: boolean
  resolvedReviewsTtlDays: number | null
  senders: Sender[]
  googleDriveConnected: boolean
  googleDriveFolderId: string | null
  googleDriveFolderName: string | null
  hasGoogleCredentials: boolean
  googleClientId: string
  fileStorageProvider: string | null
  dropboxConnected: boolean
  hasDropboxCredentials: boolean
  dropboxAppKey: string
  dropboxFolderPath: string | null
  aiSummaryPrompt: string | null
  outboundEmailProvider: string | null
  asksEmailProvider: string | null
  approvalEmailSubject: string | null
  approvalEmailBody: string | null
  systemEmailFromName: string | null
  systemEmailFromAddress: string | null
  hasResendKey: boolean
  hasPostmarkServerToken: boolean
  inboundEmailProvider: string | null
  mailgunInboundDomain: string
  hasMailgunSigningKey: boolean
  hasMailgunApiKey: boolean
  mailgunSendingDomain: string
  analyticsFathomSiteId: string | null
  analyticsGaMeasurementId: string | null
  analyticsCustomHeadScript: string | null
  disableUserTracking: boolean
  currency: string
  featureVisibility: Record<string, string>
  displayName: string
  isAdmin: boolean
  appVersion: string
  updateAvailable: boolean
  dealThesis: string | null
  dealScreeningPrompt: string | null
  dealIntakeEnabled: boolean
  dealSubmissionToken: string | null
  routingConfidenceThreshold: number | null
  routingModel: string | null
  lpPortalEnabled: boolean
}

export default function SettingsPage() {
  const tenantBranding = useTenantBranding()
  const router = useRouter()
  const t = useTranslations('Settings')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/settings')
    if (res.ok) setSettings(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="mb-6 space-y-1">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <AnalystToggleButton />
          </div>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 max-w-3xl w-full">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-lg" />)}
          </div>
        </div>
        <AnalystPanel />
        </div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="p-4 md:p-8">
        <div className="mb-6 space-y-1">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <AnalystToggleButton />
          </div>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 max-w-3xl w-full">
          <p className="text-muted-foreground">{t('errors.load')}</p>
        </div>
        <AnalystPanel />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <AnalystToggleButton />
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex-1 min-w-0 max-w-3xl w-full space-y-8">

      <ProfileSection displayName={settings.displayName} onSaved={load} />
      <MfaSection />
      {settings.isAdmin && (
        <AdminSectionContext.Provider value={true}>
          <VersionSection appVersion={settings.appVersion} updateAvailable={settings.updateAvailable} />
          <FundNameSection name={settings.fundName} logo={settings.fundLogo} address={settings.fundAddress} onSaved={load} />
          <Section title={t('sections.appearance')}>
            <AppearanceEditor />
          </Section>
          {tenantBranding && <Section title={t('sections.publicSite')}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-muted p-2"><Globe2 className="h-4 w-4 text-muted-foreground" /></div>
                <p className="text-sm leading-6 text-muted-foreground">{t('publicSiteEntry.description')}</p>
              </div>
              <Button variant="outline" size="sm" asChild className="shrink-0"><Link href="/settings/public-site">{t('publicSiteEntry.action')}</Link></Button>
            </div>
          </Section>}
          <CurrencySection currency={settings.currency} onSaved={load} />
          <FeatureVisibilitySection featureVisibility={settings.featureVisibility} lpPortalEnabled={settings.lpPortalEnabled} onSaved={load} />
          <Section title={t('sections.investmentVehicles')}>
            <VehiclesSettings />
          </Section>
          <Section title={t('sections.defaultMetrics')}>
            <DefaultMetricsSettings />
          </Section>
        </AdminSectionContext.Provider>
      )}
      {/* Per-USER, not per-fund: the Affinity key is the caller's own personal access
          token and every user needs their own. This section used for all external data integrations. */}
      <GroupHeader label={t('groups.externalData')} />
      <AffinityConnect />
      {/* Heartbeat, unlike Affinity, is a per-FUND credential that reads the whole
          community — so the card is admin-only and renders nothing for everyone else. */}
      <HeartbeatConnect />

      <GroupHeader label={t('groups.notes')} />
      <NotificationPreferencesSection />
      {/* No longer gated on the accounting feature: the agent surface now covers the
          portfolio, companies, performance and LPs as well as the ledger, so a fund with
          accounting switched off still has most of it. */}
      <GroupHeader label={t('groups.aiAgents')} />
      <Section title={t('sections.agentAccess')}>
        <LedgerAgentAccess isAdmin={settings.isAdmin} />
      </Section>
      {!settings.isAdmin && (
        <AiSummaryPromptReadOnly prompt={settings.aiSummaryPrompt} />
      )}
      {!settings.isAdmin && (
        settings.outboundEmailProvider === 'resend' || settings.asksEmailProvider === 'resend'
      ) && (
        <>
          <GroupHeader label={t('groups.outboundEmail')} />
          <FundResendOutboundProviderFields onChanged={load} />
        </>
      )}
      {settings.isAdmin && (
        <AdminSectionContext.Provider value={true}>
          <GroupHeader label={t('groups.inboundEmail')} />
          <InboundEmailSection
            provider={settings.inboundEmailProvider}
            postmarkAddress={settings.postmarkInboundAddress}
            postmarkToken={settings.postmarkWebhookToken}
            mailgunInboundDomain={settings.mailgunInboundDomain}
            hasMailgunSigningKey={settings.hasMailgunSigningKey}
            onSaved={load}
          />
          <SendersSection senders={settings.senders} onChanged={load} />

          <GroupHeader label={t('groups.outboundEmail')} />
          <OutboundEmailSection
            provider={settings.outboundEmailProvider}
            asksProvider={settings.asksEmailProvider}
            approvalEmailSubject={settings.approvalEmailSubject}
            approvalEmailBody={settings.approvalEmailBody}
            systemEmailFromName={settings.systemEmailFromName}
            systemEmailFromAddress={settings.systemEmailFromAddress}
            hasResendKey={settings.hasResendKey}
            hasPostmarkServerToken={settings.hasPostmarkServerToken}
            hasMailgunApiKey={settings.hasMailgunApiKey}
            mailgunSendingDomain={settings.mailgunSendingDomain}
            googleConnected={settings.googleDriveConnected}
            hasGoogleCredentials={settings.hasGoogleCredentials}
            googleClientId={settings.googleClientId}
            onSaved={load}
          />

          <GroupHeader label={t('groups.ai')} />
          <AIProvidersSection
            hasClaudeKey={settings.hasClaudeKey}
            claudeModel={settings.claudeModel}
            hasOpenAIKey={settings.hasOpenAIKey}
            openaiModel={settings.openaiModel}
            hasGeminiKey={settings.hasGeminiKey}
            geminiModel={settings.geminiModel}
            ollamaBaseUrl={settings.ollamaBaseUrl}
            ollamaModel={settings.ollamaModel}
            hasOpenRouterKey={settings.hasOpenRouterKey}
            openrouterModel={settings.openrouterModel}
            openrouterBaseUrl={settings.openrouterBaseUrl}
            openrouterRequestParameters={settings.openrouterRequestParameters}
            customAIProviderConfigured={settings.customAIProviderConfigured}
            defaultAIProvider={settings.defaultAIProvider}
            onSaved={load}
          />
          <AiSummaryPromptSection currentPrompt={settings.aiSummaryPrompt} onSaved={load} />

          <GroupHeader label={t('groups.deals')} />
          <DealScreeningSection
            thesis={settings.dealThesis}
            prompt={settings.dealScreeningPrompt}
            intakeEnabled={settings.dealIntakeEnabled}
            submissionToken={settings.dealSubmissionToken}
            onSaved={load}
          />
          <DealResearchSettings />
          <KnownReferrersSection />
          <RoutingSection
            threshold={settings.routingConfidenceThreshold}
            model={settings.routingModel}
            onSaved={load}
          />
          <Section title={t('sections.dealAi')}>
            <p className="text-xs text-muted-foreground mb-3">
              {t('dealAiDescription')}
            </p>
            <DefaultsEditor embedded section="features" />
          </Section>

          <GroupHeader label={t('groups.diligence')} />
          <MemoAgentSection />

          <GroupHeader label={t('groups.storage')} />
          <StorageSection
            fileStorageProvider={settings.fileStorageProvider}
            googleDriveConnected={settings.googleDriveConnected}
            googleDriveFolderId={settings.googleDriveFolderId}
            googleDriveFolderName={settings.googleDriveFolderName}
            hasGoogleCredentials={settings.hasGoogleCredentials}
            dropboxConnected={settings.dropboxConnected}
            hasDropboxCredentials={settings.hasDropboxCredentials}
            dropboxAppKey={settings.dropboxAppKey}
            dropboxFolderPath={settings.dropboxFolderPath}
            onChanged={load}
          />
          <GroupHeader label={t('groups.analytics')} />
          <AnalyticsSection
            fathomSiteId={settings.analyticsFathomSiteId}
            gaMeasurementId={settings.analyticsGaMeasurementId}
            onSaved={load}
          />
          <UsageTrackingSection
            disableUserTracking={settings.disableUserTracking}
            onSaved={load}
          />
          <GroupHeader label={t('groups.accessControl')} />
          <AuthEmailTemplatesSection />
          <WhitelistSection />
          <TeamSection isAdmin={settings.isAdmin} featureVisibility={settings.featureVisibility} />
          <DangerZone onDeleted={() => router.push('/auth')} />
        </AdminSectionContext.Provider>
      )}

    </div>
    <AnalystPanel />
    </div>
    </div>
  )
}

// ──────────────────────────── Version ────────────────────────────

function VersionSection({ appVersion, updateAvailable }: { appVersion: string; updateAvailable: boolean }) {
  const t = useTranslations('Settings.page.version')
  return (
    <div className="rounded-lg border border-amber-500/30 bg-card p-5">
      <h2 className="text-sm font-medium mb-1 flex items-center gap-1.5">
        <Lock className="h-3 w-3 text-amber-500" />
        {t('title')}
      </h2>
      {updateAvailable ? (
        <p className="text-xs text-muted-foreground">
          {t.rich('updateAvailable', { version: appVersion, versionTag: chunks => <span className="font-mono font-medium text-foreground">v{chunks}</span> })}{' '}
          <Link href="/updates" className="text-amber-600 dark:text-amber-400 underline underline-offset-4 hover:text-amber-500">
            {t('viewUpdate')}
          </Link>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t.rich('upToDate', { version: appVersion, versionTag: chunks => <span className="font-mono font-medium text-foreground">v{chunks}</span> })}{' '}
          <a
            href="https://github.com/tdavidson/reporting/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            {t('viewReleases')}
          </a>
        </p>
      )}
    </div>
  )
}

// ──────────────────────────── Profile ────────────────────────────

function ProfileSection({ displayName, onSaved }: { displayName: string; onSaved: () => void }) {
  const t = useTranslations('Settings.page.profile')
  const [value, setValue] = useState(displayName)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: value }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    }
  }

  return (
    <Section title={t('title')}>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
        <div className="flex-1">
          <Label>{t('displayName')}</Label>
          <p className="text-xs text-muted-foreground mt-1 mb-1.5">
            {t('help')}
          </p>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('placeholder')}
          />
        </div>
        <Button onClick={handleSave} disabled={saving || value === displayName} size="sm">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : t('save')}
        </Button>
      </div>
    </Section>
  )
}

// ──────────────────────────── MFA ────────────────────────────

function MfaSection() {
  const t = useTranslations('Settings.page.mfa')
  const supabase = createClient()
  const [state, setState] = useState<'loading' | 'disabled' | 'enrolling' | 'enabled'>('loading')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [enrolledFactorId, setEnrolledFactorId] = useState<string | null>(null)
  const [verifiedFactorIds, setVerifiedFactorIds] = useState<string[]>([])
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [disabling, setDisabling] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function check() {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const verified = factors?.totp?.filter(f => f.status === 'verified') ?? []
      if (verified.length > 0) {
        setVerifiedFactorIds(verified.map(f => f.id))
        setState('enabled')
      } else {
        setState('disabled')
      }
    }
    check()
  }, [supabase])

  async function startEnroll() {
    setError(null)
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (error) {
      setError(error.message)
      return
    }
    setEnrolledFactorId(data.id)
    setQrCode(data.totp.qr_code)
    setSecret(data.totp.secret)
    setState('enrolling')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function verifyEnroll() {
    if (code.length !== 6 || !enrolledFactorId) return
    setError(null)
    setVerifying(true)
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrolledFactorId })
    if (challengeError) {
      setError(challengeError.message)
      setVerifying(false)
      return
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrolledFactorId,
      challengeId: challenge.id,
      code,
    })
    if (verifyError) {
      setError(verifyError.message)
      setCode('')
      inputRef.current?.focus()
    } else {
      setVerifiedFactorIds([enrolledFactorId])
      setQrCode(null)
      setSecret(null)
      setEnrolledFactorId(null)
      setCode('')
      setState('enabled')
    }
    setVerifying(false)
  }

  async function cancelEnroll() {
    if (enrolledFactorId) {
      await supabase.auth.mfa.unenroll({ factorId: enrolledFactorId })
    }
    setEnrolledFactorId(null)
    setQrCode(null)
    setSecret(null)
    setCode('')
    setError(null)
    setState('disabled')
  }

  async function disableMfa() {
    setDisabling(true)
    setError(null)
    for (const id of verifiedFactorIds) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id })
      if (error) {
        setError(error.message)
        setDisabling(false)
        return
      }
    }
    setVerifiedFactorIds([])
    setConfirmDisable(false)
    setDisabling(false)
    setState('disabled')
  }

  if (state === 'loading') {
    return (
      <Section title={t('title')}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('loading')}
        </div>
      </Section>
    )
  }

  return (
    <Section title={t('title')}>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1 mb-3">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {state === 'disabled' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t('description')}
          </p>
          <Button size="sm" onClick={startEnroll}>
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            {t('enable')}
          </Button>
        </div>
      )}

      {state === 'enrolling' && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {t('scanHelp')}
          </p>
          {qrCode && (
            <div className="flex justify-center">
              <img src={qrCode} alt={t('qrAlt')} className="h-48 w-48 rounded border" />
            </div>
          )}
          {secret && (
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">{t('manualCode')}</p>
              <code className="text-xs bg-muted px-2 py-1 rounded select-all">{secret}</code>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="mfa-enroll-code">{t('verificationCode')}</Label>
            <Input
              ref={inputRef}
              id="mfa-enroll-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && verifyEnroll()}
              autoComplete="one-time-code"
              placeholder="000000"
              className="text-center font-mono text-lg tracking-widest max-w-48 mx-auto"
            />
          </div>
          <div className="flex gap-2 justify-center">
            <Button size="sm" onClick={verifyEnroll} disabled={verifying || code.length !== 6}>
              {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {t('verifyEnable')}
            </Button>
            <Button size="sm" variant="outline" onClick={cancelEnroll} disabled={verifying}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {state === 'enabled' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-green-600 shrink-0" />
            <span>{t('enabled')}</span>
          </div>
          {!confirmDisable ? (
            <Button size="sm" variant="outline" onClick={() => setConfirmDisable(true)}>
              {t('disable')}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="destructive" onClick={disableMfa} disabled={disabling}>
                {disabling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                {t('confirmDisable')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmDisable(false)} disabled={disabling}>
                {t('cancel')}
              </Button>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

// ──────────────────────────── Currency ────────────────────────────

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY', 'CNY', 'INR', 'SGD', 'HKD', 'SEK', 'NOK', 'DKK', 'NZD', 'BRL', 'ZAR', 'ILS', 'KRW'] as const

function CurrencySection({ currency, onSaved }: { currency: string; onSaved: () => void }) {
  const locale = useLocale()
  const t = useTranslations('Settings.page.currency')
  const [value, setValue] = useState(currency)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency: value }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    }
  }

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-3">
        {t('description')}
      </p>
      <div className="flex items-end gap-3">
        <div className="flex-1 max-w-xs">
          <Label>{t('label')}</Label>
          <select
            value={value}
            onChange={e => setValue(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {SUPPORTED_CURRENCIES.map(code => (
              <option key={code} value={code}>{code} – {new Intl.DisplayNames(locale, { type: 'currency' }).of(code)}</option>
            ))}
          </select>
        </div>
        <Button onClick={handleSave} disabled={saving || value === currency} size="sm">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : t('save')}
        </Button>
      </div>
    </Section>
  )
}

// ──────────────────────────── Feature Visibility ────────────────────────────


// These four set the fund-level CEILING, not the answer: a member also needs the matching per-user
// grant (Team, below). "Members" therefore means "each member reaches it subject to their grant" —
// hence labels that name the grant rather than promising blanket visibility.
//
// "Hidden" used to read "Removed from sidebar, still accessible via URL". That was accurate and it
// was the bug: hiding a page while its API still served the data is not access control. Hidden now
// denies every surface.
const VISIBILITY_OPTIONS: { value: Exclude<FeatureVisibility, 'hidden'> }[] = [
  { value: 'everyone' },
  { value: 'admin' },
  { value: 'off' },
]

/** Stored `hidden` is the same as `off` now — show it as Off rather than a fourth button. */
const displayLevel = (level: FeatureVisibility): FeatureVisibility => (level === 'hidden' ? 'off' : level)

function FeatureVisibilitySection({
  featureVisibility,
  lpPortalEnabled,
  onSaved,
}: {
  featureVisibility: Record<string, string>
  lpPortalEnabled: boolean
  onSaved: () => void
}) {
  const t = useTranslations('Settings.page.visibility')
  const [values, setValues] = useState<Record<string, string>>(featureVisibility)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleChange = async (key: FeatureKey, level: FeatureVisibility) => {
    const next = { ...values, [key]: level }
    setValues(next)
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featureVisibility: next }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    }
  }

  const features = Object.keys(DEFAULT_FEATURE_VISIBILITY) as FeatureKey[]

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-4">
        {t('description')}
      </p>

      {/* The one switch here that isn't about your team. It decides whether your INVESTORS have a
          portal at all — and the two LP cards below only mean anything while it's on, which is why
          it sits with them rather than in a section of its own further down the page. */}
      <div className="mb-3">
        <LpPortalCard enabled={lpPortalEnabled} onSaved={onSaved} />
      </div>

      <SettingsCardGrid>
        {features.map(key => {
          const current = displayLevel((values[key] ?? DEFAULT_FEATURE_VISIBILITY[key]) as FeatureVisibility)
          const meta = FEATURE_META[key]
          return (
            <SettingsCard
              key={key}
              title={meta.label}
              subtitle={
                <>
                  {meta.description}{' '}
                  <Link href={meta.href} className="underline underline-offset-2 hover:text-foreground">{t('learnMore')}</Link>
                </>
              }
            >
              {/* One button per level rather than a select: there are only three, and which one is
                  active is the thing you scan a long list for. */}
              <div className="flex flex-wrap gap-1.5">
                {VISIBILITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleChange(key, opt.value)}
                    title={t(`options.${opt.value}.description`)}
                    className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                      current === opt.value
                        ? 'border-foreground/30 bg-accent font-medium'
                        : 'hover:bg-accent/30'
                    }`}
                  >
                    {t(`options.${opt.value}.label`)}
                  </button>
                ))}
              </div>
            </SettingsCard>
          )
        })}
      </SettingsCardGrid>
      {saving && <p className="text-xs text-muted-foreground mt-3">{t('saving')}</p>}
      {saved && <p className="text-xs text-green-600 mt-3">{t('saved')}</p>}
    </Section>
  )
}

// ──────────────────────────── Notification Preferences ────────────────────────────

function NotificationPreferencesSection() {
  const t = useTranslations('Settings.page.notifications')
  const [level, setLevel] = useState<string>('mentions')
  const [subscribedIds, setSubscribedIds] = useState<string[]>([])
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/notifications').then(r => r.json()),
      fetch('/api/companies').then(r => r.json()),
    ]).then(([prefs, companiesData]) => {
      if (prefs.level) setLevel(prefs.level)
      if (prefs.subscribedCompanyIds) setSubscribedIds(prefs.subscribedCompanyIds)
      if (Array.isArray(companiesData)) {
        setCompanies(companiesData.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)))
      }
    }).finally(() => setLoading(false))
  }, [])

  const save = async (newLevel: string, newSubscribedIds?: string[]) => {
    setSaving(true)
    const body: Record<string, unknown> = { level: newLevel }
    if (newSubscribedIds !== undefined) body.subscribedCompanyIds = newSubscribedIds
    const res = await fetch('/api/settings/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleLevelChange = (newLevel: string) => {
    setLevel(newLevel)
    save(newLevel)
  }

  const toggleCompany = (companyId: string) => {
    const next = subscribedIds.includes(companyId)
      ? subscribedIds.filter(id => id !== companyId)
      : [...subscribedIds, companyId]
    setSubscribedIds(next)
    save(level, next)
  }

  const options = ['all', 'mentions', 'none'] as const

  return (
    <Section title={t('title')}>
      {loading ? (
        <div className="h-16 bg-muted rounded animate-pulse" />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-3">
            {t('description')}
          </p>
          {options.map(opt => (
            <label
              key={opt}
              className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                level === opt ? 'border-foreground/30 bg-accent/50' : 'hover:bg-accent/30'
              }`}
            >
              <input
                type="radio"
                name="note-notification-level"
                value={opt}
                checked={level === opt}
                onChange={() => handleLevelChange(opt)}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">{t(`options.${opt}.label`)}</span>
                <p className="text-xs text-muted-foreground">{t(`options.${opt}.description`)}</p>
              </div>
            </label>
          ))}

          {level === 'mentions' && companies.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs font-medium mb-2">{t('followCompanies')}</p>
              <p className="text-xs text-muted-foreground mb-2">
                {t('followHelp')}
              </p>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {companies.map(c => (
                  <label key={c.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={subscribedIds.includes(c.id)}
                      onChange={() => toggleCompany(c.id)}
                      className="rounded"
                    />
                    <span className="text-sm">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {saving && <p className="text-xs text-muted-foreground mt-2">{t('saving')}</p>}
          {saved && <p className="text-xs text-green-600 mt-2">{t('saved')}</p>}
        </div>
      )}
    </Section>
  )
}

// ──────────────────────────── Fund Name ────────────────────────────

function FundNameSection({ name, logo, address, onSaved }: { name: string; logo: string | null; address: string | null; onSaved: () => void }) {
  const t = useTranslations('Settings.page.fund')
  const [value, setValue] = useState(name)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(logo)
  const [logoSaving, setLogoSaving] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [addressValue, setAddressValue] = useState(address ?? '')
  const [addressSaving, setAddressSaving] = useState(false)
  const [addressSaved, setAddressSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fundName: value }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    }
  }

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoError(null)

    if (file.size > 200 * 1024) {
      setLogoError(t('fileTooLarge'))
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      setLogoPreview(dataUrl)
      setLogoSaving(true)
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundLogo: dataUrl }),
      })
      setLogoSaving(false)
      if (res.ok) {
        onSaved()
      } else {
        setLogoPreview(logo)
        setLogoError(t('uploadFailed'))
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleRemoveLogo = async () => {
    setLogoSaving(true)
    setLogoError(null)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fundLogo: null }),
    })
    setLogoSaving(false)
    if (res.ok) {
      setLogoPreview(null)
      onSaved()
    }
  }

  return (
    <Section title={t('title')}>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
        <div className="flex-1">
          <Label>{t('name')}</Label>
          <Input value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Button onClick={handleSave} disabled={saving || value === name} size="sm">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : t('save')}
        </Button>
      </div>

      <div className="mt-4 pt-4 border-t">
        <Label>{t('logo')}</Label>
        <p className="text-xs text-muted-foreground mb-2">
          {t('logoHelp')}
        </p>
        <div className="flex items-center gap-3">
          {logoPreview ? (
            <div className="relative">
              <img
                src={logoPreview}
                alt={t('logoAlt')}
                className="h-12 w-12 rounded border object-contain bg-background"
              />
              <button
                onClick={handleRemoveLogo}
                disabled={logoSaving}
                className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/90 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors">
              <ImagePlus className="h-4 w-4" />
              {t('chooseFile')}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoFile}
                className="hidden"
              />
            </label>
          )}
          {logoPreview && (
            <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
              {t('replace')}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoFile}
                className="hidden"
              />
            </label>
          )}
          {logoSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </div>
        {logoError && (
          <p className="text-xs text-destructive mt-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {logoError}
          </p>
        )}
      </div>

      <div className="mt-4 pt-4 border-t">
        <Label>{t('address')}</Label>
        <p className="text-xs text-muted-foreground mb-2">
          {t('addressHelp')}
        </p>
        <textarea
          value={addressValue}
          onChange={e => setAddressValue(e.target.value)}
          rows={3}
          className="w-full border rounded p-2 text-sm bg-background mb-2"
          placeholder={t('addressPlaceholder')}
        />
        <Button
          size="sm"
          disabled={addressSaving || addressValue === (address ?? '')}
          onClick={async () => {
            setAddressSaving(true)
            const res = await fetch('/api/settings', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fundAddress: addressValue || null }),
            })
            setAddressSaving(false)
            if (res.ok) {
              setAddressSaved(true)
              setTimeout(() => setAddressSaved(false), 2000)
              onSaved()
            }
          }}
        >
          {addressSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : addressSaved ? <Check className="h-3.5 w-3.5" /> : t('save')}
        </Button>
      </div>
    </Section>
  )
}

// ──────────────────────────── Claude Key ────────────────────────────

// ──────────────────────────── AI Providers ────────────────────────────

function AIProvidersSection({
  hasClaudeKey, claudeModel, hasOpenAIKey, openaiModel, hasGeminiKey, geminiModel, ollamaBaseUrl, ollamaModel, hasOpenRouterKey, openrouterModel, openrouterBaseUrl, openrouterRequestParameters, customAIProviderConfigured, defaultAIProvider, onSaved,
}: {
  hasClaudeKey: boolean
  claudeModel: string
  hasOpenAIKey: boolean
  openaiModel: string
  hasGeminiKey: boolean
  geminiModel: string
  ollamaBaseUrl: string
  ollamaModel: string
  hasOpenRouterKey: boolean
  openrouterModel: string
  openrouterBaseUrl: string
  openrouterRequestParameters: CustomAIProviderRequestParameters
  customAIProviderConfigured: boolean
  defaultAIProvider: string
  onSaved: () => void
}) {
  const t = useTranslations('Settings.page.aiProviders')
  const [defaultProvider, setDefaultProvider] = useState(defaultAIProvider)
  const [savingDefault, setSavingDefault] = useState(false)
  const [defaultProviderError, setDefaultProviderError] = useState<string | null>(null)
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set([defaultAIProvider]))

  useEffect(() => { setDefaultProvider(defaultAIProvider) }, [defaultAIProvider])

  const saveDefaultProvider = async (value: string) => {
    const previousProvider = defaultProvider
    setDefaultProvider(value)
    setSavingDefault(true)
    setDefaultProviderError(null)
    // Open the newly selected provider section
    setOpenSections(prev => new Set(prev).add(value))
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultAIProvider: value }),
      })
      const data = await res.json().catch(() => null) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error || t('saveDefaultFailedStatus', { status: res.status }))
      onSaved()
    } catch (error) {
      setDefaultProvider(previousProvider)
      setDefaultProviderError(error instanceof Error ? error.message : t('saveDefaultFailed'))
    } finally {
      setSavingDefault(false)
    }
  }

  const toggleSection = (key: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-3">
        {t('description')}
      </p>
      <div className="flex items-center gap-2 mb-4">
        <Label htmlFor="default-ai-provider" className="text-xs text-muted-foreground shrink-0">{t('defaultProvider')}</Label>
        <Select
          value={defaultProvider}
          onValueChange={saveDefaultProvider}
          disabled={savingDefault}
        >
          <SelectTrigger id="default-ai-provider" className="w-full max-w-xs">
            <SelectValue placeholder={t('chooseProvider')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="anthropic" disabled={!hasClaudeKey}>
              Anthropic (Claude){!hasClaudeKey ? t('noKeySuffix') : ''}
            </SelectItem>
            <SelectItem value="openai" disabled={!hasOpenAIKey}>
              OpenAI{!hasOpenAIKey ? t('noKeySuffix') : ''}
            </SelectItem>
            <SelectItem value="gemini" disabled={!hasGeminiKey}>
              Google Gemini{!hasGeminiKey ? t('noKeySuffix') : ''}
            </SelectItem>
            <SelectItem value="ollama" disabled={!ollamaBaseUrl}>
              Ollama ({t('local')}){!ollamaBaseUrl ? t('notConfiguredSuffix') : ''}
            </SelectItem>
            <SelectItem value="openrouter" disabled={!customAIProviderConfigured}>
              {CUSTOM_AI_PROVIDER_LABEL}{!customAIProviderConfigured ? t('notConfiguredSuffix') : ''}
            </SelectItem>
          </SelectContent>
        </Select>
        {savingDefault && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
      </div>
      {defaultProviderError && (
        <p className="mb-4 text-xs text-destructive" role="alert">{defaultProviderError}</p>
      )}

      <div className="space-y-0 border rounded-lg overflow-hidden">
        <AIProviderDisclosure
          label="Anthropic (Claude)"
          isDefault={defaultProvider === 'anthropic'}
          isOpen={openSections.has('anthropic')}
          onToggle={() => toggleSection('anthropic')}
          hasKey={hasClaudeKey}
        >
          <ClaudeKeyContent hasKey={hasClaudeKey} currentModel={claudeModel} onSaved={onSaved} />
        </AIProviderDisclosure>
        <AIProviderDisclosure
          label="OpenAI"
          isDefault={defaultProvider === 'openai'}
          isOpen={openSections.has('openai')}
          onToggle={() => toggleSection('openai')}
          hasKey={hasOpenAIKey}
        >
          <OpenAIKeyContent hasKey={hasOpenAIKey} currentModel={openaiModel} onSaved={onSaved} />
        </AIProviderDisclosure>
        <AIProviderDisclosure
          label="Google Gemini"
          isDefault={defaultProvider === 'gemini'}
          isOpen={openSections.has('gemini')}
          onToggle={() => toggleSection('gemini')}
          hasKey={hasGeminiKey}
        >
          <GeminiKeyContent hasKey={hasGeminiKey} currentModel={geminiModel} onSaved={onSaved} />
        </AIProviderDisclosure>
        <AIProviderDisclosure
          label={`Ollama (${t('local')})`}
          isDefault={defaultProvider === 'ollama'}
          isOpen={openSections.has('ollama')}
          onToggle={() => toggleSection('ollama')}
          hasKey={!!ollamaBaseUrl}
        >
          <OllamaContent baseUrl={ollamaBaseUrl} currentModel={ollamaModel} onSaved={onSaved} />
        </AIProviderDisclosure>
        <AIProviderDisclosure
          label={CUSTOM_AI_PROVIDER_LABEL}
          isDefault={defaultProvider === 'openrouter'}
          isOpen={openSections.has('openrouter')}
          onToggle={() => toggleSection('openrouter')}
          hasKey={customAIProviderConfigured}
        >
          <CustomOpenAIProviderContent
            hasKey={hasOpenRouterKey}
            currentModel={openrouterModel}
            currentBaseUrl={openrouterBaseUrl}
            currentRequestParameters={openrouterRequestParameters}
            onSaved={onSaved}
          />
        </AIProviderDisclosure>
      </div>
    </Section>
  )
}

function CustomOpenAIProviderContent({
  hasKey,
  currentModel,
  currentBaseUrl,
  currentRequestParameters,
  onSaved,
}: {
  hasKey: boolean
  currentModel: string
  currentBaseUrl: string
  currentRequestParameters: CustomAIProviderRequestParameters
  onSaved: () => void
}) {
  const t = useTranslations('Settings.page.aiProviders')
  const [key, setKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(currentBaseUrl || '')
  const [model, setModel] = useState(currentModel || '')
  const [requestParameters, setRequestParameters] = useState(
    JSON.stringify(currentRequestParameters ?? {}, null, 2),
  )
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'valid' | 'invalid' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function testKey() {
    const parsedRequestParameters = parseRequestParameters()
    if (!parsedRequestParameters) return
    setTesting(true)
    setStatus('idle')
    setError(null)
    try {
      const res = await fetch('/api/test-custom-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: key,
          baseUrl,
          model,
          requestParameters: parsedRequestParameters,
        }),
      })
      const body = await res.json().catch(() => ({})) as { error?: string }
      setStatus(res.ok ? 'valid' : 'invalid')
      if (!res.ok) setError(body.error ?? t('connectionFailed'))
    } catch (error) {
      setStatus('invalid')
      setError(error instanceof Error ? error.message : t('connectionFailed'))
    } finally {
      setTesting(false)
    }
  }

  async function updateProvider() {
    const parsedRequestParameters = parseRequestParameters()
    if (!parsedRequestParameters) return
    setSaving(true)
    setStatus('idle')
    setError(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openrouterApiKey: key.trim(),
          openrouterBaseUrl: baseUrl,
          openrouterModel: model,
          openrouterRequestParameters: parsedRequestParameters,
        }),
      })
      const body = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? t('updateFailed'))
      setKey('')
      setStatus('saved')
      onSaved()
    } catch (error) {
      setError(error instanceof Error ? error.message : t('updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  function parseRequestParameters(): CustomAIProviderRequestParameters | null {
    let parsed: unknown
    try {
      parsed = JSON.parse(requestParameters || '{}')
    } catch {
      setStatus('invalid')
      setError(t('invalidJson'))
      return null
    }

    const result = parseCustomAIProviderRequestParameters(parsed)
    if (!result.ok) {
      setStatus('invalid')
      setError(result.error)
      return null
    }
    return result.value
  }

  const hasCoreConfiguration = !!baseUrl.trim() && !!model.trim()
  const canTest = !!key.trim() && hasCoreConfiguration
  const canUpdate = (!!key.trim() || hasKey) && hasCoreConfiguration

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t('customDescription')}
      </p>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
        <div className="flex-1">
          <Label className="text-xs">{t('apiKey')} {hasKey && <span className="text-muted-foreground">{t('savedReplace')}</span>}</Label>
          <Input
            type="password"
            value={key}
            onChange={(event) => { setKey(event.target.value); setStatus('idle'); setError(null) }}
            placeholder={hasKey ? '••••••••' : t('providerApiKey')}
            className="h-9"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={testKey} disabled={!canTest || testing} variant="outline" size="sm">
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('test')}
          </Button>
          <Button onClick={updateProvider} disabled={!canUpdate || saving} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('update')}
          </Button>
        </div>
      </div>
      {status === 'valid' && <p className="text-xs text-emerald-600 flex items-center gap-1"><Check className="h-3 w-3" /> {t('connectionValid')}</p>}
      {status === 'invalid' && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {t('connectionFailed')}</p>}
      {status === 'saved' && <p className="text-xs text-emerald-600 flex items-center gap-1"><Check className="h-3 w-3" /> {t('providerUpdated')}</p>}
      <div>
        <Label className="text-xs">{t('baseUrl')}</Label>
        <Input value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setStatus('idle'); setError(null) }} placeholder="https://gateway.example.com/v1" className="h-9 font-mono text-xs" />
      </div>
      <div>
        <Label className="text-xs">{t('model')}</Label>
        <Input value={model} onChange={(event) => { setModel(event.target.value); setStatus('idle'); setError(null) }} placeholder={t('modelPlaceholder')} className="h-9 font-mono text-xs" />
      </div>
      <div>
        <Label className="text-xs">{t('customParameters')}</Label>
        <Textarea
          value={requestParameters}
          onChange={(event) => {
            setRequestParameters(event.target.value)
            setStatus('idle')
            setError(null)
          }}
          placeholder="{}"
          rows={4}
          spellCheck={false}
          className="font-mono text-xs"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t('customParametersHelp')}
        </p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function AIProviderDisclosure({ label, isDefault, isOpen, onToggle, hasKey, children }: {
  label: string
  isDefault: boolean
  isOpen: boolean
  onToggle: () => void
  hasKey: boolean
  children: React.ReactNode
}) {
  const t = useTranslations('Settings.page.aiProviders')
  return (
    <div className="border-b last:border-b-0">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors text-left"
      >
        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <span className="flex-1">{label}</span>
        {isDefault && (
          <span className="text-[9px] font-medium text-emerald-600 bg-emerald-500/10 rounded px-1.5 py-0.5 leading-none uppercase tracking-wider">{t('default')}</span>
        )}
        {hasKey ? (
          <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        ) : (
          <span className="text-[10px] text-muted-foreground">{t('notConfigured')}</span>
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  )
}

function ClaudeKeyContent({ hasKey, currentModel, onSaved }: { hasKey: boolean; currentModel: string; onSaved: () => void }) {
  const t = useTranslations('Settings.page.aiProviders')
  const [newKey, setNewKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'valid' | 'invalid' | 'saved'>('idle')

  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState(currentModel)
  const [modelSaving, setModelSaving] = useState(false)
  const [modelsFetched, setModelsFetched] = useState(false)

  const fetchModels = useCallback(async () => {
    if (modelsFetched) return
    setModelsLoading(true)
    setModelsError(null)
    try {
      const res = await fetch('/api/claude-models')
      const data = await res.json()
      if (data.error) setModelsError(data.error)
      setModels(data.models ?? [])
      setModelsFetched(true)
    } catch {
      setModelsError(t('fetchModelsFailed'))
    } finally {
      setModelsLoading(false)
    }
  }, [modelsFetched, t])

  useEffect(() => {
    if (hasKey) fetchModels()
  }, [hasKey, fetchModels])

  useEffect(() => { setSelectedModel(currentModel) }, [currentModel])

  const testKey = async () => {
    setTesting(true)
    setStatus('idle')
    const res = await fetch('/api/test-claude-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: newKey }),
    })
    setTesting(false)
    setStatus(res.ok ? 'valid' : 'invalid')
  }

  const saveKey = async () => {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claudeApiKey: newKey }),
    })
    setSaving(false)
    if (res.ok) {
      setStatus('saved')
      setNewKey('')
      setModelsFetched(false)
      onSaved()
    }
  }

  const saveModel = async (modelId: string) => {
    setSelectedModel(modelId)
    setModelSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claudeModel: modelId }),
    })
    setModelSaving(false)
    if (res.ok) onSaved()
  }

  return (
    <>
      <p className="text-xs text-muted-foreground mb-3">
        {hasKey
          ? t('claudeConfigured')
          : t('claudeMissing')}
      </p>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
        <div className="flex-1">
          <Label>{t('apiKey')}</Label>
          <Input
            type="password"
            value={newKey}
            onChange={(e) => { setNewKey(e.target.value); setStatus('idle') }}
            placeholder="sk-ant-..."
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={testKey} disabled={!newKey.trim() || testing} variant="outline" size="sm">
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('test')}
          </Button>
          <Button onClick={saveKey} disabled={!newKey.trim() || saving} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('update')}
          </Button>
        </div>
      </div>
      {status === 'valid' && <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><Check className="h-3 w-3" /> {t('keyValid')}</p>}
      {status === 'invalid' && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {t('keyInvalid')}</p>}
      {status === 'saved' && <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><Check className="h-3 w-3" /> {t('keyUpdated')}</p>}

      {hasKey && (
        <div className="mt-4 pt-4 border-t">
          <Label>{t('model')}</Label>
          <p className="text-xs text-muted-foreground mb-2">{t('chooseModel', { provider: 'Claude' })}</p>
          {modelsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('loadingModels')}</div>
          ) : modelsError ? (
            <p className="text-xs text-destructive">{modelsError}</p>
          ) : (
            <div className="flex items-center gap-2">
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={selectedModel} onChange={(e) => saveModel(e.target.value)} disabled={modelSaving}>
                {models.length === 0 && <option value={selectedModel}>{selectedModel}</option>}
                {models.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
              </select>
              {modelSaving && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function OpenAIKeyContent({ hasKey, currentModel, onSaved }: { hasKey: boolean; currentModel: string; onSaved: () => void }) {
  const t = useTranslations('Settings.page.aiProviders')
  const [newKey, setNewKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'valid' | 'invalid' | 'saved'>('idle')

  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState(currentModel)
  const [modelSaving, setModelSaving] = useState(false)
  const [modelsFetched, setModelsFetched] = useState(false)

  const fetchModels = useCallback(async () => {
    if (modelsFetched) return
    setModelsLoading(true)
    setModelsError(null)
    try {
      const res = await fetch('/api/openai-models')
      const data = await res.json()
      if (data.error) setModelsError(data.error)
      setModels(data.models ?? [])
      setModelsFetched(true)
    } catch {
      setModelsError(t('fetchModelsFailed'))
    } finally {
      setModelsLoading(false)
    }
  }, [modelsFetched, t])

  useEffect(() => { if (hasKey) fetchModels() }, [hasKey, fetchModels])
  useEffect(() => { setSelectedModel(currentModel) }, [currentModel])

  const testKey = async () => {
    setTesting(true)
    setStatus('idle')
    const res = await fetch('/api/test-openai-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: newKey }),
    })
    setTesting(false)
    setStatus(res.ok ? 'valid' : 'invalid')
  }

  const saveKey = async () => {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openaiApiKey: newKey }),
    })
    setSaving(false)
    if (res.ok) {
      setStatus('saved')
      setNewKey('')
      setModelsFetched(false)
      onSaved()
    }
  }

  const saveModel = async (modelId: string) => {
    setSelectedModel(modelId)
    setModelSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openaiModel: modelId }),
    })
    setModelSaving(false)
    if (res.ok) onSaved()
  }

  return (
    <>
      <p className="text-xs text-muted-foreground mb-3">
        {hasKey
          ? t('openaiConfigured')
          : t('openaiMissing')}
      </p>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
        <div className="flex-1">
          <Label>{t('apiKey')}</Label>
          <Input type="password" value={newKey} onChange={(e) => { setNewKey(e.target.value); setStatus('idle') }} placeholder="sk-..." />
        </div>
        <div className="flex gap-2">
          <Button onClick={testKey} disabled={!newKey.trim() || testing} variant="outline" size="sm">
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('test')}
          </Button>
          <Button onClick={saveKey} disabled={!newKey.trim() || saving} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('update')}
          </Button>
        </div>
      </div>
      {status === 'valid' && <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><Check className="h-3 w-3" /> {t('keyValid')}</p>}
      {status === 'invalid' && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {t('keyInvalid')}</p>}
      {status === 'saved' && <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><Check className="h-3 w-3" /> {t('keyUpdated')}</p>}

      {hasKey && (
        <div className="mt-4 pt-4 border-t">
          <Label>{t('model')}</Label>
          <p className="text-xs text-muted-foreground mb-2">{t('chooseModel', { provider: 'OpenAI' })}</p>
          {modelsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('loadingModels')}</div>
          ) : modelsError ? (
            <p className="text-xs text-destructive">{modelsError}</p>
          ) : (
            <div className="flex items-center gap-2">
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={selectedModel} onChange={(e) => saveModel(e.target.value)} disabled={modelSaving}>
                {models.length === 0 && <option value={selectedModel}>{selectedModel}</option>}
                {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {modelSaving && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function GeminiKeyContent({ hasKey, currentModel, onSaved }: { hasKey: boolean; currentModel: string; onSaved: () => void }) {
  const t = useTranslations('Settings.page.aiProviders')
  const [newKey, setNewKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'valid' | 'invalid' | 'saved'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState(currentModel)
  const [modelSaving, setModelSaving] = useState(false)
  const [modelsFetched, setModelsFetched] = useState(false)

  const fetchModels = useCallback(async () => {
    if (modelsFetched) return
    setModelsLoading(true)
    setModelsError(null)
    try {
      const res = await fetch('/api/gemini-models')
      const data = await res.json()
      if (data.error) setModelsError(data.error)
      setModels(data.models ?? [])
      setModelsFetched(true)
    } catch {
      setModelsError(t('fetchModelsFailed'))
    } finally {
      setModelsLoading(false)
    }
  }, [modelsFetched, t])

  useEffect(() => { if (hasKey) fetchModels() }, [hasKey, fetchModels])
  useEffect(() => { setSelectedModel(currentModel) }, [currentModel])

  const testKey = async () => {
    setTesting(true)
    setStatus('idle')
    setErrorMsg('')
    const res = await fetch('/api/test-gemini-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: newKey }),
    })
    if (res.ok) {
      setStatus('valid')
    } else {
      const data = await res.json().catch(() => ({}))
      setErrorMsg(data.error || t('keyInvalid'))
      setStatus('invalid')
    }
    setTesting(false)
  }

  const saveKey = async () => {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geminiApiKey: newKey }),
    })
    setSaving(false)
    if (res.ok) {
      setStatus('saved')
      setNewKey('')
      setModelsFetched(false)
      onSaved()
    }
  }

  const saveModel = async (modelId: string) => {
    setSelectedModel(modelId)
    setModelSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geminiModel: modelId }),
    })
    setModelSaving(false)
    if (res.ok) onSaved()
  }

  return (
    <>
      <p className="text-xs text-muted-foreground mb-3">
        {hasKey
          ? t('geminiConfigured')
          : t('geminiMissing')}
      </p>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
        <div className="flex-1">
          <Label>{t('apiKey')}</Label>
          <Input type="password" value={newKey} onChange={(e) => { setNewKey(e.target.value); setStatus('idle') }} placeholder="AIza..." />
        </div>
        <div className="flex gap-2">
          <Button onClick={testKey} disabled={!newKey.trim() || testing} variant="outline" size="sm">
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('test')}
          </Button>
          <Button onClick={saveKey} disabled={!newKey.trim() || saving} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('update')}
          </Button>
        </div>
      </div>
      {status === 'valid' && <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><Check className="h-3 w-3" /> {t('keyValid')}</p>}
      {status === 'invalid' && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {errorMsg}</p>}
      {status === 'saved' && <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><Check className="h-3 w-3" /> {t('keyUpdated')}</p>}

      {hasKey && (
        <div className="mt-4 pt-4 border-t">
          <Label>{t('model')}</Label>
          <p className="text-xs text-muted-foreground mb-2">{t('chooseModel', { provider: 'Gemini' })}</p>
          {modelsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('loadingModels')}</div>
          ) : modelsError ? (
            <p className="text-xs text-destructive">{modelsError}</p>
          ) : (
            <div className="flex items-center gap-2">
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={selectedModel} onChange={(e) => saveModel(e.target.value)} disabled={modelSaving}>
                {models.length === 0 && <option value={selectedModel}>{selectedModel}</option>}
                {models.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
              </select>
              {modelSaving && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function OllamaContent({ baseUrl, currentModel, onSaved }: { baseUrl: string; currentModel: string; onSaved: () => void }) {
  const t = useTranslations('Settings.page.aiProviders')
  const [url, setUrl] = useState(baseUrl || 'http://localhost:11434/v1')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState('')

  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState(currentModel)
  const [modelSaving, setModelSaving] = useState(false)

  useEffect(() => { setUrl(baseUrl || 'http://localhost:11434/v1') }, [baseUrl])
  useEffect(() => { setSelectedModel(currentModel) }, [currentModel])

  const testConnection = async () => {
    setTesting(true)
    setTestStatus('idle')
    setTestError('')
    try {
      const res = await fetch('/api/test-ollama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: url }),
      })
      if (res.ok) {
        setTestStatus('ok')
        fetchModels()
      } else {
        const data = await res.json()
        setTestStatus('error')
        setTestError(data.error || t('connectionFailed'))
      }
    } catch {
      setTestStatus('error')
      setTestError(t('connectionFailed'))
    }
    setTesting(false)
  }

  const saveUrl = async () => {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ollamaBaseUrl: url }),
    })
    setSaving(false)
    if (res.ok) onSaved()
  }

  const fetchModels = async () => {
    setModelsLoading(true)
    setModelsError(null)
    try {
      const res = await fetch('/api/ollama-models')
      const data = await res.json()
      if (data.error) setModelsError(data.error)
      setModels(data.models ?? [])
    } catch {
      setModelsError(t('fetchModelsFailed'))
    } finally {
      setModelsLoading(false)
    }
  }

  const saveModel = async (modelId: string) => {
    setSelectedModel(modelId)
    setModelSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ollamaModel: modelId }),
    })
    setModelSaving(false)
    if (res.ok) onSaved()
  }

  return (
    <>
      <p className="text-xs text-muted-foreground mb-3">
        {t('ollamaDescription')}
      </p>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
        <div className="flex-1">
          <Label>{t('baseUrl')}</Label>
          <Input value={url} onChange={(e) => { setUrl(e.target.value); setTestStatus('idle') }} placeholder="http://localhost:11434/v1" />
        </div>
        <div className="flex gap-2">
          <Button onClick={testConnection} disabled={!url.trim() || testing} variant="outline" size="sm">
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('test')}
          </Button>
          <Button onClick={saveUrl} disabled={!url.trim() || saving} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('save')}
          </Button>
        </div>
      </div>
      {testStatus === 'ok' && <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><Check className="h-3 w-3" /> {t('connected')}</p>}
      {testStatus === 'error' && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {testError}</p>}

      <div className="mt-4 pt-4 border-t">
        <Label>{t('model')}</Label>
        <p className="text-xs text-muted-foreground mb-2">{t('ollamaModelHelp')}</p>
        {modelsLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('loadingModels')}</div>
        ) : modelsError ? (
          <p className="text-xs text-destructive">{modelsError}</p>
        ) : (
          <div className="flex items-center gap-2">
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={selectedModel} onChange={(e) => saveModel(e.target.value)} disabled={modelSaving}>
              {models.length === 0 && <option value={selectedModel}>{selectedModel}</option>}
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {modelSaving && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
          </div>
        )}
      </div>
    </>
  )
}

// ──────────────────────────── AI Summary Prompt ────────────────────────────

function AiSummaryPromptSection({ currentPrompt, onSaved }: { currentPrompt: string | null; onSaved: () => void }) {
  const t = useTranslations('Settings.page.aiSummary')
  const defaultPrompt = t('defaultPrompt')
  const [value, setValue] = useState(currentPrompt ?? defaultPrompt)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const isCustomized = currentPrompt !== null

  useEffect(() => {
    if (currentPrompt === null) setValue(defaultPrompt)
  }, [currentPrompt, defaultPrompt])

  const handleSave = async () => {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiSummaryPrompt: value }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    }
  }

  const handleReset = async () => {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiSummaryPrompt: null }),
    })
    setSaving(false)
    if (res.ok) {
      setValue(defaultPrompt)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    }
  }

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-3">
        {t('description')}
      </p>
      <textarea
        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono leading-relaxed"
        rows={12}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex items-center gap-2 mt-3">
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : t('save')}
        </Button>
        {isCustomized && (
          <Button onClick={handleReset} disabled={saving} variant="outline" size="sm">
            {t('reset')}
          </Button>
        )}
      </div>
    </Section>
  )
}

function AiSummaryPromptReadOnly({ prompt }: { prompt: string | null }) {
  const t = useTranslations('Settings.page.aiSummary')
  const defaultPrompt = t('defaultPrompt')
  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-3">
        {t('readOnlyDescription')}
      </p>
      <pre className="whitespace-pre-wrap text-sm bg-muted rounded-md px-3 py-2 font-mono leading-relaxed">
        {prompt || defaultPrompt}
      </pre>
    </Section>
  )
}

// ──────────────────────────── Inbound Email ────────────────────────────

function InboundEmailSection({
  provider,
  postmarkAddress,
  postmarkToken,
  mailgunInboundDomain,
  hasMailgunSigningKey,
  onSaved,
}: {
  provider: string | null
  postmarkAddress: string
  postmarkToken: string
  mailgunInboundDomain: string
  hasMailgunSigningKey: boolean
  onSaved: () => void
}) {
  const t = useTranslations('Settings.page.inbound')
  const [selectedProvider, setSelectedProvider] = useState(provider || '')
  useEffect(() => {
    setSelectedProvider(provider || '')
  }, [provider])
  const [addr, setAddr] = useState(postmarkAddress)
  const [mgDomain, setMgDomain] = useState(mailgunInboundDomain)
  const [mgSigningKey, setMgSigningKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const defaultBase = typeof window !== 'undefined' ? window.location.origin : ''
  const [baseUrl, setBaseUrl] = useState(defaultBase)

  const postmarkWebhookUrl = `${baseUrl}/api/inbound-email?token=${postmarkToken}`
  const mailgunWebhookUrl = `${baseUrl}/api/inbound-email/mailgun`

  const handleSave = async () => {
    setSaving(true)
    if (provider === 'resend' && selectedProvider !== 'resend') {
      const disconnected = await fetch('/api/settings/fund-email', { method: 'DELETE' })
      if (!disconnected.ok) {
        setSaving(false)
        return
      }
    }
    const payload: Record<string, unknown> = {
      inboundEmailProvider: selectedProvider || null,
    }
    if (selectedProvider === 'postmark') {
      payload.postmarkInboundAddress = addr?.trim() || null
    }
    if (selectedProvider === 'mailgun') {
      payload.mailgunInboundDomain = mgDomain?.trim() || null
      if (mgSigningKey.trim()) {
        payload.mailgunSigningKey = mgSigningKey.trim()
      }
    }
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setMgSigningKey('')
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    }
  }

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const providerChanged = selectedProvider !== (provider || '')
  const hasNewData =
    (selectedProvider === 'postmark' && addr !== postmarkAddress) ||
    (selectedProvider === 'mailgun' && (mgDomain !== mailgunInboundDomain || mgSigningKey.trim()))
  const canSave = providerChanged || hasNewData

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-3">
        {t('description')}
      </p>
      <div className="space-y-3">
        <div>
          <Label>{t('provider')}</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
          >
            <option value="">{t('none')}</option>
            <option value="postmark">Postmark</option>
            <option value="mailgun">Mailgun</option>
            <option value="resend">Resend</option>
          </select>
        </div>

        {selectedProvider === 'postmark' && (
          <>
            <div>
              <Label>{t('postmarkAddress')}</Label>
              <Input
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
                placeholder="abc123@inbound.postmarkapp.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('postmarkHelp')}
              </p>
            </div>
            {postmarkToken && (
              <div>
                <Label>{t('webhookUrl')}</Label>
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center rounded-md border border-input shadow-sm overflow-hidden">
                    <input
                      className="h-9 w-40 shrink-0 bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://your-app.vercel.app"
                    />
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-2 border-l whitespace-nowrap">/api/inbound-email?token={postmarkToken}</span>
                  </div>
                  <Button onClick={() => copyUrl(postmarkWebhookUrl)} variant="outline" size="icon" className="shrink-0 h-9 w-9">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('postmarkWebhookHelp')}
                </p>
              </div>
            )}
          </>
        )}

        {selectedProvider === 'mailgun' && (
          <>
            <div>
              <Label>{t('mailgunDomain')}</Label>
              <Input
                value={mgDomain}
                onChange={(e) => setMgDomain(e.target.value)}
                placeholder="mg.yourdomain.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('mailgunDomainHelp')}
              </p>
            </div>
            <div>
              <Label>{t('signingKey')}</Label>
              {hasMailgunSigningKey && (
                <p className="text-xs text-muted-foreground mt-1 mb-1.5">
                  {t('signingKeySaved')}
                </p>
              )}
              <Input
                type="password"
                value={mgSigningKey}
                onChange={(e) => setMgSigningKey(e.target.value)}
                placeholder={hasMailgunSigningKey ? '••••••••' : t('signingKeyPlaceholder')}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('signingKeyHelp')}
              </p>
            </div>
            <div>
              <Label>{t('webhookUrl')}</Label>
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center rounded-md border border-input shadow-sm overflow-hidden">
                  <input
                    className="h-9 w-40 shrink-0 bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://your-app.vercel.app"
                  />
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-2 border-l whitespace-nowrap">/api/inbound-email/mailgun</span>
                </div>
                <Button onClick={() => copyUrl(mailgunWebhookUrl)} variant="outline" size="icon" className="shrink-0 h-9 w-9">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('mailgunWebhookHelp')}
              </p>
            </div>
          </>
        )}

        {selectedProvider === 'resend' && (
          <FundResendInboundProviderFields onChanged={onSaved} />
        )}

        {selectedProvider !== 'resend' && (
          <Button onClick={handleSave} disabled={saving || !canSave} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : t('save')}
          </Button>
        )}
      </div>
    </Section>
  )
}

// ──────────────────────────── Google Connection (shared) ────────────────────────────

function GoogleSetupGuide({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  const t = useTranslations('Settings.page.google')
  if (!show) {
    return (
      <button onClick={onToggle} className="text-xs text-muted-foreground hover:text-foreground underline">
        {t('setupGuide')}
      </button>
    )
  }
  return (
    <div className="space-y-1.5">
      <button onClick={onToggle} className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ChevronDown className="h-3 w-3" /> {t('setupGuide')}
      </button>
      <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
        <li>{t('goTo')}{' '}
          <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a>
        </li>
        <li><a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer" className="underline">{t('createProject')}</a> {t('orSelect')}</li>
        <li>{t('configure')}{' '}
          <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer" className="underline">{t('oauthConsent')}</a>
          <ul className="list-disc list-inside ml-3 mt-0.5 space-y-0.5">
            <li>{t.rich('userType', { strong: chunks => <strong>{chunks}</strong> })}</li>
            <li>{t('appDetails')}</li>
            <li>{t('scopes')} <code className="text-[11px] bg-muted px-1 rounded">drive.file</code> / <code className="text-[11px] bg-muted px-1 rounded">gmail.send</code></li>
          </ul>
        </li>
        <li>{t('enableApis')}{' '}
          <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline">Google Drive API</a>,{' '}
          <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline">Gmail API</a>
        </li>
        <li><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline">{t('createCredentials')}</a>
          <ul className="list-disc list-inside ml-3 mt-0.5 space-y-0.5">
            <li>{t.rich('appType', { strong: chunks => <strong>{chunks}</strong> })}</li>
            <li>{t('redirectUri')} <code className="text-[11px] bg-muted px-1 rounded">{typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/google/callback</code></li>
          </ul>
        </li>
        <li>{t.rich('copyCredentials', { strong: chunks => <strong>{chunks}</strong> })}</li>
      </ol>
    </div>
  )
}

function GoogleCredentialsForm({
  clientId,
  onSave,
  onCancel,
  saving,
}: {
  clientId: string
  onSave: (clientId: string, clientSecret: string) => void
  onCancel?: () => void
  saving: boolean
}) {
  const t = useTranslations('Settings.page.google')
  const [newClientId, setNewClientId] = useState(clientId)
  const [newClientSecret, setNewClientSecret] = useState('')
  const [showSetupGuide, setShowSetupGuide] = useState(!clientId)

  useEffect(() => { setNewClientId(clientId) }, [clientId])

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">{t('credentials')}</p>
      <div>
        <Label>{t('clientId')}</Label>
        <Input
          value={newClientId}
          onChange={(e) => setNewClientId(e.target.value)}
          placeholder="123456789.apps.googleusercontent.com"
        />
      </div>
      <div>
        <Label>{t('clientSecret')}</Label>
        <Input
          type="password"
          value={newClientSecret}
          onChange={(e) => setNewClientSecret(e.target.value)}
          placeholder="GOCSPX-..."
        />
      </div>
      <GoogleSetupGuide show={showSetupGuide} onToggle={() => setShowSetupGuide(!showSetupGuide)} />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(newClientId, newClientSecret)} disabled={saving || !newClientId.trim() || !newClientSecret.trim()}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('saveCredentials')}
        </Button>
        {onCancel && (
          <Button size="sm" variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
        )}
      </div>
    </div>
  )
}

function GoogleConnectionUI({
  connected,
  hasCredentials,
  clientId: existingClientId,
  onChanged,
}: {
  connected: boolean
  hasCredentials: boolean
  clientId: string
  onChanged: () => void
}) {
  const t = useTranslations('Settings.page.google')
  const [editingCreds, setEditingCreds] = useState(!hasCredentials)
  const [savingCreds, setSavingCreds] = useState(false)
  const [credsSaved, setCredsSaved] = useState(false)
  const [removingCreds, setRemovingCreds] = useState(false)

  useEffect(() => { if (hasCredentials && editingCreds && credsSaved) setEditingCreds(false) }, [hasCredentials, editingCreds, credsSaved])

  const saveCredentials = async (clientId: string, clientSecret: string) => {
    setSavingCreds(true)
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
      setEditingCreds(false)
      setCredsSaved(true)
      setTimeout(() => setCredsSaved(false), 2000)
      onChanged()
    }
  }

  const removeCredentials = async () => {
    if (!confirm(t('removeConfirm'))) return
    setRemovingCreds(true)
    // Clear credentials and disconnect
    await Promise.all([
      fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleClientId: '', googleClientSecret: '' }),
      }),
      fetch('/api/settings/drive', { method: 'DELETE' }),
    ])
    setRemovingCreds(false)
    setEditingCreds(true)
    onChanged()
  }

  if (connected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-green-600 shrink-0" />
          <span>{t('connected')}</span>
        </div>
        {editingCreds ? (
          <GoogleCredentialsForm
            clientId={existingClientId}
            onSave={saveCredentials}
            onCancel={() => setEditingCreds(false)}
            saving={savingCreds}
          />
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground flex-1">
              {t('configured')}
              {credsSaved && <span className="text-emerald-600 ml-1">{t('saved')}</span>}
            </p>
            <Button size="sm" variant="outline" onClick={() => setEditingCreds(true)} className="text-xs h-7">
              {t('updateCredentials')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { window.location.href = '/api/auth/google' }} className="text-xs h-7">
              {t('reconnect')}
            </Button>
            <Button size="sm" variant="outline" onClick={removeCredentials} disabled={removingCreds} className="text-xs h-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30">
              {removingCreds ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('remove')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {editingCreds || !hasCredentials ? (
        <GoogleCredentialsForm
          clientId={existingClientId}
          onSave={saveCredentials}
          onCancel={hasCredentials ? () => setEditingCreds(false) : undefined}
          saving={savingCreds}
        />
      ) : (
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground flex-1">
            {t('configured')}
            {credsSaved && <span className="text-emerald-600 ml-1">{t('saved')}</span>}
          </p>
          <Button size="sm" variant="outline" onClick={() => setEditingCreds(true)} className="text-xs h-7">
            {t('updateCredentials')}
          </Button>
          <Button size="sm" variant="outline" onClick={removeCredentials} disabled={removingCreds} className="text-xs h-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30">
            {removingCreds ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('remove')}
          </Button>
        </div>
      )}
      {hasCredentials && (
        <Button size="sm" onClick={() => { window.location.href = '/api/auth/google' }}>
          {t('connect')}
        </Button>
      )}
    </div>
  )
}

// ──────────────────────────── Google Drive ────────────────────────────

function GoogleDriveSection({
  connected,
  folderId,
  folderName,
  hasCredentials,
  onChanged,
}: {
  connected: boolean
  folderId: string | null
  folderName: string | null
  hasCredentials: boolean
  onChanged: () => void
}) {
  const t = useTranslations('Settings.page.drive')
  const [folderError, setFolderError] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([])
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string; shared?: boolean }[]>([{ id: null, name: t('myDrive') }])
  const [saving, setSaving] = useState(false)
  const [browseMode, setBrowseMode] = useState<'my' | 'shared'>('my')
  const [urlInput, setUrlInput] = useState('')

  // Resolve a pasted Drive folder URL directly to the saved folder — skips the
  // browser entirely, which matters for deeply-nested or shared-drive folders
  // ("Shared with me" lists every shared folder flat, unusable on a big drive).
  const selectByUrl = async () => {
    if (!urlInput.trim()) return
    setSaving(true)
    setFolderError(null)
    const res = await fetch('/api/settings/drive/folders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlInput.trim() }),
    })
    if (!res.ok) {
      setSaving(false)
      const data = await res.json().catch(() => ({}))
      setFolderError(data.error || t('useFailed'))
      return
    }
    const { folderId, folderName } = await res.json()
    setUrlInput('')
    await selectFolder({ id: folderId, name: folderName })
  }

  const loadFolders = async (parentId?: string, shared?: boolean) => {
    setLoadingFolders(true)
    setFolderError(null)
    try {
      let url = '/api/settings/drive/folders'
      if (shared) {
        url += '?shared=true'
      } else if (parentId) {
        url += `?parent=${parentId}`
      }
      const res = await fetch(url)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setFolderError(data.error || t('listFailed'))
        return
      }
      const data = await res.json()
      setFolders(data.folders ?? [])
    } catch {
      setFolderError(t('listFailed'))
    } finally {
      setLoadingFolders(false)
    }
  }

  const openPicker = () => {
    setShowPicker(true)
    setBrowseMode('my')
    setUrlInput('')
    setBreadcrumbs([{ id: null, name: t('myDrive') }])
    loadFolders()
  }

  const switchToShared = () => {
    setBrowseMode('shared')
    setBreadcrumbs([{ id: null, name: t('shared'), shared: true }])
    loadFolders(undefined, true)
  }

  const switchToMyDrive = () => {
    setBrowseMode('my')
    setBreadcrumbs([{ id: null, name: t('myDrive') }])
    loadFolders()
  }

  const navigateInto = (folder: { id: string; name: string }) => {
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }])
    loadFolders(folder.id)
  }

  const navigateToBreadcrumb = (index: number) => {
    const crumb = breadcrumbs[index]
    setBreadcrumbs(prev => prev.slice(0, index + 1))
    if (crumb.shared) {
      loadFolders(undefined, true)
    } else {
      loadFolders(crumb.id ?? undefined)
    }
  }

  const selectFolder = async (folder: { id: string; name: string }) => {
    setSaving(true)
    setFolderError(null)
    const res = await fetch('/api/settings/drive', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: folder.id, folder_name: folder.name }),
    })
    setSaving(false)
    if (res.ok) {
      setShowPicker(false)
      onChanged()
    } else {
      const data = await res.json().catch(() => ({}))
      setFolderError(data.error || t('selectFailed'))
    }
  }

  const selectCurrentFolder = async () => {
    const current = breadcrumbs[breadcrumbs.length - 1]
    if (!current.id) {
      // Root — use 'root' as the ID
      setSaving(true)
      setFolderError(null)
      const res = await fetch('/api/settings/drive', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: 'root', folder_name: t('myDrive') }),
      })
      setSaving(false)
      if (res.ok) { setShowPicker(false); onChanged() }
      else {
        const data = await res.json().catch(() => ({}))
        setFolderError(data.error || t('selectFailed'))
      }
    } else {
      await selectFolder({ id: current.id, name: current.name })
    }
  }

  if (!connected) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium">Google Drive</p>
        <p className="text-xs text-muted-foreground">
          {hasCredentials
            ? t('credentialsReady')
            : t('credentialsNeeded')}
        </p>
        {hasCredentials && (
          <Button size="sm" onClick={() => { window.location.href = '/api/auth/google' }}>
            {t('connect')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium">Google Drive</p>
      <p className="text-xs text-muted-foreground">
        {t('connected')}
      </p>

      {folderName ? (
        <div className="flex items-center gap-2 text-sm">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span>{t('savingTo')} <span className="font-medium">{folderName}</span></span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('noneSelected')}
        </p>
      )}

      {showPicker ? (
        <div className="border rounded-lg p-3 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t('pasteUrl')}</label>
            <div className="flex gap-2">
              <Input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); selectByUrl() } }}
                placeholder="https://drive.google.com/drive/folders/..."
                className="h-8 text-sm"
                disabled={saving}
              />
              <Button size="sm" onClick={selectByUrl} disabled={saving || !urlInput.trim()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('use')}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('orBrowse')}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={switchToMyDrive}
              className={`px-2 py-1 rounded ${browseMode === 'my' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t('myDrive')}
            </button>
            <button
              onClick={switchToShared}
              className={`px-2 py-1 rounded ${browseMode === 'shared' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t('shared')}
            </button>
          </div>

          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                <button
                  onClick={() => navigateToBreadcrumb(i)}
                  className={`hover:text-foreground ${i === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''}`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>

          <div className="border rounded max-h-48 overflow-y-auto">
            {loadingFolders ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : folders.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{t('noFolders')}</p>
            ) : (
              folders.map(f => (
                <div
                  key={f.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-muted/50 group"
                >
                  <button
                    className="flex items-center gap-2 text-sm flex-1 text-left hover:underline"
                    onClick={() => navigateInto(f)}
                  >
                    <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    {f.name}
                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-7 text-xs"
                    onClick={() => selectFolder(f)}
                    disabled={saving}
                  >
                    {t('select')}
                  </Button>
                </div>
              ))
            )}
          </div>

          {folderError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {folderError}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => { setShowPicker(false); setFolderError(null); setUrlInput('') }}>
              {t('cancel')}
            </Button>
            <Button size="sm" onClick={selectCurrentFolder} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {t('useThis')}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={openPicker}>
          {folderId ? t('changeFolder') : t('pickFolder')}
        </Button>
      )}

      {folderId && connected && (
        <GoogleDriveCompanyFolders />
      )}
    </div>
  )
}

function GoogleDriveCompanyFolders() {
  const t = useTranslations('Settings.page.drive')
  const [expanded, setExpanded] = useState(false)
  const [companies, setCompanies] = useState<{ id: string; name: string; google_drive_folder_id: string | null; google_drive_folder_name: string | null }[]>([])
  const [loading, setLoading] = useState(false)
  const [pickerCompanyId, setPickerCompanyId] = useState<string | null>(null)
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([])
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string; shared?: boolean }[]>([{ id: null, name: t('myDrive') }])
  const [browseMode, setBrowseMode] = useState<'my' | 'shared'>('my')
  const [saving, setSaving] = useState<string | null>(null)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')

  const loadCompanies = async () => {
    setLoading(true)
    const res = await fetch('/api/companies')
    if (res.ok) {
      const data = await res.json()
      // Fetch full details for each company to get folder overrides
      const detailed = await Promise.all(
        data.map(async (c: { id: string; name: string }) => {
          const r = await fetch(`/api/companies/${c.id}`)
          if (r.ok) {
            const d = await r.json()
            return { id: d.id, name: d.name, google_drive_folder_id: d.google_drive_folder_id ?? null, google_drive_folder_name: d.google_drive_folder_name ?? null }
          }
          return { id: c.id, name: c.name, google_drive_folder_id: null, google_drive_folder_name: null }
        })
      )
      setCompanies(detailed)
    }
    setLoading(false)
  }

  const handleExpand = () => {
    if (!expanded) loadCompanies()
    setExpanded(!expanded)
  }

  const loadFolders = async (parentId?: string, shared?: boolean) => {
    setLoadingFolders(true)
    setFolderError(null)
    try {
      let url = '/api/settings/drive/folders'
      if (shared) url += '?shared=true'
      else if (parentId) url += `?parent=${parentId}`
      const res = await fetch(url)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setFolderError(data.error || t('listFailed'))
        return
      }
      const data = await res.json()
      setFolders(data.folders ?? [])
    } catch {
      setFolderError(t('listFailed'))
    } finally {
      setLoadingFolders(false)
    }
  }

  const openPicker = (companyId: string) => {
    setPickerCompanyId(companyId)
    setBrowseMode('my')
    setUrlInput('')
    setBreadcrumbs([{ id: null, name: t('myDrive') }])
    setFolderError(null)
    loadFolders()
  }

  // Resolve a pasted Drive folder URL → folder, then save it for this company.
  // Mirrors the fund-level picker; the resolve endpoint reads the folder name,
  // the company PATCH (in selectFolder) persists it.
  const selectByUrl = async (companyId: string) => {
    if (!urlInput.trim()) return
    setSaving(companyId)
    setFolderError(null)
    const res = await fetch('/api/settings/drive/folders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlInput.trim() }),
    })
    if (!res.ok) {
      setSaving(null)
      const data = await res.json().catch(() => ({}))
      setFolderError(data.error || t('useFailed'))
      return
    }
    const { folderId, folderName } = await res.json()
    setUrlInput('')
    await selectFolder(companyId, { id: folderId, name: folderName })
  }

  const selectFolder = async (companyId: string, folder: { id: string; name: string }) => {
    setSaving(companyId)
    const res = await fetch(`/api/companies/${companyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ google_drive_folder_id: folder.id, google_drive_folder_name: folder.name }),
    })
    setSaving(null)
    if (res.ok) {
      setPickerCompanyId(null)
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, google_drive_folder_id: folder.id, google_drive_folder_name: folder.name } : c))
    }
  }

  const clearFolder = async (companyId: string) => {
    setSaving(companyId)
    const res = await fetch(`/api/companies/${companyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ google_drive_folder_id: null, google_drive_folder_name: null }),
    })
    setSaving(null)
    if (res.ok) {
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, google_drive_folder_id: null, google_drive_folder_name: null } : c))
    }
  }

  const navigateInto = (folder: { id: string; name: string }) => {
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }])
    loadFolders(folder.id)
  }

  const navigateToBreadcrumb = (index: number) => {
    const crumb = breadcrumbs[index]
    setBreadcrumbs(prev => prev.slice(0, index + 1))
    if (crumb.shared) loadFolders(undefined, true)
    else loadFolders(crumb.id ?? undefined)
  }

  return (
    <div className="border-t pt-3 mt-3">
      <button onClick={handleExpand} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {t('companyFolders')}
        <span className="font-normal">{t('optionalOverrides')}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : companies.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t('noCompanies')}</p>
          ) : (
            <div className="border rounded-lg divide-y">
              {companies.map(c => (
                <div key={c.id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{c.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.google_drive_folder_id ? (
                        <>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{c.google_drive_folder_name}</span>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openPicker(c.id)} disabled={saving === c.id}>
                            {t('changeFolder')}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => clearFolder(c.id)} disabled={saving === c.id}>
                            {saving === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-muted-foreground">{t('defaultFolder')}</span>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openPicker(c.id)}>
                            {t('setFolder')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {pickerCompanyId === c.id && (
                    <div className="border rounded-lg p-3 mt-2 space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">{t('pasteUrl')}</label>
                        <div className="flex gap-2">
                          <Input
                            value={urlInput}
                            onChange={e => setUrlInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); selectByUrl(c.id) } }}
                            placeholder="https://drive.google.com/drive/folders/..."
                            className="h-8 text-sm"
                            disabled={saving === c.id}
                          />
                          <Button size="sm" onClick={() => selectByUrl(c.id)} disabled={saving === c.id || !urlInput.trim()}>
                            {saving === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('use')}
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('orBrowse')}</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <button
                          onClick={() => { setBrowseMode('my'); setBreadcrumbs([{ id: null, name: t('myDrive') }]); loadFolders() }}
                          className={`px-2 py-1 rounded ${browseMode === 'my' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >{t('myDrive')}</button>
                        <button
                          onClick={() => { setBrowseMode('shared'); setBreadcrumbs([{ id: null, name: t('shared'), shared: true }]); loadFolders(undefined, true) }}
                          className={`px-2 py-1 rounded ${browseMode === 'shared' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >{t('shared')}</button>
                      </div>

                      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                        {breadcrumbs.map((crumb, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && <ChevronRight className="h-3 w-3" />}
                            <button onClick={() => navigateToBreadcrumb(i)} className={`hover:text-foreground ${i === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''}`}>
                              {crumb.name}
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="border rounded max-h-36 overflow-y-auto">
                        {loadingFolders ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : folders.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">{t('noFolders')}</p>
                        ) : (
                          folders.map(f => (
                            <div key={f.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/50 group">
                              <button className="flex items-center gap-2 text-sm flex-1 text-left hover:underline" onClick={() => navigateInto(f)}>
                                <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                                {f.name}
                                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              </button>
                              <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 h-7 text-xs" onClick={() => selectFolder(c.id, f)} disabled={saving === c.id}>
                                {t('select')}
                              </Button>
                            </div>
                          ))
                        )}
                      </div>

                      {folderError && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {folderError}
                        </p>
                      )}

                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => { setPickerCompanyId(null); setFolderError(null); setUrlInput('') }}>
                          {t('cancel')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────── Storage ────────────────────────────

function StorageSection({
  fileStorageProvider,
  googleDriveConnected,
  googleDriveFolderId,
  googleDriveFolderName,
  hasGoogleCredentials,
  dropboxConnected,
  hasDropboxCredentials,
  dropboxAppKey,
  dropboxFolderPath,
  onChanged,
}: {
  fileStorageProvider: string | null
  googleDriveConnected: boolean
  googleDriveFolderId: string | null
  googleDriveFolderName: string | null
  hasGoogleCredentials: boolean
  dropboxConnected: boolean
  hasDropboxCredentials: boolean
  dropboxAppKey: string
  dropboxFolderPath: string | null
  onChanged: () => void
}) {
  const t = useTranslations('Settings.page.storage')
  const [selectedProvider, setSelectedProvider] = useState(fileStorageProvider || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleProviderChange = async (value: string) => {
    setSelectedProvider(value)
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileStorageProvider: value || null }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onChanged()
    }
  }

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-4">
        {t('description')}
      </p>

      <div className="space-y-4">
        <div>
          <Label>{t('provider')}</Label>
          <div className="flex items-center gap-2">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedProvider}
              onChange={(e) => handleProviderChange(e.target.value)}
              disabled={saving}
            >
              <option value="">{t('databaseOnly')}</option>
              <option value="google_drive">Google Drive</option>
              <option value="dropbox">Dropbox</option>
            </select>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
            {saved && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
          </div>
        </div>

        {selectedProvider === 'google_drive' && (
          <div className="border-t pt-4">
            <GoogleDriveSection
              connected={googleDriveConnected}
              folderId={googleDriveFolderId}
              folderName={googleDriveFolderName}
              hasCredentials={hasGoogleCredentials}
              onChanged={onChanged}
            />
          </div>
        )}

        {selectedProvider === 'dropbox' && (
          <div className="border-t pt-4">
            <DropboxSection
              connected={dropboxConnected}
              hasCredentials={hasDropboxCredentials}
              appKey={dropboxAppKey}
              folderPath={dropboxFolderPath}
              onChanged={onChanged}
            />
          </div>
        )}
      </div>
    </Section>
  )
}

// ──────────────────────────── Dropbox ────────────────────────────

function DropboxSection({
  connected,
  hasCredentials,
  appKey: existingAppKey,
  folderPath,
  onChanged,
}: {
  connected: boolean
  hasCredentials: boolean
  appKey: string
  folderPath: string | null
  onChanged: () => void
}) {
  const t = useTranslations('Settings.page.dropbox')
  const [editingCreds, setEditingCreds] = useState(!hasCredentials)
  const [newAppKey, setNewAppKey] = useState(existingAppKey)
  const [newAppSecret, setNewAppSecret] = useState('')
  const [savingCreds, setSavingCreds] = useState(false)
  const [credsSaved, setCredsSaved] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [newFolderPath, setNewFolderPath] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [showFolderInput, setShowFolderInput] = useState(false)

  useEffect(() => { setNewAppKey(existingAppKey) }, [existingAppKey])
  useEffect(() => { if (hasCredentials && editingCreds && credsSaved) setEditingCreds(false) }, [hasCredentials, editingCreds, credsSaved])

  const saveCredentials = async () => {
    if (!newAppKey.trim() || !newAppSecret.trim()) return
    setSavingCreds(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dropboxAppKey: newAppKey.trim(),
        dropboxAppSecret: newAppSecret.trim(),
      }),
    })
    setSavingCreds(false)
    if (res.ok) {
      setNewAppSecret('')
      setEditingCreds(false)
      setCredsSaved(true)
      setTimeout(() => setCredsSaved(false), 2000)
      onChanged()
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    const res = await fetch('/api/settings/dropbox', { method: 'DELETE' })
    setDisconnecting(false)
    if (res.ok) onChanged()
  }

  const createFolder = async () => {
    if (!newFolderPath.trim()) return
    setCreatingFolder(true)
    setFolderError(null)
    const res = await fetch('/api/settings/dropbox/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: newFolderPath.trim() }),
    })
    setCreatingFolder(false)
    if (res.ok) {
      setNewFolderPath('')
      setShowFolderInput(false)
      onChanged()
    } else {
      const data = await res.json().catch(() => ({}))
      setFolderError(data.error || t('createFailed'))
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium">Dropbox</p>

      {/* Credentials section */}
      {(editingCreds || !hasCredentials) ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t('createApp')}{' '}
            <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noopener noreferrer" className="underline">
              Dropbox App Console
            </a>
            . {t('addRedirect')} <code className="text-[11px] bg-muted px-1 rounded">{typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/dropbox/callback</code>
          </p>
          <div>
            <Label>{t('appKey')}</Label>
            <Input
              value={newAppKey}
              onChange={(e) => setNewAppKey(e.target.value)}
              placeholder={t('appKey')}
            />
          </div>
          <div>
            <Label>{t('appSecret')}</Label>
            <Input
              type="password"
              value={newAppSecret}
              onChange={(e) => setNewAppSecret(e.target.value)}
              placeholder={t('appSecret')}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveCredentials} disabled={savingCreds || !newAppKey.trim() || !newAppSecret.trim()}>
              {savingCreds ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('saveCredentials')}
            </Button>
            {hasCredentials && (
              <Button size="sm" variant="outline" onClick={() => setEditingCreds(false)}>
                {t('cancel')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground flex-1">
            {t('configured')}
            {credsSaved && <span className="text-emerald-600 ml-1">{t('saved')}</span>}
          </p>
          <Button size="sm" variant="outline" onClick={() => setEditingCreds(true)} className="text-xs h-7">
            {t('updateCredentials')}
          </Button>
        </div>
      )}

      {/* Connection section */}
      {hasCredentials && !connected && (
        <Button size="sm" onClick={() => { window.location.href = '/api/auth/dropbox' }}>
          {t('connect')}
        </Button>
      )}

      {connected && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-green-600 shrink-0" />
            <span>{t('connected')}</span>
          </div>

          {/* Folder management */}
          {folderPath ? (
            <div className="flex items-center gap-2 text-sm">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span>{t('savingTo')} <span className="font-medium">{folderPath}</span></span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('noneSelected')}
            </p>
          )}

          {showFolderInput ? (
            <div className="border rounded-lg p-3 space-y-3">
              <div>
                <Label>{t('folderPath')}</Label>
                <Input
                  value={newFolderPath}
                  onChange={(e) => { setNewFolderPath(e.target.value); setFolderError(null) }}
                  placeholder="/Portfolio Reports"
                  onKeyDown={(e) => { if (e.key === 'Enter') createFolder() }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('folderHelp')}
                </p>
              </div>
              {folderError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {folderError}
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => { setShowFolderInput(false); setFolderError(null) }}>
                  {t('cancel')}
                </Button>
                <Button size="sm" onClick={createFolder} disabled={creatingFolder || !newFolderPath.trim()}>
                  {creatingFolder ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  {folderPath ? t('updateFolder') : t('setFolder')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowFolderInput(true)}>
                {folderPath ? t('changeFolder') : t('setFolder')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-destructive hover:text-destructive"
              >
                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5 mr-1" />}
                {t('disconnect')}
              </Button>
            </div>
          )}

          {folderPath && (
            <DropboxCompanyFolders />
          )}
        </div>
      )}
    </div>
  )
}

function DropboxCompanyFolders() {
  const t = useTranslations('Settings.page.dropbox')
  const [expanded, setExpanded] = useState(false)
  const [companies, setCompanies] = useState<{ id: string; name: string; dropbox_folder_path: string | null }[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPath, setEditPath] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  const loadCompanies = async () => {
    setLoading(true)
    const res = await fetch('/api/companies')
    if (res.ok) {
      const data = await res.json()
      const detailed = await Promise.all(
        data.map(async (c: { id: string; name: string }) => {
          const r = await fetch(`/api/companies/${c.id}`)
          if (r.ok) {
            const d = await r.json()
            return { id: d.id, name: d.name, dropbox_folder_path: d.dropbox_folder_path ?? null }
          }
          return { id: c.id, name: c.name, dropbox_folder_path: null }
        })
      )
      setCompanies(detailed)
    }
    setLoading(false)
  }

  const handleExpand = () => {
    if (!expanded) loadCompanies()
    setExpanded(!expanded)
  }

  const startEdit = (companyId: string, currentPath: string | null) => {
    setEditingId(companyId)
    setEditPath(currentPath || '')
  }

  const savePath = async (companyId: string) => {
    setSaving(companyId)
    const res = await fetch(`/api/companies/${companyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dropbox_folder_path: editPath.trim() || null }),
    })
    setSaving(null)
    if (res.ok) {
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, dropbox_folder_path: editPath.trim() || null } : c))
      setEditingId(null)
    }
  }

  const clearPath = async (companyId: string) => {
    setSaving(companyId)
    const res = await fetch(`/api/companies/${companyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dropbox_folder_path: null }),
    })
    setSaving(null)
    if (res.ok) {
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, dropbox_folder_path: null } : c))
    }
  }

  return (
    <div className="border-t pt-3 mt-3">
      <button onClick={handleExpand} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {t('companyFolders')}
        <span className="font-normal">{t('optionalOverrides')}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : companies.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t('noCompanies')}</p>
          ) : (
            <div className="border rounded-lg divide-y">
              {companies.map(c => (
                <div key={c.id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{c.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {editingId === c.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editPath}
                            onChange={(e) => setEditPath(e.target.value)}
                            placeholder="/Custom/Path"
                            className="h-7 text-xs w-48"
                            onKeyDown={(e) => { if (e.key === 'Enter') savePath(c.id) }}
                          />
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => savePath(c.id)} disabled={saving === c.id}>
                            {saving === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t('save')}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                            {t('cancel')}
                          </Button>
                        </div>
                      ) : c.dropbox_folder_path ? (
                        <>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{c.dropbox_folder_path}</span>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => startEdit(c.id, c.dropbox_folder_path)}>
                            {t('changeFolder')}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => clearPath(c.id)} disabled={saving === c.id}>
                            {saving === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-muted-foreground">{t('defaultFolder')}</span>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => startEdit(c.id, null)}>
                            {t('setPath')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────── Outbound Email ────────────────────────────

function OutboundEmailSection({
  provider,
  asksProvider,
  approvalEmailSubject: savedApprovalSubject,
  approvalEmailBody: savedApprovalBody,
  systemEmailFromName: savedFromName,
  systemEmailFromAddress: savedFromAddress,
  hasResendKey,
  hasPostmarkServerToken,
  hasMailgunApiKey,
  mailgunSendingDomain: existingMailgunDomain,
  googleConnected,
  hasGoogleCredentials,
  googleClientId,
  onSaved,
}: {
  provider: string | null
  asksProvider: string | null
  approvalEmailSubject: string | null
  approvalEmailBody: string | null
  systemEmailFromName: string | null
  systemEmailFromAddress: string | null
  hasResendKey: boolean
  hasPostmarkServerToken: boolean
  hasMailgunApiKey: boolean
  mailgunSendingDomain: string
  googleConnected: boolean
  hasGoogleCredentials: boolean
  googleClientId: string
  onSaved: () => void
}) {
  const t = useTranslations('Settings.page.outbound')
  const defaultSubject = t('defaultSubject', { fundName: '{{fundName}}' })
  const defaultBody = `<h2>${t('congratulations')}</h2>\n<p>${t('approvalBody', { fundName: '<strong>{{fundName}}</strong>' })}</p>\n<p><a href="{{siteUrl}}/auth">${t('signIn')}</a></p>`

  const [systemProvider, setSystemProvider] = useState(provider || '')
  const [selectedAsksProvider, setSelectedAsksProvider] = useState(asksProvider || '')
  const [approvalSubject, setApprovalSubject] = useState(savedApprovalSubject || '')
  const [approvalBody, setApprovalBody] = useState(savedApprovalBody || '')
  const [fromName, setFromName] = useState(savedFromName || '')
  const [fromAddress, setFromAddress] = useState(savedFromAddress || '')
  const [resendKey, setResendKey] = useState('')
  const [postmarkToken, setPostmarkToken] = useState('')
  const [mgApiKey, setMgApiKey] = useState('')
  const [mgDomain, setMgDomain] = useState(existingMailgunDomain)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showApprovalEmail, setShowApprovalEmail] = useState(false)

  // Determine which providers are actively selected (deduplicated)
  const activeProviders = new Set<string>()
  if (systemProvider) activeProviders.add(systemProvider)
  if (selectedAsksProvider) activeProviders.add(selectedAsksProvider)

  const handleSave = async () => {
    setSaving(true)
    const payload: Record<string, unknown> = {
      outboundEmailProvider: systemProvider || null,
      asksEmailProvider: selectedAsksProvider || null,
      approvalEmailSubject: approvalSubject.trim() || null,
      approvalEmailBody: approvalBody.trim() || null,
      systemEmailFromName: fromName.trim() || null,
      systemEmailFromAddress: fromAddress.trim() || null,
    }
    if (activeProviders.has('resend') && resendKey.trim()) {
      payload.resendApiKey = resendKey.trim()
    }
    if (activeProviders.has('postmark') && postmarkToken.trim()) {
      payload.postmarkServerToken = postmarkToken.trim()
    }
    if (activeProviders.has('mailgun')) {
      if (mgApiKey.trim()) payload.mailgunApiKey = mgApiKey.trim()
      if (mgDomain.trim()) payload.mailgunSendingDomain = mgDomain.trim()
    }
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setResendKey('')
      setPostmarkToken('')
      setMgApiKey('')
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    }
  }

  const systemProviderChanged = systemProvider !== (provider || '')
  const asksProviderChanged = selectedAsksProvider !== (asksProvider || '')
  const approvalSubjectChanged = (approvalSubject.trim() || null) !== (savedApprovalSubject || null)
  const approvalBodyChanged = (approvalBody.trim() || null) !== (savedApprovalBody || null)
  const fromNameChanged = (fromName.trim() || null) !== (savedFromName || null)
  const fromAddressChanged = (fromAddress.trim() || null) !== (savedFromAddress || null)
  const hasNewSecret = resendKey.trim() || postmarkToken.trim() || mgApiKey.trim() || mgDomain !== existingMailgunDomain
  const canSave = systemProviderChanged || asksProviderChanged || approvalSubjectChanged || approvalBodyChanged || fromNameChanged || fromAddressChanged || hasNewSecret

  const selectClass = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-3">
        {t('description')}
      </p>
      <div className="space-y-3">
        <div>
          <Label>{t('systemEmails')}</Label>
          <p className="text-xs text-muted-foreground mb-1.5">
            {t('systemHelp')}
          </p>
          <select
            className={selectClass}
            value={systemProvider}
            onChange={(e) => setSystemProvider(e.target.value)}
          >
            <option value="">{t('none')}</option>
            <option value="resend">Resend</option>
            <option value="postmark">Postmark</option>
            <option value="mailgun">Mailgun</option>
            <option value="gmail">Gmail</option>
          </select>
        </div>

        {systemProvider && (
          <div className="border rounded-lg p-3 space-y-3">
            <div>
              <button
                type="button"
                onClick={() => setShowApprovalEmail(!showApprovalEmail)}
                className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground transition-colors"
              >
                {showApprovalEmail ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {t('acceptedEmail')}
              </button>
              <p className="text-xs text-muted-foreground mt-0.5 ml-5">
                {t('acceptedHelp')}
              </p>
            </div>
            {showApprovalEmail && (
              <>
                <div>
                  <Label>{t('fromName')}</Label>
                  <Input
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder={t('fromNamePlaceholder')}
                  />
                </div>
                <div>
                  <Label>{t('fromAddress')}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
                    {t('fromAddressHelp')}{systemProvider === 'gmail' ? t('gmailFromHelp') : ''}
                  </p>
                  <Input
                    type="email"
                    value={fromAddress}
                    onChange={(e) => setFromAddress(e.target.value)}
                    placeholder="notifications@yourdomain.com"
                    disabled={systemProvider === 'gmail'}
                  />
                </div>
                <div>
                  <Label>{t('subject')}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
                    {t('subjectHelp', { fundName: '{{fundName}}' })}
                  </p>
                  <Input
                    value={approvalSubject}
                    onChange={(e) => setApprovalSubject(e.target.value)}
                    placeholder={defaultSubject}
                  />
                </div>
                <div>
                  <Label>{t('body')}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
                    {t('bodyHelp', { fundName: '{{fundName}}', siteUrl: '{{siteUrl}}' })}
                  </p>
                  <Textarea
                    value={approvalBody}
                    onChange={(e) => setApprovalBody(e.target.value)}
                    placeholder={defaultBody}
                    rows={5}
                    className="font-mono text-xs"
                  />
                </div>
              </>
            )}
          </div>
        )}

        <div>
          <Label>{t('asksEmails')}</Label>
          <p className="text-xs text-muted-foreground mb-1.5">
            {t('asksHelp')}
          </p>
          <select
            className={selectClass}
            value={selectedAsksProvider}
            onChange={(e) => setSelectedAsksProvider(e.target.value)}
          >
            <option value="">{t('none')}</option>
            <option value="resend">Resend</option>
            <option value="postmark">Postmark</option>
            <option value="mailgun">Mailgun</option>
            <option value="gmail">Gmail</option>
          </select>
        </div>

        {activeProviders.size > 0 && (
          <>
            <div className="border-t pt-3">
              <p className="text-sm font-medium">{t('providerSettings')}</p>
            </div>
          </>
        )}

        {activeProviders.has('resend') && (
          <>
            <div>
              <Label>{t('resendKey')}</Label>
              {hasResendKey && (
                <p className="text-xs text-muted-foreground mt-1 mb-1.5">
                  {t('keySaved')}
                </p>
              )}
              <Input
                type="password"
                value={resendKey}
                onChange={(e) => setResendKey(e.target.value)}
                placeholder={hasResendKey ? '••••••••' : 're_...'}
              />
            </div>
            <FundResendOutboundProviderFields onChanged={onSaved} />
          </>
        )}

        {activeProviders.has('postmark') && (
          <div>
            <Label>{t('postmarkToken')}</Label>
            {hasPostmarkServerToken && (
              <p className="text-xs text-muted-foreground mt-1 mb-1.5">
                {t('tokenSaved')}
              </p>
            )}
            <Input
              type="password"
              value={postmarkToken}
              onChange={(e) => setPostmarkToken(e.target.value)}
              placeholder={hasPostmarkServerToken ? '••••••••' : t('serverTokenPlaceholder')}
            />
          </div>
        )}

        {activeProviders.has('mailgun') && (
          <>
            <div>
              <Label>{t('mailgunKey')}</Label>
              {hasMailgunApiKey && (
                <p className="text-xs text-muted-foreground mt-1 mb-1.5">
                  {t('keySaved')}
                </p>
              )}
              <Input
                type="password"
                value={mgApiKey}
                onChange={(e) => setMgApiKey(e.target.value)}
                placeholder={hasMailgunApiKey ? '••••••••' : 'key-...'}
              />
            </div>
            <div>
              <Label>{t('sendingDomain')}</Label>
              <Input
                value={mgDomain}
                onChange={(e) => setMgDomain(e.target.value)}
                placeholder="mg.yourdomain.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('sendingDomainHelp')}
              </p>
            </div>
          </>
        )}

        {activeProviders.has('gmail') && (
          <div className="space-y-2">
            <Label>{t('gmailConnection')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('gmailHelp')}
            </p>
            <GoogleConnectionUI
              connected={googleConnected}
              hasCredentials={hasGoogleCredentials}
              clientId={googleClientId}
              onChanged={onSaved}
            />
          </div>
        )}

        <Button onClick={handleSave} disabled={saving || !canSave} size="sm">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : t('save')}
        </Button>
      </div>
    </Section>
  )
}

// ──────────────────────────── Senders ────────────────────────────

function SendersSection({
  senders,
  onChanged,
}: {
  senders: Sender[]
  onChanged: () => void
}) {
  const t = useTranslations('Settings.page.senders')
  const [email, setEmail] = useState('')
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const handleAdd = async () => {
    if (!email.trim()) return
    setAdding(true)
    const res = await fetch('/api/settings/senders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, label }),
    })
    setAdding(false)
    if (res.ok) {
      setEmail('')
      setLabel('')
      onChanged()
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const res = await fetch(`/api/settings/senders/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    if (res.ok) onChanged()
  }

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-3">
        {t('description')}
      </p>

      {senders.length > 0 && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
            {t('count', { count: senders.length })}
          </button>
          {expanded && (
            <div className="border rounded-lg divide-y">
              {senders.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <span className="text-sm">{s.email}</span>
                    {s.label && (
                      <span className="text-xs text-muted-foreground ml-2">({s.label})</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={deletingId === s.id}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
        <div className="flex-1">
          <Label>{t('email')}</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="founder@company.com"
          />
        </div>
        <div className="sm:w-32">
          <Label>{t('label')}</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('optional')}
          />
        </div>
        <Button onClick={handleAdd} disabled={adding || !email.trim()} size="sm">
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </Section>
  )
}

// ──────────────────────────── Signup Whitelist ────────────────────────────

interface WhitelistEntry {
  id: string
  email_pattern: string
  created_at: string
}

const AUTH_EMAIL_TEMPLATES = ['confirmation', 'invite', 'magic_link', 'recovery', 'email_change', 'reauthentication', 'password_changed', 'email_changed', 'mfa_factor_enrolled', 'mfa_factor_unenrolled'] as const

function AuthEmailTemplatesSection() {
  const t = useTranslations('Settings.page.authentication')
  const [showGuide, setShowGuide] = useState(false)

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-3">
        {t('description')}
      </p>

      {showGuide ? (
        <div className="space-y-3">
          <button onClick={() => setShowGuide(false)} className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ChevronDown className="h-3 w-3" /> {t('setup')}
          </button>

          <div className="text-xs text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">{t('selfHosted')}</p>
            <p>{t.rich('selfHostedHelp', { code: chunks => <code className="text-[11px] bg-muted px-1 rounded font-mono">{chunks}</code> })}</p>

            <p className="font-medium text-foreground pt-2">{t('hosted')}</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>{t('hostedStep1')}</li>
              <li>{t.rich('hostedStep2', { code: chunks => <code className="text-[11px] bg-muted px-1 rounded font-mono">{chunks}</code> })}</li>
              <li>{t('hostedStep3')}</li>
            </ol>

            <p className="font-medium text-foreground pt-2">{t('smtp')}</p>
            <p>
              {t.rich('smtpHelp', { strong: chunks => <strong>{chunks}</strong>, code: chunks => <code className="text-[11px] bg-muted px-1 rounded font-mono">{chunks}</code> })}
            </p>

            <p className="font-medium text-foreground pt-2">{t('hook')}</p>
            <p>
              {t.rich('hookHelp', { code: chunks => <code className="text-[11px] bg-muted px-1 rounded font-mono">{chunks}</code> })}
            </p>
            <ol className="list-decimal list-inside space-y-1">
              <li>{t.rich('hookStep1', { code: chunks => <code className="text-[11px] bg-muted px-1 rounded font-mono">{chunks}</code> })}</li>
              <li>{t('hookStep2')}</li>
              <li>{t.rich('hookStep3', { code: chunks => <code className="text-[11px] bg-muted px-1 rounded font-mono">{chunks}</code> })}</li>
            </ol>
          </div>

          <div className="border rounded-md overflow-hidden mt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-1.5 font-medium">{t('template')}</th>
                  <th className="text-left px-3 py-1.5 font-medium">{t('file')}</th>
                  <th className="text-left px-3 py-1.5 font-medium hidden sm:table-cell">{t('tableDescription')}</th>
                </tr>
              </thead>
              <tbody>
                {AUTH_EMAIL_TEMPLATES.map((template) => (
                  <tr key={template} className="border-b last:border-0">
                    <td className="px-3 py-1.5">{t(`templates.${template}.name`)}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{template}.html</td>
                    <td className="px-3 py-1.5 text-muted-foreground hidden sm:table-cell">{t(`templates.${template}.description`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            <a
              href="https://supabase.com/docs/guides/local-development/customizing-email-templates"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              {t('docs')}
            </a>
          </p>
        </div>
      ) : (
        <button onClick={() => setShowGuide(true)} className="text-xs text-muted-foreground hover:text-foreground underline">
          {t('setup')}
        </button>
      )}
    </Section>
  )
}

function WhitelistSection() {
  const t = useTranslations('Settings.page.whitelist')
  const [entries, setEntries] = useState<WhitelistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [pattern, setPattern] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/settings/whitelist')
    if (res.ok) {
      const data = await res.json()
      setEntries(data.entries)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!pattern.trim()) return
    setAdding(true)
    setError(null)
    const res = await fetch('/api/settings/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailPattern: pattern }),
    })
    setAdding(false)
    if (res.ok) {
      setPattern('')
      load()
    } else {
      const data = await res.json()
      setError(data.error)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const res = await fetch(`/api/settings/whitelist/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    if (res.ok) load()
  }

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-3">
        {t.rich('description', { code: chunks => <code className="text-[11px] bg-muted px-1 rounded">{chunks}</code> })}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('loading')}
        </div>
      ) : (
        <>
          {entries.length > 0 && (
            <div className="border rounded-lg divide-y mb-3">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-mono">{e.email_pattern}</span>
                  <button
                    onClick={() => handleDelete(e.id)}
                    disabled={deletingId === e.id}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
            <div className="flex-1">
              <Label>{t('pattern')}</Label>
              <Input
                value={pattern}
                onChange={(e) => { setPattern(e.target.value); setError(null) }}
                placeholder={t('placeholder')}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              />
            </div>
            <Button onClick={handleAdd} disabled={adding || !pattern.trim()} size="sm">
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {error && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {error}
            </p>
          )}
        </>
      )}
    </Section>
  )
}

// ──────────────────────────── Team ────────────────────────────

interface Member {
  id: string
  userId: string
  email: string
  role: string
  createdAt: string
}

interface JoinRequest {
  id: string
  email: string
  createdAt: string
  status: string
  claimedAt: string | null
}

// `featureVisibility` is threaded through to the access grid so it re-derives what's grantable the
// moment a switch above changes — see AccessGrid's note.
function TeamSection({ isAdmin, featureVisibility }: { isAdmin: boolean; featureVisibility: Record<string, string> }) {
  const locale = useLocale()
  const t = useTranslations('Settings.page.team')
  const [members, setMembers] = useState<Member[]>([])
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [memberActionError, setMemberActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/settings/members')
    if (res.ok) {
      const data = await res.json()
      setMembers(data.members)
      setPendingRequests(data.pendingRequests)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleRequest = async (requestId: string, action: 'approve' | 'reject') => {
    setProcessingId(requestId)
    setMemberActionError(null)
    try {
      const res = await fetch(`/api/settings/members/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        await load()
        return
      }
      const body = await res.json().catch(() => null) as { error?: string } | null
      setMemberActionError(body?.error ?? t('updateError'))
    } catch {
      setMemberActionError(t('updateError'))
    } finally {
      setProcessingId(null)
    }
  }

  const handleRemove = async (memberId: string) => {
    setProcessingId(memberId)
    const res = await fetch(`/api/settings/members/${memberId}`, { method: 'DELETE' })
    setProcessingId(null)
    setConfirmRemoveId(null)
    if (res.ok) load()
  }

  return (
    <Section title={t('title')}>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('loading')}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Members list */}
          <div className="border rounded-lg divide-y">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm">{m.email}</span>
                <div className="flex items-center gap-2">
                  {m.role === 'admin' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-primary/10 text-primary rounded-full px-2 py-0.5">
                      <Shield className="h-2.5 w-2.5" />
                      {t('admin')}
                    </span>
                  ) : (
                    <>
                      <span className="text-xs text-muted-foreground">{t('member')}</span>
                      {isAdmin && confirmRemoveId === m.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRemove(m.id)}
                            disabled={processingId === m.id}
                            className="h-6 text-[11px] px-2"
                          >
                            {processingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t('confirm')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmRemoveId(null)}
                            className="h-6 text-[11px] px-2"
                          >
                            {t('cancel')}
                          </Button>
                        </div>
                      ) : isAdmin ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmRemoveId(m.id)}
                          className="h-6 text-[11px] px-2 text-muted-foreground hover:text-destructive"
                        >
                          {t('remove')}
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pending requests (admin only) */}
          {isAdmin && pendingRequests.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2">{t('pending')}</p>
              {memberActionError && (
                <p className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
                  {memberActionError}
                </p>
              )}
              <div className="border rounded-lg divide-y">
                {pendingRequests.map(r => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <span className="text-sm">{r.email}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(r.createdAt))}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRequest(r.id, 'reject')}
                        disabled={processingId === r.id || r.status === 'provisioning'}
                        className="h-7 text-xs"
                      >
                        {t('reject')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleRequest(r.id, 'approve')}
                        disabled={processingId === r.id}
                        className="h-7 text-xs"
                      >
                        {processingId === r.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : r.status === 'provisioning' ? t('retryApproval') : t('approve')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Who can reach what. Sits with the roster deliberately: "who is on the team" and
              "what they can see" are one decision, and splitting them across two screens is how
              you end up with a member nobody remembered to scope. */}
          {isAdmin && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium mb-2 mt-3">{t('access')}</p>
              <AccessGrid featureVisibility={featureVisibility as FeatureVisibilityMap} />
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

// ──────────────────────────── Danger Zone ────────────────────────────

function DangerZone({ onDeleted }: { onDeleted: () => void }) {
  const t = useTranslations('Settings.page.danger')
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    const res = await fetch('/api/settings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm }),
    })
    setDeleting(false)
    if (res.ok) {
      setOpen(false)
      onDeleted()
    }
  }

  return (
    <div className="rounded-lg border border-destructive/30 p-5">
      <h2 className="text-sm font-medium text-destructive mb-1 flex items-center gap-1.5"><Lock className="h-3 w-3 text-destructive" />{t('title')}</h2>
      <p className="text-xs text-muted-foreground mb-3">
        {t('description')}
      </p>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        {t('deleteAll')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteAll')}</DialogTitle>
            <DialogDescription>
              {t('dialogDescription')}
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label>
              {t.rich('confirmHelp', { code: chunks => <code className="text-xs bg-muted px-1 rounded">{chunks}</code> })}
            </Label>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE ALL DATA"
              className="mt-1"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('cancel')}</Button>
            <Button
              variant="destructive"
              disabled={confirm !== 'DELETE ALL DATA' || deleting}
              onClick={handleDelete}
            >
              {deleting ? t('deleting') : t('deleteEverything')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ──────────────────────────── Analytics ────────────────────────────

function AnalyticsSection({
  fathomSiteId,
  gaMeasurementId,
  onSaved,
}: {
  fathomSiteId: string | null
  gaMeasurementId: string | null
  onSaved: () => void
}) {
  const t = useTranslations('Settings.page.analytics')
  const [fathom, setFathom] = useState(fathomSiteId ?? '')
  const [ga, setGa] = useState(gaMeasurementId ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const hasChanges =
    fathom !== (fathomSiteId ?? '') ||
    ga !== (gaMeasurementId ?? '')

  const handleSave = async () => {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        analyticsFathomSiteId: fathom,
        analyticsGaMeasurementId: ga,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    }
  }

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-4">
        {t('description')}
      </p>
      <div className="space-y-4">
        <div>
          <Label>{t('fathom')}</Label>
          <Input
            value={fathom}
            onChange={(e) => setFathom(e.target.value)}
            placeholder="ABCDEFGH"
            className="max-w-xs font-mono mt-1"
          />
        </div>
        <div>
          <Label>{t('google')}</Label>
          <Input
            value={ga}
            onChange={(e) => setGa(e.target.value)}
            placeholder="G-XXXXXXXXXX"
            className="max-w-xs font-mono mt-1"
          />
        </div>
        <Button onClick={handleSave} disabled={saving || !hasChanges} size="sm">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : t('save')}
        </Button>
      </div>
    </Section>
  )
}

// ──────────────────────────── Usage Tracking ────────────────────────────

function UsageTrackingSection({
  disableUserTracking,
  onSaved,
}: {
  disableUserTracking: boolean
  onSaved: () => void
}) {
  const t = useTranslations('Settings.page.usageTracking')
  const [disabled, setDisabled] = useState(disableUserTracking)
  const [saving, setSaving] = useState(false)

  const handleToggle = async (checked: boolean) => {
    setDisabled(checked)
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disableUserTracking: checked }),
    })
    setSaving(false)
    if (res.ok) onSaved()
  }

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-4">
        {t('description')}
      </p>
      <div className="flex items-center gap-3">
        <Switch
          checked={disabled}
          onCheckedChange={handleToggle}
          disabled={saving}
        />
        <Label className="text-sm font-normal">
          {t('disable')}
        </Label>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </div>
    </Section>
  )
}

// ──────────────────────────── LP Portal ────────────────────────────

/**
 * The LP portal's master switch, shown at the top of Feature visibility.
 *
 * It is NOT a visibility level, and deliberately doesn't look like one: everything else in that
 * section decides what your TEAM sees, while this decides whether your INVESTORS have a portal at
 * all. It used to sit in a section of its own much further down the page, which made it easy to
 * configure "LP documents & sharing" for the team and wonder why nothing reached anyone.
 *
 * When off, the layout forces the LP cards to hidden and their pages redirect — so those cards
 * mean nothing until this is on.
 */
function LpPortalCard({ enabled, onSaved }: { enabled: boolean; onSaved: () => void }) {
  const t = useTranslations('Settings.page.lpPortal')
  const [on, setOn] = useState(enabled)
  const [saving, setSaving] = useState(false)

  const handleToggle = async (checked: boolean) => {
    setOn(checked)
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lpPortalEnabled: checked }),
    })
    setSaving(false)
    if (res.ok) onSaved()
  }

  return (
    <SettingsCard
      title={t('title')}
      subtitle={t('description')}
      aside={saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined}
    >
      <div className="flex items-center gap-3">
        <Switch checked={on} onCheckedChange={handleToggle} disabled={saving} />
        <Label className="text-sm font-normal">{on ? t('on') : t('off')}</Label>
      </div>
    </SettingsCard>
  )
}

// ──────────────────────────── Deals ────────────────────────────

function DealScreeningSection({ thesis, prompt, intakeEnabled, submissionToken, onSaved }: {
  thesis: string | null
  prompt: string | null
  intakeEnabled: boolean
  submissionToken: string | null
  onSaved: () => void
}) {
  const t = useTranslations('Settings.page.dealScreening')
  const defaultPrompt = t('defaultPrompt')
  const [thesisVal, setThesisVal] = useState(thesis ?? '')
  const [promptVal, setPromptVal] = useState(prompt ?? defaultPrompt)
  const [intake, setIntake] = useState(intakeEnabled)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewResult, setPreviewResult] = useState<string | null>(null)
  const [tokenBusy, setTokenBusy] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)

  useEffect(() => {
    if (prompt === null) setPromptVal(defaultPrompt)
  }, [prompt, defaultPrompt])

  const isCustomized = prompt !== null
  const submissionUrl = submissionToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/submit/${submissionToken}` : null

  async function generateToken() {
    setTokenBusy(true)
    const res = await fetch('/api/settings/deal-submission-token', { method: 'POST' })
    setTokenBusy(false)
    if (res.ok) onSaved()
  }

  async function clearToken() {
    if (!confirm(t('disableConfirm'))) return
    setTokenBusy(true)
    const res = await fetch('/api/settings/deal-submission-token', { method: 'DELETE' })
    setTokenBusy(false)
    if (res.ok) onSaved()
  }

  function copyUrl() {
    if (!submissionUrl) return
    navigator.clipboard.writeText(submissionUrl)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 2000)
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dealThesis: thesisVal,
        dealScreeningPrompt: promptVal,
        dealIntakeEnabled: intake,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    }
  }

  async function handleResetPrompt() {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealScreeningPrompt: null }),
    })
    setSaving(false)
    if (res.ok) {
      setPromptVal(defaultPrompt)
      onSaved()
    }
  }

  async function handlePreview() {
    setPreviewing(true)
    setPreviewResult(null)
    const res = await fetch('/api/deals/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thesis: thesisVal, screeningPrompt: promptVal }),
    })
    setPreviewing(false)
    if (res.ok) {
      const body = await res.json()
      setPreviewResult(JSON.stringify(body.analysis ?? body, null, 2))
    } else {
      const err = await res.text()
      setPreviewResult(t('previewError', { error: err }))
    }
  }

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-3">
        {t('description')}
      </p>

      <label className="block text-xs font-medium text-muted-foreground mb-1">{t('thesis')}</label>
      <textarea
        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm font-mono leading-relaxed mb-4"
        rows={6}
        value={thesisVal}
        onChange={e => setThesisVal(e.target.value)}
        placeholder={t('thesisPlaceholder')}
      />

      <label className="block text-xs font-medium text-muted-foreground mb-1">{t('instructions')}</label>
      <textarea
        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm font-mono leading-relaxed"
        rows={10}
        value={promptVal}
        onChange={e => setPromptVal(e.target.value)}
      />

      <label className="flex items-center gap-2 mt-4 text-sm cursor-pointer">
        <input type="checkbox" checked={intake} onChange={e => setIntake(e.target.checked)} className="h-4 w-4" />
        <span>{t('enableIntake')}</span>
      </label>
      <p className="text-xs text-muted-foreground ml-6 mt-1">
        {t('intakeHelp')}
      </p>

      <div className="flex items-center gap-2 mt-4">
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : t('save')}
        </Button>
        {isCustomized && (
          <Button onClick={handleResetPrompt} disabled={saving} variant="outline" size="sm">
            {t('resetPrompt')}
          </Button>
        )}
        <Button onClick={handlePreview} disabled={previewing || saving} variant="outline" size="sm">
          {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
          {t('preview')}
        </Button>
      </div>

      {previewResult && (
        <pre className="mt-3 whitespace-pre-wrap text-xs bg-muted rounded-md px-3 py-2 font-mono leading-relaxed max-h-80 overflow-y-auto">
          {previewResult}
        </pre>
      )}

      <div className="border-t mt-6 pt-4">
        <h3 className="text-sm font-medium mb-1">{t('publicForm')}</h3>
        <p className="text-xs text-muted-foreground mb-3">
          {t('publicFormHelp')}
        </p>
        {submissionUrl ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input readOnly value={submissionUrl} className="font-mono text-xs" />
              <Button onClick={copyUrl} variant="outline" size="sm">
                {tokenCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button onClick={generateToken} disabled={tokenBusy} variant="outline" size="sm">
                {t('regenerateUrl')}
              </Button>
              <Button onClick={clearToken} disabled={tokenBusy} variant="outline" size="sm">
                {t('disableForm')}
              </Button>
            </div>
            {!intake && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t('inactiveNote')}
              </p>
            )}
          </div>
        ) : (
          <Button onClick={generateToken} disabled={tokenBusy} variant="outline" size="sm">
            {t('generateUrl')}
          </Button>
        )}
      </div>
    </Section>
  )
}

interface KnownReferrer {
  id: string
  email: string
  name: string | null
  notes: string | null
  created_at: string | null
}

function KnownReferrersSection() {
  const t = useTranslations('Settings.page.referrers')
  const [items, setItems] = useState<KnownReferrer[]>([])
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [adding, setAdding] = useState(false)

  async function load() {
    const res = await fetch('/api/known-referrers')
    if (res.ok) setItems(await res.json())
  }

  useEffect(() => { load() }, [])

  async function add() {
    if (!email.trim()) return
    setAdding(true)
    const res = await fetch('/api/known-referrers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, notes }),
    })
    setAdding(false)
    if (res.ok) {
      setEmail(''); setName(''); setNotes('')
      load()
    }
  }

  async function remove(id: string) {
    if (!confirm(t('removeConfirm'))) return
    const res = await fetch(`/api/known-referrers/${id}`, { method: 'DELETE' })
    if (res.ok) setItems(items.filter(x => x.id !== id))
  }

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-3">
        {t('description')}
      </p>

      <div className="grid grid-cols-12 gap-2 mb-3">
        <Input className="col-span-4 h-9" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} />
        <Input className="col-span-3 h-9" placeholder={t('namePlaceholder')} value={name} onChange={e => setName(e.target.value)} />
        <Input className="col-span-4 h-9" placeholder={t('notesPlaceholder')} value={notes} onChange={e => setNotes(e.target.value)} />
        <Button onClick={add} disabled={adding || !email.trim()} size="sm" className="col-span-1">{t('add')}</Button>
      </div>

      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">{t('empty')}</div>
      ) : (
        <div className="rounded border divide-y">
          {items.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2 p-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{r.email}</div>
                <div className="text-xs text-muted-foreground">
                  {r.name ?? ''}{r.name && r.notes ? ' · ' : ''}{r.notes ?? ''}
                </div>
              </div>
              <Button onClick={() => remove(r.id)} variant="ghost" size="sm">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function RoutingSection({ threshold, model, onSaved }: {
  threshold: number | null
  model: string | null
  onSaved: () => void
}) {
  const t = useTranslations('Settings.page.routing')
  const [thresholdVal, setThresholdVal] = useState(threshold !== null ? String(threshold) : '')
  const [modelVal, setModelVal] = useState(model ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routingConfidenceThreshold: thresholdVal === '' ? null : thresholdVal,
        routingModel: modelVal,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    }
  }

  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-3">
        {t('description')}
      </p>

      <div className="grid grid-cols-12 gap-3 mb-3">
        <div className="col-span-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t('threshold')}</label>
          <Input
            type="number"
            min="0" max="1" step="0.05"
            value={thresholdVal}
            onChange={e => setThresholdVal(e.target.value)}
            placeholder={t('none')}
            className="h-9"
          />
        </div>
        <div className="col-span-8">
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t('model')}</label>
          <Input
            value={modelVal}
            onChange={e => setModelVal(e.target.value)}
            placeholder={t('modelPlaceholder')}
            className="h-9"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : t('save')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <Link href="/settings/email-routing" className="text-muted-foreground hover:underline">{t('details')} →</Link>
      </div>
    </Section>
  )
}

// ──────────────────────────── Diligence ────────────────────────────

function MemoAgentSubsection({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="py-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-2 text-left group"
      >
        {open ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />}
        <div className="min-w-0">
          <div className="text-sm font-medium group-hover:text-foreground">{title}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
        </div>
      </button>
      {open && <div className="mt-3 pl-6">{children}</div>}
    </div>
  )
}

function MemoAgentSection() {
  const t = useTranslations('Settings.page.diligence')
  return (
    <Section title={t('title')}>
      <p className="text-xs text-muted-foreground mb-1">
        {t('description')}
      </p>
      <div className="divide-y border-t">
        <MemoAgentSubsection
          title={t('schemas.title')}
          desc={t('schemas.description')}
        >
          <SchemasInline />
        </MemoAgentSubsection>
        <MemoAgentSubsection
          title={t('anchors.title')}
          desc={t('anchors.description')}
        >
          <StyleAnchorsInline />
        </MemoAgentSubsection>
        <MemoAgentSubsection
          title={t('defaults.title')}
          desc={t('defaults.description')}
        >
          <DefaultsEditor embedded section="caps" />
        </MemoAgentSubsection>
        <MemoAgentSubsection
          title={t('models.title')}
          desc={t('models.description')}
        >
          <DefaultsEditor embedded section="stages" />
        </MemoAgentSubsection>
      </div>
    </Section>
  )
}

// ──────────────────────────── Shared ────────────────────────────
//
// GroupHeader / Section / AdminSectionContext now live in components/settings/section.tsx,
// so the settings cards that live in their own files can render with the same admin chrome
// instead of a bare <Card>. They are imported at the top of this file.
