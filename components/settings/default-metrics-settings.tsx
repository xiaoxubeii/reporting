'use client'

// Fund-wide default metric profile: metrics an admin defines once that get seeded into every
// portfolio company (existing companies via "Sync"/on-create; new companies automatically at
// creation). Templates are seed-only — editing or removing one here never touches metrics already
// copied into a company. Dedup on apply is by slug, so a company already tracking a slug is skipped.

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Plus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SettingsCard, SettingsCardGrid } from '@/components/settings-card'
import { MetricForm } from '@/components/metric-form'

interface DefaultMetric {
  id: string
  name: string
  slug: string
  description: string | null
  unit: string | null
  unit_position: 'prefix' | 'suffix' | string | null
  value_type: 'number' | 'currency' | 'percentage' | 'text' | string | null
  reporting_cadence: 'quarterly' | 'monthly' | 'annual' | string | null
  display_order: number | null
  is_active: boolean | null
  currency: string | null
}

const ENDPOINTS = {
  create: '/api/default-metrics',
  update: (id: string) => `/api/default-metrics/${id}`,
}

export function DefaultMetricsSettings() {
  const t = useTranslations('Settings.defaultMetrics')
  const [metrics, setMetrics] = useState<DefaultMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<DefaultMetric | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/default-metrics')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setMetrics(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  function flash(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(null), 5000)
  }

  async function remove(id: string) {
    setMetrics(prev => prev.filter(m => m.id !== id)) // optimistic
    await fetch(`/api/default-metrics/${id}`, { method: 'DELETE' })
  }

  async function sync() {
    setSyncing(true)
    const res = await fetch('/api/default-metrics/apply', { method: 'POST' })
    setSyncing(false)
    if (res.ok) {
      const { inserted, companies } = await res.json()
      flash(inserted === 0
        ? t('allUpToDate', { companies })
        : t('metricsAdded', { inserted, companies }))
    } else {
      flash(t('syncFailed'))
    }
  }

  return (
    <>
      <p className="mb-4 text-xs text-muted-foreground">
        {t.rich('description', { strong: chunks => <strong>{chunks}</strong> })}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('loading')}
        </div>
      ) : metrics.length === 0 ? (
        <div className="rounded-md border px-3 py-4 text-xs text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <SettingsCardGrid>
          {metrics.map(m => (
            <SettingsCard
              key={m.id}
              muted={m.is_active === false}
              title={m.name}
              subtitle={
                <span className="font-mono">
                  {m.slug}
                  {m.unit ? ` · ${m.unit}` : ''}
                  {m.value_type && m.value_type !== 'number' ? ` · ${m.value_type}` : ''}
                </span>
              }
              aside={
                <>
                  <button onClick={() => setEditing(m)} className="text-xs text-muted-foreground hover:text-foreground">{t('edit')}</button>
                  <button onClick={() => remove(m.id)} className="text-xs text-muted-foreground hover:text-destructive">{t('remove')}</button>
                </>
              }
            >
              {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
            </SettingsCard>
          ))}
        </SettingsCardGrid>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> {t('addMetric')}
        </Button>
        {metrics.length > 0 && (
          <Button variant="ghost" size="sm" onClick={sync} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
            {t('syncAll')}
          </Button>
        )}
        {notice && <span className="text-xs text-muted-foreground">{notice}</span>}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('addDialog.title')}</DialogTitle>
            <DialogDescription>{t('addDialog.description')}</DialogDescription>
          </DialogHeader>
          <MetricForm
            endpoints={ENDPOINTS}
            submitLabel={t('addDialog.submit')}
            onSuccess={data => {
              setAddOpen(false)
              load()
              const applied = (data as typeof data & {
                applied?: { inserted: number; companies: number }
              }).applied
              if (applied) {
                flash(applied.inserted === 0
                  ? t('addedProfileOnly', { companies: applied.companies })
                  : t('addedCompanies', { inserted: applied.inserted, companies: applied.companies }))
              }
            }}
            onCancel={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('editDialog.title')}</DialogTitle>
            <DialogDescription>{t('editDialog.description')}</DialogDescription>
          </DialogHeader>
          {editing && (
            <MetricForm
              endpoints={ENDPOINTS}
              metric={editing}
              onSuccess={() => { setEditing(null); load() }}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
