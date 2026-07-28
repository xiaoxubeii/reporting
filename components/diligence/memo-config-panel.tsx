'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save, Settings2, Trash2, GripVertical, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/confirm-dialog'
import { DefaultsEditor } from '@/app/(app)/settings/memo-agent/defaults/editor'
import { useTranslations } from 'next-intl'

export type MemoComplexity = 'brief' | 'standard' | 'detailed' | 'comprehensive'

export interface SectionConfig {
  id: string
  title: string
  included: boolean
  /** Per-section depth/length. Defaults to 'standard'. */
  complexity?: MemoComplexity
  /** Partner-added section the agent should draft (vs a built-in schema section). */
  custom?: boolean
  /** For custom sections: a short note on what the agent should cover. */
  cover?: string
}

export interface MemoTemplateConfig {
  style_override?: 'pre_seed' | 'seed' | 'series_a' | 'series_b' | 'growth' | null
  analyst_persona?: string
  complexity?: MemoComplexity
  emphasis?: string[]
  /** Ordered, user-managed section list (array order = memo order). Authoritative
   *  for which sections appear and in what order; overrides the schema order. */
  sections?: SectionConfig[]
  // Legacy include/exclude map — still written for back-compat; superseded by `sections`.
  section_overrides?: Record<string, { included?: boolean; target_paragraphs?: number | null }>
}

// Section list mirrors the memo editor — keep these in sync if the schema
// section IDs ever change. Order matches the editor for partner mental model.
const SECTIONS = [
  'executive_summary', 'recommendation', 'company_overview', 'market', 'team', 'product_technology',
  'traction', 'business_model', 'competition_moat', 'deal_terms', 'risks_and_open_questions',
]

const STYLE_VALUES: Array<'' | NonNullable<MemoTemplateConfig['style_override']>> = ['', 'pre_seed', 'seed', 'series_a', 'series_b', 'growth']

// Curated analyst-voice presets. Stored verbatim as analyst_persona and fed to
// the agent prompt. "Custom…" reveals a free-text field for anything bespoke.
const PERSONA_PRESETS = [
  'Balanced generalist',
  'Skeptical, numbers-first',
  'Conviction-driven (bull case)',
  'Risk-focused (bear case)',
  'Founder-empathetic operator',
  'Market/TAM-first',
]

// Single proxy for completeness, depth, and length — replaces per-section
// paragraph counts. Order runs shortest → most thorough.
const COMPLEXITY_VALUES: MemoComplexity[] = ['brief', 'standard', 'detailed', 'comprehensive']

interface MemoPreset {
  id: string
  name: string
  description: string | null
  partner_memo_guidance: string
  memo_template_config: MemoTemplateConfig
  default_for_stage: NonNullable<MemoTemplateConfig['style_override']> | null
}

