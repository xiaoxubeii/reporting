'use client'

import React from 'react'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Check, ExternalLink, Eye, Loader2, Monitor, Plus, Save, Smartphone, Trash2, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/components/confirm-dialog'
import type {
  FundPublicSiteContentV1,
  FundPublicSiteLocale,
  FundPublicSitePerson,
  FundPublicSitePortfolioEntry,
  LocalizedText,
} from '@/lib/fund-public-site/content'
import type { FundPublicSiteDraft } from '@/lib/fund-public-site/store'
import type { FundPublicSiteTemplate } from '@/lib/fund-public-site/templates'

interface ApiPayload {
  site: FundPublicSiteDraft
  fund?: { name: string; slug: string | null }
  error?: string
  issues?: string[]
}

const TEMPLATE_KEYS: FundPublicSiteTemplate[] = ['focus', 'institutional', 'minimal']

export function PublicSiteEditor() {
  const t = useTranslations('Settings.publicSite')
  const confirm = useConfirm()
  const [site, setSite] = useState<FundPublicSiteDraft | null>(null)
  const [templateKey, setTemplateKey] = useState<FundPublicSiteTemplate>('focus')
  const [content, setContent] = useState<FundPublicSiteContentV1 | null>(null)
  const [contentLocale, setContentLocale] = useState<FundPublicSiteLocale>('en')
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busy, setBusy] = useState<'load' | 'save' | 'publish' | 'unpublish' | null>('load')
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const dirty = useMemo(() => Boolean(site && content && (
    site.templateKey !== templateKey || JSON.stringify(site.content) !== JSON.stringify(content)
  )), [content, site, templateKey])

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setBusy('load')
    setMessage(null)
    try {
      const response = await fetch('/api/settings/public-site', { cache: 'no-store' })
      const payload = await response.json() as ApiPayload
      if (!response.ok || !payload.site) throw new Error(payload.error || t('errors.load'))
      applyServerSite(payload.site)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('errors.load') })
    } finally {
      setBusy(null)
    }
  }

  function applyServerSite(next: FundPublicSiteDraft) {
    setSite(next)
    setTemplateKey(next.templateKey)
    setContent(next.content)
  }

  async function save() {
    if (!site || !content) return
    setBusy('save')
    setMessage(null)
    try {
      const response = await fetch('/api/settings/public-site', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: site.draftRevision, templateKey, content }),
      })
      const payload = await response.json() as ApiPayload
      if (response.status === 409) {
        await load()
        throw new Error(t('errors.conflict'))
      }
      if (!response.ok || !payload.site) {
        throw new Error(payload.issues?.length ? t('errors.validation') : payload.error || t('errors.save'))
      }
      applyServerSite(payload.site)
      setMessage({ kind: 'success', text: t('saved') })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('errors.save') })
    } finally {
      setBusy(null)
    }
  }

  async function publish() {
    if (!site || dirty || (site.isPublished && !site.hasUnpublishedChanges)) return
    const accepted = await confirm({
      title: t('publishConfirmTitle'),
      description: t('publishConfirmDescription'),
      confirmLabel: t('publish'),
    })
    if (!accepted) return
    setBusy('publish')
    setMessage(null)
    try {
      const response = await fetch('/api/settings/public-site/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedDraftRevision: site.draftRevision,
          expectedLifecycleRevision: site.lifecycleRevision,
        }),
      })
      const payload = await response.json() as ApiPayload
      if (response.status === 409) {
        await load()
        throw new Error(t('errors.conflict'))
      }
      if (!response.ok || !payload.site) throw new Error(payload.error || t('errors.publish'))
      applyServerSite(payload.site)
      setMessage({ kind: 'success', text: t('publishedVersion', { version: payload.site.publishedVersion }) })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('errors.publish') })
    } finally {
      setBusy(null)
    }
  }

  async function unpublish() {
    if (!site) return
    const accepted = await confirm({
      title: t('unpublishConfirmTitle'),
      description: t('unpublishConfirmDescription'),
      confirmLabel: t('unpublish'),
      variant: 'destructive',
    })
    if (!accepted) return
    setBusy('unpublish')
    setMessage(null)
    try {
      const response = await fetch('/api/settings/public-site/unpublish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedLifecycleRevision: site.lifecycleRevision }),
      })
      const payload = await response.json() as ApiPayload
      if (response.status === 409) {
        await load()
        throw new Error(t('errors.conflict'))
      }
      if (!response.ok || !payload.site) throw new Error(payload.error || t('errors.unpublish'))
      applyServerSite(payload.site)
      setMessage({ kind: 'success', text: t('unpublished') })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('errors.unpublish') })
    } finally {
      setBusy(null)
    }
  }

  if (busy === 'load' || !content || !site) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        {message ? <p className="text-sm text-destructive">{message.text}</p> : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </div>
    )
  }

  const locale = contentLocale
  const setLocalized = (section: 'hero' | 'about' | 'strategy' | 'seo', field: string, value: string) => {
    setContent(previous => previous ? ({
      ...previous,
      [section]: {
        ...previous[section],
        [field]: { ...(previous[section] as unknown as Record<string, LocalizedText>)[field], [locale]: value },
      },
    }) : previous)
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/settings" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />{t('back')}</Link>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {site.isPublished && <Button variant="outline" asChild><a href="/" target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />{t('openLive')}</a></Button>}
          <Button variant="outline" disabled={dirty} onClick={() => setPreviewOpen(value => !value)}><Eye className="h-4 w-4" />{previewOpen ? t('closePreview') : t('preview')}</Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 font-medium ${site.isPublished ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
            <span className={`h-2 w-2 rounded-full ${site.isPublished ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
            {site.isPublished ? t('live') : t('notPublished')}
          </span>
          {site.publishedVersion > 0 && <span className="text-muted-foreground">{t('version', { version: site.publishedVersion })}</span>}
          {(dirty || site.hasUnpublishedChanges) && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{t('unpublishedChanges')}</span>}
        </div>
        {message && <span role="status" className={message.kind === 'error' ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}>{message.text}</span>}
      </div>

      {previewOpen && (
        <section className="mb-8 rounded-xl border bg-muted/30 p-3 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">{t('savedDraftPreview')}</p>
            <div className="flex rounded-lg border bg-background p-1">
              <button aria-label={t('previewDesktop')} aria-pressed={previewDevice === 'desktop'} onClick={() => setPreviewDevice('desktop')} className={`rounded-md p-2 ${previewDevice === 'desktop' ? 'bg-accent' : ''}`}><Monitor className="h-4 w-4" /></button>
              <button aria-label={t('previewMobile')} aria-pressed={previewDevice === 'mobile'} onClick={() => setPreviewDevice('mobile')} className={`rounded-md p-2 ${previewDevice === 'mobile' ? 'bg-accent' : ''}`}><Smartphone className="h-4 w-4" /></button>
            </div>
          </div>
          <iframe
            title={t('savedDraftPreview')}
            sandbox="allow-same-origin"
            src={`/fund-public-site-preview?locale=${encodeURIComponent(contentLocale)}&revision=${site.draftRevision}`}
            className={`mx-auto h-[720px] max-w-full rounded-lg border bg-white shadow-sm transition-[width] ${previewDevice === 'mobile' ? 'w-[390px]' : 'w-full'}`}
          />
        </section>
      )}

      <div className="space-y-8">
        <section>
          <div className="mb-3"><h2 className="text-lg font-semibold">{t('templates.title')}</h2><p className="text-sm text-muted-foreground">{t('templates.description')}</p></div>
          <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label={t('templates.title')}>
            {TEMPLATE_KEYS.map(key => (
              <button key={key} role="radio" aria-checked={templateKey === key} onClick={() => setTemplateKey(key)} className={`rounded-xl border p-4 text-left transition-colors ${templateKey === key ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-foreground/30'}`}>
                <div className="flex items-center justify-between"><span className="font-semibold">{t(`templates.${key}.name`)}</span>{templateKey === key && <Check className="h-4 w-4 text-primary" />}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`templates.${key}.description`)}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4 md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-semibold">{t('content.title')}</h2><p className="text-sm text-muted-foreground">{t('content.description')}</p></div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('fields.defaultLanguage')}>
                <Select value={content.defaultLocale} onValueChange={value => setContent(previous => previous ? ({ ...previous, defaultLocale: value as FundPublicSiteLocale }) : previous)}>
                  <SelectTrigger aria-label={t('fields.defaultLanguage')} className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="zh-CN">简体中文</SelectItem></SelectContent>
                </Select>
              </Field>
              <div className="flex rounded-lg border p-1">
                {(['en', 'zh-CN'] as const).map(key => <button key={key} onClick={() => setContentLocale(key)} className={`rounded-md px-3 py-1.5 text-sm ${locale === key ? 'bg-accent font-medium' : 'text-muted-foreground'}`}>{key === 'en' ? 'English' : '简体中文'}</button>)}
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label={t('fields.heroTitle')}><Input value={content.hero.title[locale] ?? ''} onChange={event => setLocalized('hero', 'title', event.target.value)} /></Field>
            <Field label={t('fields.eyebrow')}><Input value={content.hero.eyebrow[locale] ?? ''} onChange={event => setLocalized('hero', 'eyebrow', event.target.value)} /></Field>
            <Field label={t('fields.summary')} className="md:col-span-2"><Textarea rows={3} value={content.hero.summary[locale] ?? ''} onChange={event => setLocalized('hero', 'summary', event.target.value)} /></Field>
            <Field label={t('fields.aboutHeading')}><Input value={content.about.heading[locale] ?? ''} onChange={event => setLocalized('about', 'heading', event.target.value)} /></Field>
            <Field label={t('fields.strategyHeading')}><Input value={content.strategy.heading[locale] ?? ''} onChange={event => setLocalized('strategy', 'heading', event.target.value)} /></Field>
            <Field label={t('fields.about')} className="md:col-span-2"><Textarea rows={6} value={content.about.body[locale] ?? ''} onChange={event => setLocalized('about', 'body', event.target.value)} /></Field>
            <p className="md:col-span-2 text-xs text-muted-foreground">{t('content.sharedFields')}</p>
            <Field label={t('fields.sectors')}><Input value={content.strategy.sectors.join(', ')} onChange={event => setContent(previous => previous ? ({ ...previous, strategy: { ...previous.strategy, sectors: splitList(event.target.value) } }) : previous)} /></Field>
            <Field label={t('fields.stages')}><Input value={content.strategy.stages.join(', ')} onChange={event => setContent(previous => previous ? ({ ...previous, strategy: { ...previous.strategy, stages: splitList(event.target.value) } }) : previous)} /></Field>
            <Field label={t('fields.geographies')}><Input value={content.strategy.geographies.join(', ')} onChange={event => setContent(previous => previous ? ({ ...previous, strategy: { ...previous.strategy, geographies: splitList(event.target.value) } }) : previous)} /></Field>
            <Field label={t('fields.checkSize')}><Input value={content.strategy.checkSize[locale] ?? ''} onChange={event => setContent(previous => previous ? ({ ...previous, strategy: { ...previous.strategy, checkSize: { ...previous.strategy.checkSize, [locale]: event.target.value } } }) : previous)} /></Field>
            <Field label={t('fields.seoTitle')}><Input value={content.seo.title[locale] ?? ''} onChange={event => setLocalized('seo', 'title', event.target.value)} /></Field>
            <Field label={t('fields.seoDescription')}><Input value={content.seo.description[locale] ?? ''} onChange={event => setLocalized('seo', 'description', event.target.value)} /></Field>
          </div>
        </section>

        <CollectionEditor
          title={t('team.title')}
          addLabel={t('team.add')}
          entries={content.team}
          onAdd={() => setContent(previous => previous ? ({ ...previous, team: [...previous.team, { id: crypto.randomUUID(), name: '' }] }) : previous)}
          onRemove={id => setContent(previous => previous ? ({ ...previous, team: previous.team.filter(item => item.id !== id) }) : previous)}
          render={(person, index) => (
            <div className="grid gap-3 md:grid-cols-2">
              <Input aria-label={t('fields.name')} placeholder={t('fields.name')} value={person.name} onChange={event => updateTeam(index, { ...person, name: event.target.value })} />
              <Input aria-label={t('fields.role')} placeholder={t('fields.role')} value={person.role?.[locale] ?? ''} onChange={event => updateTeam(index, { ...person, role: { ...person.role, [locale]: event.target.value } })} />
              <Textarea className="md:col-span-2" aria-label={t('fields.bio')} placeholder={t('fields.bio')} value={person.bio?.[locale] ?? ''} onChange={event => updateTeam(index, { ...person, bio: { ...person.bio, [locale]: event.target.value } })} />
              <div><Input aria-label={t('fields.image')} placeholder="https://" value={person.imageUrl ?? ''} onChange={event => updateTeam(index, { ...person, imageUrl: event.target.value || undefined })} /><p className="mt-1 text-xs text-muted-foreground">{t('content.assetGuidance')}</p></div>
              <Input aria-label={t('fields.website')} placeholder="https://" value={person.websiteUrl ?? ''} onChange={event => updateTeam(index, { ...person, websiteUrl: event.target.value || undefined })} />
            </div>
          )}
        />

        <CollectionEditor
          title={t('portfolio.title')}
          addLabel={t('portfolio.add')}
          entries={content.portfolio}
          onAdd={() => setContent(previous => previous ? ({ ...previous, portfolio: [...previous.portfolio, { id: crypto.randomUUID(), name: '' }] }) : previous)}
          onRemove={id => setContent(previous => previous ? ({ ...previous, portfolio: previous.portfolio.filter(item => item.id !== id) }) : previous)}
          render={(entry, index) => (
            <div className="grid gap-3 md:grid-cols-2">
              <Input aria-label={t('fields.name')} placeholder={t('fields.name')} value={entry.name} onChange={event => updatePortfolio(index, { ...entry, name: event.target.value })} />
              <Input aria-label={t('fields.website')} placeholder="https://" value={entry.websiteUrl ?? ''} onChange={event => updatePortfolio(index, { ...entry, websiteUrl: event.target.value || undefined })} />
              <div className="md:col-span-2"><Input aria-label={t('fields.logo')} placeholder="https://" value={entry.logoUrl ?? ''} onChange={event => updatePortfolio(index, { ...entry, logoUrl: event.target.value || undefined })} /><p className="mt-1 text-xs text-muted-foreground">{t('content.assetGuidance')}</p></div>
              <Textarea className="md:col-span-2" aria-label={t('fields.description')} placeholder={t('fields.description')} value={entry.description?.[locale] ?? ''} onChange={event => updatePortfolio(index, { ...entry, description: { ...entry.description, [locale]: event.target.value } })} />
            </div>
          )}
        />

        <section className="rounded-xl border bg-card p-4 md:p-6">
          <h2 className="text-lg font-semibold">{t('contact.title')}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label={t('fields.ctaType')}><Select value={content.contact.ctaKind} onValueChange={value => setContent(previous => previous ? ({ ...previous, contact: { ...previous.contact, ctaKind: value as FundPublicSiteContentV1['contact']['ctaKind'] } }) : previous)}><SelectTrigger aria-label={t('fields.ctaType')}><SelectValue /></SelectTrigger><SelectContent>{(['auth', 'portal', 'email', 'website'] as const).map(key => <SelectItem key={key} value={key}>{t(`contact.types.${key}`)}</SelectItem>)}</SelectContent></Select></Field>
            <Field label={t('fields.ctaLabel')}><Input value={content.contact.ctaLabel[locale] ?? ''} onChange={event => setContent(previous => previous ? ({ ...previous, contact: { ...previous.contact, ctaLabel: { ...previous.contact.ctaLabel, [locale]: event.target.value } } }) : previous)} /></Field>
            {content.contact.ctaKind === 'email' && <Field label={t('fields.email')}><Input type="email" value={content.contact.email ?? ''} onChange={event => setContent(previous => previous ? ({ ...previous, contact: { ...previous.contact, email: event.target.value || undefined } }) : previous)} /></Field>}
            {content.contact.ctaKind === 'website' && <Field label={t('fields.website')}><Input placeholder="https://" value={content.contact.websiteUrl ?? ''} onChange={event => setContent(previous => previous ? ({ ...previous, contact: { ...previous.contact, websiteUrl: event.target.value || undefined } }) : previous)} /></Field>}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(content.visibility) as Array<keyof FundPublicSiteContentV1['visibility']>).map(key => (
              <label key={key} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span>{t(`visibility.${key}`)}</span><Switch checked={content.visibility[key]} onCheckedChange={checked => setContent(previous => previous ? ({ ...previous, visibility: { ...previous.visibility, [key]: checked } }) : previous)} /></label>
            ))}
          </div>
        </section>

        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          <div className="text-sm text-muted-foreground">{dirty ? t('saveBeforePreview') : t('savedRevision', { revision: site.draftRevision })}</div>
          <div className="flex flex-wrap gap-2">
            {site.isPublished && <Button variant="outline" disabled={Boolean(busy)} onClick={unpublish}>{busy === 'unpublish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4 rotate-180" />}{t('unpublish')}</Button>}
            <Button variant="outline" disabled={!dirty || Boolean(busy)} onClick={save}>{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{t('saveDraft')}</Button>
            <Button disabled={dirty || Boolean(busy) || (site.isPublished && !site.hasUnpublishedChanges)} onClick={publish}>{busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}{t('publish')}</Button>
          </div>
        </div>
      </div>
    </div>
  )

  function updateTeam(index: number, person: FundPublicSitePerson) {
    setContent(previous => previous ? ({ ...previous, team: previous.team.map((item, itemIndex) => itemIndex === index ? person : item) }) : previous)
  }

  function updatePortfolio(index: number, entry: FundPublicSitePortfolioEntry) {
    setContent(previous => previous ? ({ ...previous, portfolio: previous.portfolio.map((item, itemIndex) => itemIndex === index ? entry : item) }) : previous)
  }
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  const generatedId = React.useId()
  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id: children.props.id ?? generatedId })
    : children
  return <div className={className}><Label htmlFor={generatedId} className="mb-1.5 block">{label}</Label>{control}</div>
}

function CollectionEditor<T extends { id: string }>({ title, addLabel, entries, onAdd, onRemove, render }: { title: string; addLabel: string; entries: T[]; onAdd: () => void; onRemove: (id: string) => void; render: (entry: T, index: number) => React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 md:p-6">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2><Button variant="outline" size="sm" onClick={onAdd}><Plus className="h-4 w-4" />{addLabel}</Button></div>
      <div className="mt-4 space-y-3">
        {entries.map((entry, index) => <div key={entry.id} className="relative rounded-lg border p-3 pr-12">{render(entry, index)}<Button aria-label="Remove" variant="ghost" size="icon" className="absolute right-2 top-2 text-muted-foreground hover:text-destructive" onClick={() => onRemove(entry.id)}><Trash2 className="h-4 w-4" /></Button></div>)}
      </div>
    </section>
  )
}

function splitList(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}
