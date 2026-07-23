'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, Loader2, Check, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { recommendedModel } from '@/lib/ai/recommended'
import { CUSTOM_AI_PROVIDER_LABEL } from '@/lib/ai/custom-provider'

const STAGES = ['ingest', 'ingest_synthesis', 'checklist_assessment', 'research', 'qa', 'draft', 'draft_review', 'score'] as const
type Stage = typeof STAGES[number]

const FEATURES = ['deal_classify', 'deal_analysis', 'portfolio'] as const
type Feature = typeof FEATURES[number]

const PROVIDER_MODELS_ENDPOINT: Record<string, string> = {
  anthropic: '/api/claude-models',
  openai: '/api/openai-models',
  gemini: '/api/gemini-models',
  ollama: '/api/ollama-models',
}

const PROVIDERS = ['anthropic', 'openai', 'gemini', 'ollama', 'openrouter'] as const

interface Defaults {
  per_deal_token_cap: number | null
  monthly_token_cap: number | null
  stage_models: Record<string, { provider: string; model?: string } | null>
  feature_models: Record<string, { provider: string; model?: string } | null>
  web_search_enabled: boolean
  default_ai_provider: string
  default_models: Record<string, string>
  export_font_family: string
  export_font_size: number
  monthly_used: number
  month_window: { from: string; to: string }
}

// Common document fonts offered in the export font picker. The export still
// accepts any value the user types, but these cover the usual choices.
const EXPORT_FONT_OPTIONS = [
  'DM Sans', 'Arial', 'Calibri', 'Georgia', 'Helvetica',
  'Inter', 'Lato', 'Times New Roman', 'Verdana',
]

interface AIModel { id: string; name: string }

// One provider+model row, prefilled with the recommended choice for the fund's
// provider. The model dropdown defaults to the recommended model for the tier
// (Claude/OpenAI have fast/strong models; Gemini/Ollama use the fund default).
function ModelRow({ label, hint, recommendedKey, current, onChange, defaultProvider, defaultModels, modelsByProvider, loadingProviders }: {
  label: string
  hint: string
  recommendedKey: string
  current: { provider: string; model?: string } | null | undefined
  onChange: (provider: string, model?: string) => void
  defaultProvider: string
  defaultModels: Record<string, string>
  modelsByProvider: Record<string, AIModel[]>
  loadingProviders: Set<string>
}) {
  const t = useTranslations('Settings.defaults')
  const effProvider = current?.provider || defaultProvider
  const effModel = current?.model || recommendedModel(recommendedKey, effProvider, defaultModels[effProvider] ?? '')
  const models = modelsByProvider[effProvider]
  const loading = loadingProviders.has(effProvider)
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-2">
        <div className="text-sm font-medium">{label}</div>
        <p className="text-[11px] text-muted-foreground mt-0.5 max-w-2xl">{hint}</p>
      </div>
      <div className="grid grid-cols-[1fr_1fr] gap-2">
        <select
          value={effProvider}
          onChange={e => onChange(e.target.value, undefined)}
          className="h-9 px-2 rounded-md border border-input bg-background text-sm"
        >
          {PROVIDERS.map(v => <option key={v} value={v}>{v === 'ollama' ? t('providers.ollama') : v === 'openrouter' ? CUSTOM_AI_PROVIDER_LABEL : v === 'anthropic' ? 'Anthropic (Claude)' : v === 'openai' ? 'OpenAI' : 'Gemini'}</option>)}
        </select>
        {models && models.length > 0 ? (
          <select
            value={effModel}
            onChange={e => onChange(effProvider, e.target.value || undefined)}
            className="h-9 px-2 rounded-md border border-input bg-background text-sm font-mono"
          >
            {!models.some(m => m.id === effModel) && <option value={effModel}>{effModel}</option>}
            {models.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
          </select>
        ) : (
          <Input
            value={effModel}
            onChange={e => onChange(effProvider, e.target.value || undefined)}
            placeholder={loading ? t('loadingModels') : t('modelId')}
            className="font-mono text-xs"
            disabled={loading}
          />
        )}
      </div>
    </div>
  )
}

