'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { SearchAdapterDescriptor } from '@/lib/search/adapter-contracts'
import type { SearchCategory, SearchCategoryConfig } from '@/lib/search/categories'

interface CatalogResponse {
  readonly config: SearchCategoryConfig
  readonly adapters: readonly SearchAdapterDescriptor[]
}

export function SearchCategorySettings() {
  const t = useTranslations('Settings.searchCategories')
  const [config, setConfig] = useState<SearchCategoryConfig | null>(null)
  const [adapters, setAdapters] = useState<readonly SearchAdapterDescriptor[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/settings/search-categories', { cache: 'no-store' })
      if (response.ok) {
        const body = await response.json() as CatalogResponse
        setConfig(body.config)
        setAdapters(body.adapters)
        setMessage(null)
      } else setMessage(t('loadError'))
    } catch {
      setMessage(t('loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  const replaceCategory = (id: string, updater: (category: SearchCategory) => SearchCategory) => {
    setConfig(current => current ? Object.freeze({
      ...current,
      categories: Object.freeze(current.categories.map(category => category.id === id ? updater(category) : category)),
    }) : current)
  }

  const move = (index: number, offset: -1 | 1) => {
    setConfig(current => {
      if (!current) return current
      const target = index + offset
      if (target < 0 || target >= current.categories.length) return current
      const categories = current.categories.map((category, position) => (
        position === index ? current.categories[target] : position === target ? current.categories[index] : category
      ))
      return Object.freeze({ ...current, categories: Object.freeze(categories) })
    })
  }

  const add = () => {
    const id = `custom-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
    const adapterId = adapters[0]?.id
    if (!adapterId) return
    const category: SearchCategory = Object.freeze({
      id,
      label: Object.freeze({ en: t('newCategory'), 'zh-CN': t('newCategory') }),
      description: Object.freeze({ en: '', 'zh-CN': '' }),
      enabled: true,
      defaultSelected: false,
      adapterIds: Object.freeze([adapterId]),
    })
    setConfig(current => current ? Object.freeze({
      ...current,
      categories: Object.freeze([...current.categories, category]),
    }) : current)
  }

  const remove = (id: string) => setConfig(current => current ? Object.freeze({
    ...current,
    categories: Object.freeze(current.categories.filter(category => category.id !== id)),
  }) : current)

  const toggleAdapter = (categoryId: string, adapterId: string) => {
    replaceCategory(categoryId, current => {
      const adapterIds = current.adapterIds.includes(adapterId)
        ? current.adapterIds.filter(id => id !== adapterId)
        : [...current.adapterIds, adapterId]
      return Object.freeze({ ...current, adapterIds: Object.freeze(adapterIds) })
    })
  }

  const save = async () => {
    if (!config) return
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/settings/search-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (response.ok) {
        const body = await response.json() as { readonly config: SearchCategoryConfig }
        setConfig(body.config)
        setMessage(t('saved'))
      } else {
        const body = await response.json().catch(() => ({})) as { readonly error?: string }
        setMessage(body.error ?? t('saveError'))
      }
    } catch {
      setMessage(t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('loading')}</div>
  if (!config) return <p className="text-sm text-destructive">{message ?? t('loadError')}</p>

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('description')}</p>
      {config.categories.map((category, index) => (
        <div key={category.id} className="rounded-md border p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <code className="text-xs text-muted-foreground">{category.id}</code>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" aria-label={t('moveUp')} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label={t('moveDown')} disabled={index === config.categories.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label={t('remove')} disabled={config.categories.length === 1} onClick={() => remove(category.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['en', 'zh-CN'] as const).map(locale => (
              <div key={locale} className="space-y-2">
                <Label htmlFor={`${category.id}-${locale}-label`}>{t('label', { locale })}</Label>
                <Input id={`${category.id}-${locale}-label`} value={category.label[locale]} onChange={event => replaceCategory(category.id, current => Object.freeze({ ...current, label: Object.freeze({ ...current.label, [locale]: event.target.value }) }))} />
                <Label htmlFor={`${category.id}-${locale}-description`}>{t('categoryDescription', { locale })}</Label>
                <Input id={`${category.id}-${locale}-description`} value={category.description[locale]} onChange={event => replaceCategory(category.id, current => Object.freeze({ ...current, description: Object.freeze({ ...current.description, [locale]: event.target.value }) }))} />
              </div>
            ))}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('adapters')}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {adapters.map(adapter => (
                <label key={adapter.id} className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={category.adapterIds.includes(adapter.id)} onChange={() => toggleAdapter(category.id, adapter.id)} />
                  {adapter.label}
                </label>
              ))}
              {category.adapterIds
                .filter(adapterId => !adapters.some(adapter => adapter.id === adapterId))
                .map(adapterId => (
                  <label key={adapterId} className="inline-flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                    <input type="checkbox" checked onChange={() => toggleAdapter(category.id, adapterId)} />
                    {t('unavailableAdapter')} ({adapterId})
                  </label>
                ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-5">
            <label className="inline-flex items-center gap-2 text-sm"><Switch checked={category.enabled} onCheckedChange={enabled => replaceCategory(category.id, current => Object.freeze({ ...current, enabled }))} />{t('enabled')}</label>
            <label className="inline-flex items-center gap-2 text-sm"><Switch checked={category.defaultSelected} onCheckedChange={defaultSelected => replaceCategory(category.id, current => Object.freeze({ ...current, defaultSelected }))} />{t('defaultSelected')}</label>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={add}><Plus className="mr-2 h-4 w-4" />{t('add')}</Button>
        <Button type="button" onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('save')}</Button>
        {message && <span role="status" className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </div>
  )
}