export function MemoConfigPanel({ dealId }: { dealId: string }) {
  const t = useTranslations('Diligence.memoConfig')
  const sectionTitles: Record<string, string> = {
    executive_summary: t('sections.executive_summary'), recommendation: t('sections.recommendation'), company_overview: t('sections.company_overview'),
    market: t('sections.market'), team: t('sections.team'), product_technology: t('sections.product_technology'), traction: t('sections.traction'),
    business_model: t('sections.business_model'), competition_moat: t('sections.competition_moat'), deal_terms: t('sections.deal_terms'), risks_and_open_questions: t('sections.risks_and_open_questions'),
  }
  const styleLabels: Record<'' | NonNullable<MemoTemplateConfig['style_override']>, string> = {
    '': t('styles.default'), pre_seed: t('styles.pre_seed'), seed: t('styles.seed'), series_a: t('styles.series_a'), series_b: t('styles.series_b'), growth: t('styles.growth'),
  }
  const personaLabels = [t('persona.presets.0'), t('persona.presets.1'), t('persona.presets.2'), t('persona.presets.3'), t('persona.presets.4'), t('persona.presets.5')]
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [partnerGuidance, setPartnerGuidance] = useState('')
  const [styleOverride, setStyleOverride] = useState<'' | NonNullable<MemoTemplateConfig['style_override']>>('')
  const [persona, setPersona] = useState('')
  const [personaCustom, setPersonaCustom] = useState(false)
  const [sections, setSections] = useState<SectionConfig[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // Presets — fund-level saved configs.
  const [presets, setPresets] = useState<MemoPreset[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [savePresetOpen, setSavePresetOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [presetDefaultFor, setPresetDefaultFor] = useState<'' | NonNullable<MemoTemplateConfig['style_override']>>('')

  // First-page template — fund-level: which example memo's first page the agent
  // models new memos on. Moved here from the (removed) Diligence Settings page.
  const [anchors, setAnchors] = useState<Array<{ id: string; label: string }>>([])
  const [firstPageAnchorId, setFirstPageAnchorId] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/api/diligence/${dealId}/memo-config`).then(r => r.ok ? r.json() : Promise.reject(new Error('config'))),
      fetch('/api/diligence/memo-presets').then(r => r.ok ? r.json() : Promise.reject(new Error('presets'))),
      fetch('/api/diligence/prompts').then(r => r.ok ? r.json() : { anchors: [], first_page_anchor_id: null }),
    ])
      .then(([cfgBody, presetBody, promptsBody]) => {
        if (cancelled) return
        applyConfigToForm(cfgBody.partner_memo_guidance ?? '', (cfgBody.memo_template_config ?? {}) as MemoTemplateConfig)
        setPresets((presetBody.presets ?? []) as MemoPreset[])
        setAnchors(Array.isArray(promptsBody.anchors) ? promptsBody.anchors : [])
        setFirstPageAnchorId(promptsBody.first_page_anchor_id ?? '')
        setLoaded(true)
      })
      .catch(() => { setError(t('errors.load')); setLoaded(true) })
    return () => { cancelled = true }
    // applyConfigToForm intentionally snapshots the active locale when this deal loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, t])

  function applyConfigToForm(guidance: string, cfg: MemoTemplateConfig) {
    // Legacy "points to emphasize" are now folded into the single guidance field.
    const emph = (Array.isArray(cfg.emphasis) ? cfg.emphasis : []).filter(Boolean)
    setPartnerGuidance(emph.length ? [guidance.trim(), ...emph.map(e => t('emphasizePrefix', { value: e }))].filter(Boolean).join('\n') : guidance)
    setStyleOverride((cfg.style_override ?? '') as '' | NonNullable<MemoTemplateConfig['style_override']>)
    const p = cfg.analyst_persona ?? ''
    setPersona(p)
    setPersonaCustom(!!p && !PERSONA_PRESETS.includes(p))
    // Legacy configs carry a single memo-wide complexity; seed each section from
    // it (then 'standard') so older deals/presets migrate cleanly to per-section.
    const defaultComplexity: MemoComplexity = cfg.complexity ?? 'standard'
    if (Array.isArray(cfg.sections) && cfg.sections.length > 0) {
      setSections(cfg.sections.map(s => ({
        id: s.id,
        title: s.title ?? s.id,
        included: s.included !== false,
        complexity: s.complexity ?? defaultComplexity,
        custom: !!s.custom,
        cover: s.cover ?? '',
      })))
    } else {
      // Back-compat: seed the default section list, honoring legacy include flags.
      setSections(SECTIONS.map(id => ({
        id,
        title: sectionTitles[id] ?? id,
        included: cfg.section_overrides?.[id]?.included !== false,
        complexity: defaultComplexity,
      })))
    }
  }

  function currentConfig(): MemoTemplateConfig {
    return {
      style_override: (styleOverride || null) as MemoTemplateConfig['style_override'],
      analyst_persona: persona,
      emphasis: [],
      sections: sections.map(s => ({
        id: s.id,
        title: s.title,
        included: s.included,
        complexity: s.complexity ?? 'standard',
        ...(s.custom ? { custom: true, cover: (s.cover ?? '').trim() } : {}),
      })),
      // Back-compat for any consumer still reading section_overrides.
      section_overrides: Object.fromEntries(sections.map(s => [s.id, { included: s.included }])),
    }
  }

  function loadPreset(presetId: string) {
    const p = presets.find(p => p.id === presetId)
    if (!p) return
    applyConfigToForm(p.partner_memo_guidance ?? '', p.memo_template_config ?? {})
    setSelectedPresetId(presetId)
  }

  async function savePreset() {
    const name = presetName.trim()
    if (!name) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/diligence/memo-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          partner_memo_guidance: partnerGuidance,
          memo_template_config: currentConfig(),
          default_for_stage: presetDefaultFor || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? t('errors.save'))
      // Refresh presets list — easier than splice-merging the swap-cleanup the
      // server may have done if default_for_stage took an existing slot.
      const refreshed = await fetch('/api/diligence/memo-presets').then(r => r.ok ? r.json() : { presets: [] })
      setPresets((refreshed.presets ?? []) as MemoPreset[])
      setSavePresetOpen(false)
      setPresetName('')
      setPresetDefaultFor('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.save'))
    } finally {
      setSaving(false)
    }
  }

  async function deletePreset(presetId: string) {
    const p = presets.find(p => p.id === presetId)
    const ok = await confirm({
      title: t('deletePreset.title'),
      description: p ? t('deletePreset.description', { name: p.name }) : t('deletePreset.fallback'),
      confirmLabel: t('deletePreset.confirm'),
      variant: 'destructive',
    })
    if (!ok) return
    const res = await fetch(`/api/diligence/memo-presets/${presetId}`, { method: 'DELETE' })
    if (res.ok) {
      setPresets(prev => prev.filter(p => p.id !== presetId))
      if (selectedPresetId === presetId) setSelectedPresetId('')
    }
  }

  async function save() {
    setSaving(true); setError(null)
    try {
      const config = currentConfig()
      const [res] = await Promise.all([
        fetch(`/api/diligence/${dealId}/memo-config`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partner_memo_guidance: partnerGuidance,
            memo_template_config: config,
          }),
        }),
        // First-page template is fund-level (applies to all memos).
        fetch('/api/diligence/prompts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ first_page_anchor_id: firstPageAnchorId || null }),
        }),
      ])
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? t('errors.save'))
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.save'))
    } finally {
      setSaving(false)
    }
  }

  // ---- helpers ----
  function patchSection(id: string, patch: Partial<SectionConfig>) {
    setSections(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)))
  }
  function removeSection(id: string) {
    setSections(prev => prev.filter(s => s.id !== id))
  }
  function addSection() {
    const id = `custom_${Math.random().toString(36).slice(2, 9)}`
    setSections(prev => [...prev, { id, title: t('newSection'), included: true, complexity: 'standard', custom: true, cover: '' }])
  }
  function dropSectionOnto(targetId: string) {
    setSections(prev => {
      if (!dragId || dragId === targetId) return prev
      const from = prev.findIndex(s => s.id === dragId)
      const to = prev.findIndex(s => s.id === targetId)
      if (from === -1 || to === -1) return prev
      const next = prev.slice()
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setDragId(null)
    setOverId(null)
  }

  const includedCount = sections.filter(s => s.included).length
  const selectedPreset = presets.find(preset => preset.id === selectedPresetId)
  const personaPresetIndex = PERSONA_PRESETS.indexOf(persona)
  const effectivePersona = !persona
    ? t('persona.none')
    : personaPresetIndex >= 0
      ? personaLabels[personaPresetIndex]
      : persona.length > 36 ? `${persona.slice(0, 36)}…` : persona
  const summaryItems = [
    { label: t('summary.preset'), value: selectedPreset?.name ?? t('summary.projectPreset') },
    { label: t('summary.style'), value: styleLabels[styleOverride] },
    { label: t('summary.persona'), value: effectivePersona },
    { label: t('summary.sections'), value: t('summary.sectionsEnabled', { count: includedCount }) },
  ]

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">{t('title')}</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            onClick={() => setOpen(current => !current)}
            aria-expanded={open}
          >
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            {open ? t('closeSettings') : t('editSettings')}
          </Button>
        </div>

        {!open && (
          loaded ? (
            <dl className="mt-3 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
              {summaryItems.map(item => (
                <div key={item.label} className="min-w-0">
                  <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
                  <dd className="truncate text-sm font-medium" title={item.value}>{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">{t('loading')}</p>
          )
        )}
      </div>

      {open && (
        <div className="space-y-4 border-t p-4">
          {error && <div className="text-xs text-destructive">{error}</div>}

          <section className="space-y-4 rounded-lg border p-4" aria-labelledby="memo-generation-template-heading">
            <div>
              <h4 id="memo-generation-template-heading" className="text-sm font-medium">{t('groups.template.title')}</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('groups.template.help')}</p>
            </div>

            {/* Loading a preset copies its effective values into the deal-level
                form; the existing PATCH contract remains the source of truth. */}
            <div className="space-y-2 rounded-md bg-muted/30 px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium">{t('preset.label')}</label>
                <select
                  value={selectedPresetId}
                  onChange={e => {
                    setSelectedPresetId(e.target.value)
                    if (e.target.value) loadPreset(e.target.value)
                  }}
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm sm:min-w-[220px]"
                >
                  <option value="">{t('preset.load')}</option>
                  {presets.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.default_for_stage ? ` (${t('preset.defaultFor', { stage: styleLabels[p.default_for_stage] })})` : ''}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={() => setSavePresetOpen(o => !o)}>
                  {t('preset.saveAs')}
                </Button>
                {presets.length > 0 && (
                  <span className="text-[11px] text-muted-foreground sm:ml-auto">{t('preset.count', { count: presets.length })}</span>
                )}
              </div>
              {savePresetOpen && (
                <div className="space-y-2 border-t pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={presetName}
                      onChange={e => setPresetName(e.target.value)}
                      placeholder={t('preset.namePlaceholder')}
                      className="h-8 min-w-0 flex-1 text-sm sm:min-w-[200px]"
                    />
                    <select
                      value={presetDefaultFor}
                      onChange={e => setPresetDefaultFor(e.target.value as '' | NonNullable<MemoTemplateConfig['style_override']>)}
                      className="h-8 max-w-full rounded-md border border-input bg-background px-2 text-sm"
                      title={t('preset.autoApplyHelp')}
                    >
                      <option value="">{t('preset.notDefault')}</option>
                      {STYLE_VALUES.filter((value): value is NonNullable<MemoTemplateConfig['style_override']> => Boolean(value)).map(value => <option key={value} value={value}>{t('preset.defaultFor', { stage: styleLabels[value] })}</option>)}
                    </select>
                    <Button size="sm" onClick={savePreset} disabled={saving || !presetName.trim()}>
                      {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} {t('preset.save')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setSavePresetOpen(false); setPresetName(''); setPresetDefaultFor('') }}>{t('cancel')}</Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{t('preset.help')}</p>
                </div>
              )}
              {presets.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t('preset.manage')}</summary>
                  <div className="mt-2 space-y-1 pl-2">
                    {presets.map(p => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className="font-medium truncate flex-1">{p.name}</span>
                        {p.default_for_stage && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('preset.defaultBadge', { stage: styleLabels[p.default_for_stage] })}</span>}
                        <button onClick={() => deletePreset(p.id)} className="text-muted-foreground hover:text-destructive" aria-label={t('preset.delete')} title={t('preset.delete')}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium mb-1">{t('style.label')}</label>
                <select
                  value={styleOverride}
                  onChange={e => setStyleOverride(e.target.value as '' | NonNullable<MemoTemplateConfig['style_override']>)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {STYLE_VALUES.map(value => <option key={value || 'default'} value={value}>{styleLabels[value]}</option>)}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">{t('style.help')}</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{t('persona.label')}</label>
                <select
                  value={personaCustom ? '__custom__' : (persona && PERSONA_PRESETS.includes(persona) ? persona : (persona ? '__custom__' : ''))}
                  onChange={e => {
                    const value = e.target.value
                    if (value === '') { setPersonaCustom(false); setPersona('') }
                    else if (value === '__custom__') { setPersonaCustom(true) }
                    else { setPersonaCustom(false); setPersona(value) }
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">{t('persona.none')}</option>
                  {PERSONA_PRESETS.map((preset, index) => <option key={preset} value={preset}>{personaLabels[index]}</option>)}
                  <option value="__custom__">{t('persona.custom')}</option>
                </select>
                {personaCustom && (
                  <Input
                    value={persona}
                    onChange={e => setPersona(e.target.value)}
                    placeholder={t('persona.placeholder')}
                    className="h-9 text-sm mt-1.5"
                    autoFocus
                  />
                )}
                <p className="text-[10px] text-muted-foreground mt-1">{t('persona.help')}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">{t('firstPage.label')}</label>
              {anchors.length === 0 ? (
                <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{t('firstPage.empty')}</p>
              ) : (
                <>
                  <select
                    value={firstPageAnchorId}
                    onChange={e => setFirstPageAnchorId(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">{t('firstPage.none')}</option>
                    {anchors.map(anchor => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}
                  </select>
                  <p className="text-[10px] text-muted-foreground mt-1">{t('firstPage.help')}</p>
                </>
              )}
            </div>

            {/* Memo export formatting (font + size) remains fund-level. */}
            <div className="border-t pt-4">
              <DefaultsEditor embedded section="export" />
            </div>
          </section>

          <section className="space-y-3 rounded-lg border p-4" aria-labelledby="memo-project-guidance-heading">
            <div>
              <h4 id="memo-project-guidance-heading" className="text-sm font-medium">{t('groups.guidance.title')}</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('groups.guidance.help')}</p>
            </div>
            <div>
              <label className="sr-only" htmlFor="memo-partner-guidance">{t('guidance.label')}</label>
              <textarea
                id="memo-partner-guidance"
                value={partnerGuidance}
                onChange={e => setPartnerGuidance(e.target.value)}
                rows={4}
                placeholder={t('guidance.placeholder')}
                className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-[10px] text-muted-foreground mt-1">{t('guidance.help')}</p>
            </div>
          </section>

          <details className="rounded-lg border" data-memo-section-editor>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30">
              <span>
                <span className="block text-sm font-medium">{t('groups.sections.title')}</span>
                <span className="block text-xs text-muted-foreground">{t('groups.sections.help')}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{t('summary.sectionsEnabled', { count: includedCount })}</span>
            </summary>
            <div className="space-y-3 border-t p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium">{t('sectionEditor.label')}</span>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={addSection}>
                  <Plus className="h-3 w-3 mr-1" /> {t('sectionEditor.add')}
                </Button>
              </div>
              <div className="rounded-md border divide-y">
                {sections.map(section => (
                  <div
                    key={section.id}
                    onDragOver={dragId && dragId !== section.id ? (event) => { event.preventDefault(); if (overId !== section.id) setOverId(section.id) } : undefined}
                    onDrop={dragId ? (event) => { event.preventDefault(); dropSectionOnto(section.id) } : undefined}
                    className={`px-2 py-2 ${dragId && dragId !== section.id && overId === section.id ? 'border-t-2 border-primary' : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        draggable
                        onDragStart={() => setDragId(section.id)}
                        onDragEnd={() => { setDragId(null); setOverId(null) }}
                        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-foreground shrink-0"
                        title={t('sectionEditor.drag')}
                        aria-label={t('sectionEditor.drag')}
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                      <input
                        type="checkbox"
                        checked={section.included}
                        onChange={event => patchSection(section.id, { included: event.target.checked })}
                        className="h-3.5 w-3.5 shrink-0"
                        title={section.included ? t('sectionEditor.included') : t('sectionEditor.omitted')}
                      />
                      <Input
                        value={section.title}
                        onChange={event => patchSection(section.id, { title: event.target.value })}
                        className={`h-8 min-w-[12rem] flex-1 text-sm ${section.included ? '' : 'opacity-50'}`}
                      />
                      <select
                        value={section.complexity ?? 'standard'}
                        onChange={event => patchSection(section.id, { complexity: event.target.value as MemoComplexity })}
                        disabled={!section.included}
                        title={t('sectionEditor.depthHelp')}
                        aria-label={t('sectionEditor.depthFor', { title: section.title })}
                        className={`h-8 rounded-md border border-input bg-background px-2 text-xs shrink-0 ${section.included ? '' : 'opacity-50'}`}
                      >
                        {COMPLEXITY_VALUES.map(value => <option key={value} value={value}>{t(`complexity.${value}`)}</option>)}
                      </select>
                      {section.custom && <span className="text-[9px] uppercase tracking-wide text-muted-foreground shrink-0">{t('sectionEditor.custom')}</span>}
                      {section.custom && (
                        <button onClick={() => removeSection(section.id)} className="text-muted-foreground hover:text-destructive shrink-0" aria-label={t('sectionEditor.remove')} title={t('sectionEditor.remove')}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {section.custom && section.included && (
                      <Input
                        value={section.cover ?? ''}
                        onChange={event => patchSection(section.id, { cover: event.target.value })}
                        placeholder={t('sectionEditor.coverPlaceholder')}
                        className="ml-7 mt-1.5 h-8 w-[calc(100%-1.75rem)] text-xs"
                      />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">{t('sectionEditor.help')}</p>
            </div>
          </details>

          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={saving || !loaded}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              {saved ? t('saved') : t('saveSettings')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
