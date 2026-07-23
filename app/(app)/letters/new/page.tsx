'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, ArrowRight, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { getCurrencySymbol } from '@/components/currency-context'
import { useFeatureVisibility } from '@/components/feature-visibility-context'

interface Template {
  id: string
  name: string
}

interface PreviewCompany {
  investment: {
    companyId: string
    companyName: string
    status: string
    stage: string | null
    totalInvested: number
    fmv: number
    moic: number | null
  }
  metrics: { metricName: string; currentValue: number | string | null; currentLabel: string }[]
}

interface Preview {
  fundName: string
  fundCurrency: string
  periodLabel: string
  companies: PreviewCompany[]
  totals: {
    totalInvested: number
    totalFmv: number
    totalRealized: number
    portfolioMoic: number | null
    activeCount: number
    exitedCount: number
    writtenOffCount: number
  }
}

function fmt(value: number, currency: string, locale: string): string {
  const sym = getCurrencySymbol(currency)
  if (Math.abs(value) >= 1_000_000) return `${sym}${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1_000_000)}M`
  if (Math.abs(value) >= 1_000) return `${sym}${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value / 1_000)}K`
  return `${sym}${new Intl.NumberFormat(locale).format(value)}`
}

export default function NewLetterPage() {
  const t = useTranslations('Letters.new')
  const locale = useLocale()
  const fv = useFeatureVisibility()
  const router = useRouter()
  const [step, setStep] = useState(1)

  // Step 1: Period selection
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(String(currentYear))
  const [quarter, setQuarter] = useState('4')
  const [isYearEnd, setIsYearEnd] = useState(false)
  const [portfolioGroup, setPortfolioGroup] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')

  // Data
  const [templates, setTemplates] = useState<Template[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [creating, setCreating] = useState(false)

  // Load templates and portfolio groups
  useEffect(() => {
    fetch('/api/lp-letters/templates').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setTemplates(data)
    })

    // Fetch portfolio groups from companies
    fetch('/api/dashboard/table-data').then(r => r.json()).then(data => {
      if (data.companies) {
        const allGroups = new Set<string>()
        for (const c of data.companies) {
          for (const g of c.portfolioGroup ?? []) allGroups.add(g)
        }
        const sorted = Array.from(allGroups).sort()
        setGroups(sorted)
        if (sorted.length > 0) setPortfolioGroup(current => current || sorted[0])
      }
    })
  }, [])

  const loadPreview = async () => {
    if (!portfolioGroup) return
    setLoadingPreview(true)
    const params = new URLSearchParams({
      year, quarter, group: portfolioGroup, yearEnd: String(isYearEnd),
    })
    const res = await fetch(`/api/lp-letters/preview?${params}`)
    if (res.ok) {
      setPreview(await res.json())
    }
    setLoadingPreview(false)
    setStep(2)
  }

  const createAndGenerate = async () => {
    setCreating(true)

    // Create the letter
    const res = await fetch('/api/lp-letters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        period_year: parseInt(year),
        period_quarter: parseInt(quarter),
        is_year_end: isYearEnd,
        portfolio_group: portfolioGroup,
        template_id: templateId || null,
        generation_prompt: customPrompt.trim() || null,
      }),
    })

    if (!res.ok) {
      setCreating(false)
      return
    }

    const letter = await res.json()

    // Trigger generation
    const genRes = await fetch(`/api/lp-letters/${letter.id}/generate`, { method: 'POST' })

    if (genRes.ok) {
      router.push(`/letters/${letter.id}`)
    } else {
      // Still navigate — the letter exists but generation failed
      router.push(`/letters/${letter.id}`)
    }
  }

  return (
    <div className="p-4 md:py-8 md:pl-8 md:pr-4 max-w-3xl">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          {fv.lp_letters === 'admin' && <Lock className="h-4 w-4 text-amber-500" />}{t('title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('step', { step, label: step === 1 ? t('selectPeriod') : t('reviewGenerate') })}
        </p>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('year')}</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('quarter')}</Label>
              <Select value={quarter} onValueChange={setQuarter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map(q => (
                    <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {quarter === '4' && (
            <div className="flex items-center gap-3">
              <Switch checked={isYearEnd} onCheckedChange={setIsYearEnd} />
              <Label>{t('yearEnd')}</Label>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('portfolioGroup')}</Label>
            {groups.length > 0 ? (
              <Select value={portfolioGroup} onValueChange={setPortfolioGroup}>
                <SelectTrigger><SelectValue placeholder={t('selectGroup')} /></SelectTrigger>
                <SelectContent>
                  {groups.map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('noGroups')}
              </p>
            )}
          </div>

          {templates.length > 0 && (
            <div className="space-y-2">
              <Label>{t('template')}</Label>
              <Select value={templateId || templates[0]?.id} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('customInstructions')}</Label>
            <Textarea
              placeholder={t('customPlaceholder')}
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {t('customHint')}
            </p>
          </div>

          <Button onClick={loadPreview} disabled={!portfolioGroup || loadingPreview}>
            {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {t('reviewData')}
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      )}

      {step === 2 && preview && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-muted/30 p-4">
            <h2 className="font-medium text-sm mb-2">{preview.fundName}, {preview.periodLabel}</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">{t('summary.capitalDeployed')}</p>
                <p className="font-medium">{fmt(preview.totals.totalInvested, preview.fundCurrency, locale)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{t('summary.totalFmv')}</p>
                <p className="font-medium">{fmt(preview.totals.totalFmv, preview.fundCurrency, locale)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{t('summary.moic')}</p>
                <p className="font-medium">{preview.totals.portfolioMoic ? `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(preview.totals.portfolioMoic)}x` : t('notAvailable')}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t('summary.statusCounts', { active: preview.totals.activeCount, exited: preview.totals.exitedCount, writtenOff: preview.totals.writtenOffCount })}
            </p>
          </div>

          <div>
            <h3 className="font-medium text-sm mb-3">{t('companies', { count: preview.companies.length })}</h3>
            <div className="space-y-2">
              {preview.companies.map(c => (
                <div key={c.investment.companyId} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{c.investment.companyName}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.investment.stage ?? t('notAvailable')} | {t('status', { status: c.investment.status })} | {t('invested', { value: fmt(c.investment.totalInvested, preview.fundCurrency, locale) })}
                        {c.investment.moic ? ` | ${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(c.investment.moic)}x` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{t('metrics', { count: c.metrics.length })}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('metricsWithData', { count: c.metrics.filter(m => m.currentValue !== null).length })}
                      </p>
                    </div>
                  </div>
                  {c.metrics.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {c.metrics.slice(0, 4).map((m, i) => (
                        <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                          {m.metricName}: {m.currentValue !== null ? String(m.currentValue) : '—'}
                        </span>
                      ))}
                      {c.metrics.length > 4 && (
                        <span className="text-[10px] text-muted-foreground">{t('more', { count: c.metrics.length - 4 })}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              {t('back')}
            </Button>
            <Button onClick={createAndGenerate} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  {t('generating')}
                </>
              ) : (
                t('generate')
              )}
            </Button>
          </div>

          {creating && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">
                {t('generatingHint', { count: preview.companies.length })}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