type EditorSection = 'caps' | 'stages' | 'features' | 'export'

export function DefaultsEditor({ embedded, section }: { embedded?: boolean; section?: EditorSection } = {}) {
  const locale = useLocale()
  const t = useTranslations('Settings.defaults')
  // When a section is set, render + save only that slice (so the editor can be
  // split across several settings locations without instances clobbering each
  // other's fields on save).
  const show = (s: EditorSection) => !section || section === s
  const [data, setData] = useState<Defaults | null>(null)
  const [perDeal, setPerDeal] = useState<string>('')
  const [monthly, setMonthly] = useState<string>('')
  const [stageModels, setStageModels] = useState<Record<string, { provider: string; model?: string } | null>>({})
  const [featureModels, setFeatureModels] = useState<Record<string, { provider: string; model?: string } | null>>({})
  const [webSearch, setWebSearch] = useState(false)
  const [exportFont, setExportFont] = useState('DM Sans')
  const [exportFontSize, setExportFontSize] = useState('11')
  const [dgTesting, setDgTesting] = useState(false)
  const [dgResult, setDgResult] = useState<{
    deepgram: { ok: boolean; detail: string }
    webhook_secret_set: boolean
    webhook_url_resolvable: boolean
    ready: boolean
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Model dropdowns load from the active provider for each stage. Cached
  // per provider since multiple stages may pick the same one.
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, AIModel[]>>({})
  const [loadingProviders, setLoadingProviders] = useState<Set<string>>(new Set())

  async function load() {
    const res = await fetch('/api/firm/memo-agent-defaults')
    if (res.ok) {
      const body: Defaults = await res.json()
      setData(body)
      setPerDeal(body.per_deal_token_cap !== null ? String(body.per_deal_token_cap) : '')
      setMonthly(body.monthly_token_cap !== null ? String(body.monthly_token_cap) : '')
      setStageModels(body.stage_models ?? {})
      setFeatureModels(body.feature_models ?? {})
      setWebSearch(!!body.web_search_enabled)
      setExportFont(body.export_font_family || 'DM Sans')
      setExportFontSize(String(body.export_font_size || 11))
    }
  }

  async function loadModelsFor(provider: string) {
    if (!provider || modelsByProvider[provider] || loadingProviders.has(provider)) return
    const endpoint = PROVIDER_MODELS_ENDPOINT[provider]
    if (!endpoint) return
    setLoadingProviders(prev => new Set(prev).add(provider))
    try {
      const res = await fetch(endpoint)
      const body = await res.json().catch(() => ({}))
      const models: AIModel[] = Array.isArray(body?.models) ? body.models : []
      setModelsByProvider(prev => ({ ...prev, [provider]: models }))
    } catch {
      // Leave models empty so the UI falls back to freeform input.
      setModelsByProvider(prev => ({ ...prev, [provider]: [] }))
    } finally {
      setLoadingProviders(prev => { const next = new Set(prev); next.delete(provider); return next })
    }
  }

  useEffect(() => { load() }, [])

  // Pre-load models for the fund default provider (used by every prefilled row)
  // plus any providers explicitly overridden on a stage/feature.
  useEffect(() => {
    const providers = new Set<string>()
    if (data?.default_ai_provider) providers.add(data.default_ai_provider)
    for (const v of Object.values(stageModels)) if (v?.provider) providers.add(v.provider)
    for (const v of Object.values(featureModels)) if (v?.provider) providers.add(v.provider)
    providers.forEach(loadModelsFor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageModels, featureModels, data])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {}
      if (show('caps')) {
        body.per_deal_token_cap = perDeal === '' ? null : Number(perDeal)
        body.monthly_token_cap = monthly === '' ? null : Number(monthly)
        body.web_search_enabled = webSearch
      }
      if (show('stages')) body.stage_models = stageModels
      if (show('features')) body.feature_models = featureModels
      if (show('export')) {
        body.export_font_family = exportFont
        body.export_font_size = exportFontSize === '' ? 11 : Number(exportFontSize)
      }
      const res = await fetch('/api/firm/memo-agent-defaults', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? t('saveFailed'))
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  function setStage(stage: Stage, provider: string, model?: string) {
    setStageModels(prev => ({
      ...prev,
      [stage]: provider ? { provider, ...(model ? { model } : {}) } : null,
    }))
    if (provider) loadModelsFor(provider)
  }

  function setFeature(feature: Feature, provider: string, model?: string) {
    setFeatureModels(prev => ({
      ...prev,
      [feature]: provider ? { provider, ...(model ? { model } : {}) } : null,
    }))
    if (provider) loadModelsFor(provider)
  }

  async function testTranscription() {
    setDgTesting(true)
    setDgResult(null)
    try {
      const res = await fetch('/api/transcription/test')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? t('testFailed'))
      setDgResult(body)
    } catch (err) {
      setDgResult({
        deepgram: { ok: false, detail: err instanceof Error ? err.message : t('testFailed') },
        webhook_secret_set: false,
        webhook_url_resolvable: false,
        ready: false,
      })
    } finally {
      setDgTesting(false)
    }
  }

  if (!data) return <div className="p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />{t('loading')}</div>

  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(data.month_window.from))
  const monthlyPct = data.monthly_token_cap ? Math.min(100, (data.monthly_used / data.monthly_token_cap) * 100) : 0

  return (
    <div className={embedded ? '' : 'p-4 md:py-8 md:pl-8 md:pr-4 max-w-4xl'}>
      {!embedded && (
        <>
          <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-3.5 w-3.5" /> {t('back')}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
            {t('description')}
          </p>
        </>
      )}

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive mb-4">{error}</div>}

      <div className="space-y-4">
        {show('caps') && (
          <div className="space-y-3 text-sm">
            <div className="text-sm font-medium">{t('tokenCaps')}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('perDealCap')}</label>
                <Input
                  type="number"
                  value={perDeal}
                  onChange={e => setPerDeal(e.target.value)}
                  placeholder={t('unlimited')}
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t('perDealHelp')}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('monthlyCap')}</label>
                <Input
                  type="number"
                  value={monthly}
                  onChange={e => setMonthly(e.target.value)}
                  placeholder={t('unlimited')}
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t('monthlyHelp')}
                </p>
              </div>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium">{t('monthUsage', { month: monthName })}</span>
                <span className="font-mono text-muted-foreground">
                  {data.monthly_token_cap
                    ? t('tokenUsageWithCap', {
                        used: new Intl.NumberFormat(locale).format(data.monthly_used),
                        cap: new Intl.NumberFormat(locale).format(data.monthly_token_cap),
                      })
                    : t('tokenUsageNoCap', { used: new Intl.NumberFormat(locale).format(data.monthly_used) })}
                </span>
              </div>
              {data.monthly_token_cap && (
                <div className="h-1.5 bg-background rounded overflow-hidden">
                  <div
                    className={`h-full ${monthlyPct > 90 ? 'bg-red-500' : monthlyPct > 70 ? 'bg-amber-500' : 'bg-primary'}`}
                    style={{ width: `${monthlyPct}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {show('stages') && (
          <div className="space-y-3">
            {STAGES.map(stage => (
              <ModelRow
                key={stage}
                label={t(`stages.${stage}.label`)}
                hint={t(`stages.${stage}.hint`)}
                recommendedKey={stage}
                current={stageModels[stage]}
                onChange={(provider, model) => setStage(stage, provider, model)}
                defaultProvider={data.default_ai_provider}
                defaultModels={data.default_models}
                modelsByProvider={modelsByProvider}
                loadingProviders={loadingProviders}
              />
            ))}
          </div>
        )}

        {show('features') && (
          <div className="space-y-3">
            {FEATURES.map(feature => (
              <ModelRow
                key={feature}
                label={t(`features.${feature}.label`)}
                hint={t(`features.${feature}.hint`)}
                recommendedKey={feature}
                current={featureModels[feature]}
                onChange={(provider, model) => setFeature(feature, provider, model)}
                defaultProvider={data.default_ai_provider}
                defaultModels={data.default_models}
                modelsByProvider={modelsByProvider}
                loadingProviders={loadingProviders}
              />
            ))}
          </div>
        )}

        {show('caps') && (
          <div className="space-y-2 text-sm">
            <div className="text-sm font-medium">{t('webSearch.title')}</div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={webSearch}
                onChange={e => setWebSearch(e.target.checked)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <div className="font-medium">{t('webSearch.enable')}</div>
                <p className="text-xs text-muted-foreground max-w-2xl">
                  {t.rich('webSearch.help', {
                    tool: chunks => <span className="font-mono">{chunks}</span>,
                    billing: chunks => <span className="font-medium text-foreground">{chunks}</span>,
                  })}
                </p>
              </div>
            </label>
          </div>
        )}

        {show('export') && (
        <div className="space-y-3 text-sm">
            <div className="text-sm font-medium">{t('export.title')}</div>
            <p className="text-xs text-muted-foreground max-w-2xl">
              {t('export.description')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('export.baseFont')}</label>
                <input
                  list="export-font-options"
                  value={exportFont}
                  onChange={e => setExportFont(e.target.value)}
                  placeholder="DM Sans"
                  className="h-9 w-full px-2 rounded-md border border-input bg-background text-sm"
                />
                <datalist id="export-font-options">
                  {EXPORT_FONT_OPTIONS.map(f => <option key={f} value={f} />)}
                </datalist>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t('export.fontHelp')}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('export.fontSize')}</label>
                <Input
                  type="number"
                  min={6}
                  max={32}
                  value={exportFontSize}
                  onChange={e => setExportFontSize(e.target.value)}
                  placeholder="11"
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground mt-1">{t('export.sizeHelp')}</p>
              </div>
            </div>
        </div>
        )}

        {show('stages') && (
          <div className="space-y-3 text-sm pt-1">
            <div className="text-sm font-medium">{t('transcription.title')}</div>
            <p className="text-xs text-muted-foreground max-w-2xl">
              {t('transcription.description')}
            </p>
            <Button variant="outline" size="sm" onClick={testTranscription} disabled={dgTesting}>
              {dgTesting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              {t('transcription.test')}
            </Button>
            {dgResult && (
              <div className="rounded-md border bg-muted/20 p-3 space-y-1.5 text-xs">
                <ResultRow ok={dgResult.deepgram.ok} label={t('transcription.deepgramApi')} detail={dgResult.deepgram.detail} />
                <ResultRow
                  ok={dgResult.webhook_secret_set}
                  label={t('transcription.webhookSecret')}
                  detail={dgResult.webhook_secret_set ? t('transcription.secretSet') : t('transcription.secretMissing')}
                />
                <ResultRow
                  ok={dgResult.webhook_url_resolvable}
                  label={t('transcription.webhookUrl')}
                  detail={dgResult.webhook_url_resolvable ? t('transcription.urlReady') : t('transcription.urlMissing')}
                />
                <div className={`pt-1 font-medium ${dgResult.ready ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {dgResult.ready ? t('transcription.ready') : t('transcription.notReady')}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : saved ? <Check className="h-4 w-4 mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            {saved ? t('saved') : t('save')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ResultRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
        {ok ? '\u2713' : '\u2717'}
      </span>
      <div className="min-w-0">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{` \u2014 ${detail}`}</span>
      </div>
    </div>
  )
}
