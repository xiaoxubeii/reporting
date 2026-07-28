'use client'

import { useState } from 'react'
import { Check, Loader2, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import {
  ANALYSIS_FOCUS_AREAS,
  normalizeAnalysisPreferences,
  type AnalysisDepth,
  type AnalysisFocusArea,
  type AnalysisPreferences,
} from '@/lib/diligence/analysis-preferences'
import { useTranslations } from 'next-intl'

export function AnalysisPreferencesSheet({
  dealId,
  preferences,
  onSaved,
}: {
  dealId: string
  preferences: AnalysisPreferences | null | undefined
  onSaved?: (preferences: AnalysisPreferences) => void
}) {
  const t = useTranslations('Diligence.analysisPreferences')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => normalizeAnalysisPreferences(preferences))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openSheet() {
    setForm(normalizeAnalysisPreferences(preferences))
    setSaved(false)
    setError(null)
    setOpen(true)
  }

  function toggleFocus(area: AnalysisFocusArea) {
    setForm(current => ({
      ...current,
      focus_areas: current.focus_areas.includes(area)
        ? current.focus_areas.filter(value => value !== area)
        : [...current.focus_areas, area],
    }))
  }

  async function save(reanalyze: boolean) {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const response = await fetch(`/api/diligence/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis_preferences: form }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? t('errors.save'))

      const normalized = normalizeAnalysisPreferences(form)
      setForm(normalized)
      onSaved?.(normalized)

      if (reanalyze) {
        const analysisResponse = await fetch(`/api/diligence/${dealId}/agent/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full: true }),
        })
        const analysisResult = await analysisResponse.json().catch(() => ({})) as { error?: string; message?: string }
        if (!analysisResponse.ok) {
          throw new Error(analysisResult.error ?? analysisResult.message ?? t('errors.reanalyze'))
        }
      }

      setSaved(true)
      if (reanalyze) setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('errors.save'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-8" onClick={openSheet}>
        <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
        {t('trigger')}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-[440px] max-w-[92vw] p-0 flex flex-col"
          dialogTitle={t('title')}
          dialogDescription={t('description')}
        >
          <div className="px-6 pt-6 pb-5 border-b">
            <h2 className="text-lg font-semibold tracking-tight">{t('title')}</h2>
            <p className="text-sm text-muted-foreground mt-1 pr-6">{t('description')}</p>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-7">
            <fieldset>
              <legend className="text-sm font-medium">{t('focus.title')}</legend>
              <p className="text-xs text-muted-foreground mt-1 mb-3">{t('focus.help')}</p>
              <div className="flex flex-wrap gap-2">
                {ANALYSIS_FOCUS_AREAS.map(area => {
                  const selected = form.focus_areas.includes(area)
                  return (
                    <button
                      key={area}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleFocus(area)}
                      className={`rounded-md border px-3 py-2 text-sm transition-colors ${selected
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-input bg-background hover:bg-muted'
                      }`}
                    >
                      {t(`focus.areas.${area}`)}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div>
              <label id="analysis-depth-label" className="text-sm font-medium">{t('depth.title')}</label>
              <p className="text-xs text-muted-foreground mt-1 mb-3">{t('depth.help')}</p>
              <Select
                value={form.depth}
                onValueChange={value => setForm(current => ({ ...current, depth: value as AnalysisDepth }))}
              >
                <SelectTrigger aria-labelledby="analysis-depth-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick">{t('depth.options.quick')}</SelectItem>
                  <SelectItem value="standard">{t('depth.options.standard')}</SelectItem>
                  <SelectItem value="deep">{t('depth.options.deep')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="analysis-custom-instructions" className="text-sm font-medium">{t('instructions.title')}</label>
              <p className="text-xs text-muted-foreground mt-1 mb-3">{t('instructions.help')}</p>
              <textarea
                id="analysis-custom-instructions"
                value={form.custom_instructions}
                onChange={event => setForm(current => ({ ...current, custom_instructions: event.target.value.slice(0, 4000) }))}
                rows={7}
                maxLength={4000}
                placeholder={t('instructions.placeholder')}
                className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="text-[11px] text-muted-foreground text-right mt-1">
                {form.custom_instructions.length}/4000
              </div>
            </div>

            <div className="rounded-md bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
              {t('scopeHelp')}
            </div>

            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>

          <div className="border-t px-6 py-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : saved ? <Check className="h-4 w-4 mr-1.5" /> : null}
              {saved ? t('saved') : t('save')}
            </Button>
            <Button onClick={() => save(true)} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {t('saveAndReanalyze')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
