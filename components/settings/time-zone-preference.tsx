'use client'

import React, { useId, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { canonicalizeTimeZone, DEFAULT_TIME_ZONE, type TimeZoneMode } from '@/i18n/time-zone'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type TimeZonePreferenceDependencies = Readonly<{
  detectTimeZone: () => unknown
  fetch: typeof fetch
  reload: () => void
  supportedTimeZones: () => readonly string[]
}>

type TimeZonePreferenceProps = Readonly<{
  timeZone: string | null
  dependencies?: TimeZonePreferenceDependencies
}>

const browserDependencies: TimeZonePreferenceDependencies = Object.freeze({
  detectTimeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
  reload: () => window.location.reload(),
  supportedTimeZones: () => {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }
    return intl.supportedValuesOf?.('timeZone') ?? []
  },
})

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function hasConfirmedProfile(value: unknown, timeZone: string | null): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const profile = (value as Record<string, unknown>).profile
  if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) return false
  return (profile as Record<string, unknown>).timeZone === timeZone
}

function hasConfirmedCookie(value: unknown, mode: TimeZoneMode, timeZone: string): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  return result.mode === mode && canonicalizeTimeZone(result.timeZone) === timeZone
}

export function TimeZonePreference({ timeZone, dependencies = browserDependencies }: TimeZonePreferenceProps) {
  const t = useTranslations('SettingsIdentity.personal.preferences.timeZone')
  const datalistId = useId()
  const initialTimeZone = canonicalizeTimeZone(timeZone)
  const [mode, setMode] = useState<TimeZoneMode>(initialTimeZone === null ? 'auto' : 'manual')
  const [manualTimeZone, setManualTimeZone] = useState(initialTimeZone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const detectedTimeZone = useMemo(
    () => canonicalizeTimeZone(dependencies.detectTimeZone()) ?? DEFAULT_TIME_ZONE,
    [dependencies],
  )
  const choices = useMemo(() => {
    let supported: readonly string[] = []
    try {
      supported = dependencies.supportedTimeZones()
    } catch {
      supported = []
    }
    return Array.from(new Set([
      ...supported.map(value => canonicalizeTimeZone(value)).filter((value): value is string => value !== null),
      DEFAULT_TIME_ZONE,
      ...(initialTimeZone === null ? [] : [initialTimeZone]),
      detectedTimeZone,
    ])).sort()
  }, [dependencies, detectedTimeZone, initialTimeZone])

  async function savePreference() {
    const selectedTimeZone = mode === 'manual' ? canonicalizeTimeZone(manualTimeZone) : detectedTimeZone
    if (selectedTimeZone === null) {
      setError(t('invalid'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const profileTimeZone = mode === 'manual' ? selectedTimeZone : null
      const profileResponse = await dependencies.fetch('/api/settings/personal', {
        body: JSON.stringify({ timeZone: profileTimeZone }),
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
        redirect: 'error',
      })
      if (!profileResponse.ok || !hasConfirmedProfile(await readJson(profileResponse), profileTimeZone)) {
        throw new Error('Profile update failed')
      }
      const cookieResponse = await dependencies.fetch('/api/time-zone', {
        body: JSON.stringify({ mode, timeZone: selectedTimeZone }),
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        redirect: 'error',
      })
      if (!cookieResponse.ok || !hasConfirmedCookie(await readJson(cookieResponse), mode, selectedTimeZone)) {
        throw new Error('Cookie update failed')
      }
      dependencies.reload()
    } catch {
      setError(t('saveError'))
      setSaving(false)
    }
  }

  return (
    <form className="space-y-3 rounded-lg border p-3 sm:col-span-2" onSubmit={event => { event.preventDefault(); void savePreference() }}>
      <fieldset className="space-y-3" disabled={saving}>
        <legend className="text-xs font-medium text-muted-foreground">{t('label')}</legend>
        <p className="text-xs leading-5 text-muted-foreground">{t('help', { detected: detectedTimeZone })}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <input checked={mode === 'auto'} name="time-zone-mode" onChange={() => setMode('auto')} type="radio" value="auto" />
            {t('automatic')}
          </label>
          <div className="min-w-0 flex-1 space-y-2">
            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <input checked={mode === 'manual'} name="time-zone-mode" onChange={() => setMode('manual')} type="radio" value="manual" />
              {t('manual')}
            </label>
            <Label className="sr-only" htmlFor="personal-time-zone">{t('manual')}</Label>
            <Input aria-describedby="personal-time-zone-help" disabled={mode !== 'manual' || saving} id="personal-time-zone" list={datalistId} onChange={event => setManualTimeZone(event.target.value)} placeholder={t('placeholder')} value={manualTimeZone} />
            <datalist id={datalistId}>{choices.map(value => <option key={value} value={value} />)}</datalist>
            <p id="personal-time-zone-help" className="text-xs leading-5 text-muted-foreground">{t('manualHelp')}</p>
          </div>
        </div>
      </fieldset>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button type="submit" size="sm" disabled={saving}>{saving && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}{t('save')}</Button>
    </form>
  )
}
