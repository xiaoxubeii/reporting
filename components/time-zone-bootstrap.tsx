'use client'

import { useEffect, useRef } from 'react'
import {
  canonicalizeTimeZone,
  type ResolvedTimeZone,
  type TimeZoneMode,
} from '@/i18n/time-zone'

export type TimeZoneBootstrapProps = Readonly<{
  timeZone: string
  timeZoneSource: ResolvedTimeZone['source']
}>

export type TimeZoneBootstrapDependencies = Readonly<{
  detectTimeZone: () => unknown
  fetch: typeof fetch
  reload: () => void
}>

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

type RemoteTimeZonePreference = Readonly<{
  authenticated: boolean
  manualTimeZone: string | null
}>

function remoteTimeZonePreference(value: unknown): RemoteTimeZonePreference | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const result = value as Record<string, unknown>
  if (typeof result.authenticated !== 'boolean') return null
  if (result.manualTimeZone === null) {
    return Object.freeze({ authenticated: result.authenticated, manualTimeZone: null })
  }
  const manualTimeZone = canonicalizeTimeZone(result.manualTimeZone)
  if (manualTimeZone === null || !result.authenticated) return null
  return Object.freeze({ authenticated: true, manualTimeZone })
}

function confirmedPreferenceChange(
  value: unknown,
  mode: TimeZoneMode,
  timeZone: string,
): boolean | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const result = value as Record<string, unknown>
  if (
    typeof result.changed !== 'boolean' ||
    result.mode !== mode ||
    canonicalizeTimeZone(result.timeZone) !== timeZone
  ) {
    return null
  }

  return result.changed
}

async function writePreference(
  mode: TimeZoneMode,
  timeZone: string,
  renderedTimeZone: string,
  dependencies: TimeZoneBootstrapDependencies,
): Promise<void> {
  const response = await dependencies.fetch('/api/time-zone', {
    body: JSON.stringify({ mode, timeZone }),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    redirect: 'error',
  })
  if (!response.ok) return

  const result = await readJson(response)
  const changed = confirmedPreferenceChange(result, mode, timeZone)
  if (changed === true || (changed === false && renderedTimeZone !== timeZone)) {
    dependencies.reload()
  }
}

export async function synchronizeTimeZone(
  { timeZone, timeZoneSource }: TimeZoneBootstrapProps,
  dependencies: TimeZoneBootstrapDependencies,
): Promise<void> {
  try {
    const manualResponse = await dependencies.fetch('/api/time-zone', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      method: 'GET',
    })
    if (!manualResponse.ok) return

    const remotePreference = remoteTimeZonePreference(await readJson(manualResponse))
    if (remotePreference === null) return
    if (!remotePreference.authenticated && timeZoneSource === 'manual') return
    if (remotePreference.manualTimeZone !== null) {
      if (timeZoneSource === 'manual' && remotePreference.manualTimeZone === timeZone) return
      await writePreference('manual', remotePreference.manualTimeZone, timeZone, dependencies)
      return
    }

    const detectedTimeZone = canonicalizeTimeZone(dependencies.detectTimeZone())
    if (detectedTimeZone === null) return
    if (timeZoneSource === 'auto' && detectedTimeZone === timeZone) return

    await writePreference('auto', detectedTimeZone, timeZone, dependencies)
  } catch {
    // Keep the deterministic server-provided timezone when synchronization fails.
  }
}

export function TimeZoneBootstrap(props: TimeZoneBootstrapProps) {
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    void synchronizeTimeZone(props, {
      detectTimeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      fetch: globalThis.fetch.bind(globalThis),
      reload: () => window.location.reload(),
    })
  }, [props])

  return null
}
