'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, Save, Loader2, Check, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface Anchor {
  id: string
  fund_id: string
  storage_path: string
  file_name: string
  file_format: string
  file_size_bytes: number | null
  title: string | null
  anonymized: boolean
  vintage_year: number | null
  vintage_quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null
  sector: string | null
  deal_stage_at_writing: string | null
  outcome: 'invested' | 'passed' | 'lost_competitive' | 'withdrew' | 'unknown' | null
  conviction_at_writing: 'high' | 'medium' | 'low' | 'mixed' | null
  voice_representativeness: 'exemplary' | 'representative' | 'atypical' | 'do_not_match_voice'
  authorship: string | null
  author_initials: string | null
  focus_attention_on: string[] | null
  deprioritize_in_this_memo: string[] | null
  partner_notes: string | null
  extracted_text: string | null
  extracted_at: string | null
  uploaded_at: string
}

export function AnchorEditor({ anchor: initial }: { anchor: Anchor }) {
  const router = useRouter()
  const format = useFormatter()
  const locale = useLocale()
  const t = useTranslations('Settings.anchorEditor')
  const [a, setA] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof Anchor>(key: K, value: Anchor[K]) {
    setA(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/firm/style-anchors/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: a.title,
          anonymized: a.anonymized,
          vintage_year: a.vintage_year,
          vintage_quarter: a.vintage_quarter,
          sector: a.sector,
          deal_stage_at_writing: a.deal_stage_at_writing,
          outcome: a.outcome,
          conviction_at_writing: a.conviction_at_writing,
          voice_representativeness: a.voice_representativeness,
          authorship: a.authorship,
          author_initials: a.author_initials,
          focus_attention_on: a.focus_attention_on ?? [],
          deprioritize_in_this_memo: a.deprioritize_in_this_memo ?? [],
          partner_notes: a.partner_notes,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? t('saveFailed'))
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 md:py-8 md:pl-8 md:pr-4 max-w-4xl">
      <Link href="/settings/memo-agent/style-anchors" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> {t('allAnchors')}
      </Link>

      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{a.title || a.file_name}</h1>
          <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
            <FileText className="h-3 w-3" /> {a.file_name} · {a.file_format.toUpperCase()} · {a.file_size_bytes ? t('sizeMb', { value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(a.file_size_bytes / 1024 / 1024) }) : '—'}
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5 mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          {saved ? t('saved') : t('save')}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{t('identification')}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label={t('fields.title')}>
              <Input value={a.title ?? ''} onChange={e => update('title', e.target.value || null)} />
            </Field>
            <Field label={t('fields.anonymized')}>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={a.anonymized}
                  onChange={e => update('anonymized', e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-xs">{t('anonymizedHelp')}</span>
              </label>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{t('vintage')}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('fields.year')}>
                <Input
                  type="number"
                  value={a.vintage_year ?? ''}
                  onChange={e => update('vintage_year', e.target.value ? parseInt(e.target.value, 10) : null)}
                  placeholder={t('placeholders.year')}
                />
              </Field>
              <Field label={t('fields.quarter')}>
                <select
                  value={a.vintage_quarter ?? ''}
                  onChange={e => update('vintage_quarter', (e.target.value || null) as Anchor['vintage_quarter'])}
                  className="h-9 w-full px-2 rounded-md border border-input bg-background text-sm"
                >
                  <option value="">—</option>
                  <option value="Q1">Q1</option>
                  <option value="Q2">Q2</option>
                  <option value="Q3">Q3</option>
                  <option value="Q4">Q4</option>
                </select>
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{t('dealContext')}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label={t('fields.sector')}>
              <Input value={a.sector ?? ''} onChange={e => update('sector', e.target.value || null)} placeholder={t('placeholders.sector')} />
            </Field>
            <Field label={t('fields.stage')}>
              <select
                value={a.deal_stage_at_writing ?? ''}
                onChange={e => update('deal_stage_at_writing', e.target.value || null)}
                className="h-9 w-full px-2 rounded-md border border-input bg-background text-sm"
              >
                <option value="">—</option>
                <option value="pre_seed">{t('stages.preSeed')}</option>
                <option value="seed">{t('stages.seed')}</option>
                <option value="series_a">{t('stages.seriesA')}</option>
                <option value="series_b">{t('stages.seriesB')}</option>
                <option value="growth">{t('stages.growth')}</option>
                <option value="follow_on">{t('stages.followOn')}</option>
                <option value="other">{t('stages.other')}</option>
              </select>
            </Field>
            <Field label={t('fields.outcome')}>
              <select
                value={a.outcome ?? ''}
                onChange={e => update('outcome', (e.target.value || null) as Anchor['outcome'])}
                className="h-9 w-full px-2 rounded-md border border-input bg-background text-sm"
              >
                <option value="">—</option>
                <option value="invested">{t('outcomes.invested')}</option>
                <option value="passed">{t('outcomes.passed')}</option>
                <option value="lost_competitive">{t('outcomes.lostCompetitive')}</option>
                <option value="withdrew">{t('outcomes.withdrew')}</option>
                <option value="unknown">{t('outcomes.unknown')}</option>
              </select>
            </Field>
            <Field label={t('fields.conviction')}>
              <select
                value={a.conviction_at_writing ?? ''}
                onChange={e => update('conviction_at_writing', (e.target.value || null) as Anchor['conviction_at_writing'])}
                className="h-9 w-full px-2 rounded-md border border-input bg-background text-sm"
              >
                <option value="">—</option>
                <option value="high">{t('convictions.high')}</option>
                <option value="medium">{t('convictions.medium')}</option>
                <option value="low">{t('convictions.low')}</option>
                <option value="mixed">{t('convictions.mixed')}</option>
              </select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{t('voiceAuthorship')}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label={t('fields.voice')}>
              <select
                value={a.voice_representativeness}
                onChange={e => update('voice_representativeness', e.target.value as Anchor['voice_representativeness'])}
                className="h-9 w-full px-2 rounded-md border border-input bg-background text-sm"
              >
                <option value="exemplary">{t('voice.exemplary')}</option>
                <option value="representative">{t('voice.representative')}</option>
                <option value="atypical">{t('voice.atypical')}</option>
                <option value="do_not_match_voice">{t('voice.doNotMatch')}</option>
              </select>
            </Field>
            <Field label={t('fields.authorship')}>
              <select
                value={a.authorship ?? ''}
                onChange={e => update('authorship', e.target.value || null)}
                className="h-9 w-full px-2 rounded-md border border-input bg-background text-sm"
              >
                <option value="">—</option>
                <option value="single_partner">{t('authorship.singlePartner')}</option>
                <option value="lead_with_input">{t('authorship.leadWithInput')}</option>
                <option value="partnership">{t('authorship.partnership')}</option>
                <option value="unknown">{t('authorship.unknown')}</option>
              </select>
            </Field>
            <Field label={t('fields.authorInitials')}>
              <Input value={a.author_initials ?? ''} onChange={e => update('author_initials', e.target.value || null)} placeholder={t('placeholders.initials')} />
            </Field>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-base">{t('attention')}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label={t('fields.focusAttention')}>
              <Input
                value={(a.focus_attention_on ?? []).join(', ')}
                onChange={e => update('focus_attention_on', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder={t('placeholders.focusAttention')}
              />
            </Field>
            <Field label={t('fields.deprioritize')}>
              <Input
                value={(a.deprioritize_in_this_memo ?? []).join(', ')}
                onChange={e => update('deprioritize_in_this_memo', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder={t('placeholders.deprioritize')}
              />
            </Field>
            <p className="text-[11px] text-muted-foreground">
              {t.rich('attentionHelp', {
                schema: chunks => <Link href="/settings/memo-agent/schemas/style_anchors" className="underline">{chunks}</Link>,
              })}
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-base">{t('partnerNotes')}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <textarea
              value={a.partner_notes ?? ''}
              onChange={e => update('partner_notes', e.target.value || null)}
              rows={4}
              className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={t('placeholders.partnerNotes')}
            />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-base">{t('textExtraction')}</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {a.extracted_at ? (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  {t('textExtracted', {
                    date: format.dateTime(new Date(a.extracted_at), { dateStyle: 'medium', timeStyle: 'short' }),
                    count: a.extracted_text?.length ?? 0,
                  })}
                </p>
                {a.extracted_text && (
                  <pre className="whitespace-pre-wrap rounded border bg-muted/30 p-3 max-h-72 overflow-y-auto text-xs">
                    {a.extracted_text.slice(0, 4000)}
                    {a.extracted_text.length > 4000 && `\n${t('truncated')}`}
                  </pre>
                )}
              </div>
            ) : (
              <p className="text-amber-600">
                {t('extractionFailed')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {error && <p className="text-sm text-destructive mt-3">{error}</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  )
}
