'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function PersonalNotificationPreferences() {
  const t = useTranslations('Settings.page.notifications')
  const [level, setLevel] = useState('mentions')
  const [subscribedIds, setSubscribedIds] = useState<string[]>([])
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/notifications').then(response => response.json()),
      fetch('/api/companies').then(response => response.json()),
    ]).then(([preferences, companyRows]) => {
      if (preferences.level) setLevel(preferences.level)
      if (preferences.subscribedCompanyIds) setSubscribedIds(preferences.subscribedCompanyIds)
      if (Array.isArray(companyRows)) {
        setCompanies(companyRows
          .map((company: { id: string; name: string }) => ({ id: company.id, name: company.name }))
          .sort((left, right) => left.name.localeCompare(right.name)))
      }
    }).finally(() => setLoading(false))
  }, [])

  async function save(nextLevel: string, nextSubscribedIds?: string[]) {
    setSaving(true)
    const body: Record<string, unknown> = { level: nextLevel }
    if (nextSubscribedIds !== undefined) body.subscribedCompanyIds = nextSubscribedIds
    const response = await fetch('/api/settings/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (response.ok) {
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    }
  }

  function changeLevel(nextLevel: string) {
    setLevel(nextLevel)
    void save(nextLevel)
  }

  function toggleCompany(companyId: string) {
    const next = subscribedIds.includes(companyId)
      ? subscribedIds.filter(id => id !== companyId)
      : [...subscribedIds, companyId]
    setSubscribedIds(next)
    void save(level, next)
  }

  const options = ['all', 'mentions', 'none'] as const
  return (
    <Card className="shadow-sm">
      <CardHeader><CardTitle className="text-base">{t('title')}</CardTitle><CardDescription>{t('description')}</CardDescription></CardHeader>
      <CardContent>
        {loading ? <div className="h-16 animate-pulse rounded bg-muted" /> : (
          <div className="space-y-2">
            {options.map(option => (
              <label key={option} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${level === option ? 'border-foreground/30 bg-accent/50' : 'hover:bg-accent/30'}`}>
                <input type="radio" name="note-notification-level-personal" value={option} checked={level === option} onChange={() => changeLevel(option)} className="mt-0.5" />
                <span><span className="text-sm font-medium">{t(`options.${option}.label`)}</span><span className="mt-0.5 block text-xs text-muted-foreground">{t(`options.${option}.description`)}</span></span>
              </label>
            ))}
            {level === 'mentions' && companies.length > 0 && (
              <div className="mt-3 border-t pt-3"><p className="text-xs font-medium">{t('followCompanies')}</p><p className="mb-2 mt-1 text-xs text-muted-foreground">{t('followHelp')}</p><div className="max-h-48 space-y-1 overflow-y-auto">{companies.map(company => <label key={company.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-accent/30"><input type="checkbox" checked={subscribedIds.includes(company.id)} onChange={() => toggleCompany(company.id)} /><span className="text-sm">{company.name}</span></label>)}</div></div>
            )}
            {(saving || saved) && <p className={`pt-1 text-xs ${saved ? 'text-emerald-600' : 'text-muted-foreground'}`}>{saved ? t('saved') : t('saving')}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
