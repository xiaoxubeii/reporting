'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminSectionContext, Section } from '@/components/settings/section'

/**
 * Connect a Heartbeat community so new threads in chosen channels become deals.
 *
 * ADMIN ONLY — and the component renders nothing at all for non-admins, because a
 * Heartbeat API key is a community-wide credential that can read every channel.
 * (The Affinity card, by contrast, is open to any member: that key is scoped to
 * the individual's own permissions.) The API enforces this too; hiding the card
 * is just so it isn't dangled at people who'd get a 403.
 *
 * It carries its OWN AdminSectionContext, unlike the cards inside the settings page's
 * admin blocks: this one sits in the shared "External Data" group, right beside the
 * per-user Affinity card. Without the provider it would inherit `false` from there and
 * render as an ordinary member-editable setting — the very confusion the amber border
 * and lock exist to prevent. It is only ever mounted for an admin (see the null return
 * below), so hard-coding `true` here cannot mislead anyone.
 */

interface WatchedChannel {
  channel_id: string
  channel_name: string | null
  webhook_registered: boolean
}

interface Status {
  connected: boolean
  enabled: boolean
  channels: Array<{ id: string; name: string }>
  channels_error?: string | null
  watched: WatchedChannel[]
  last_verified_at: string | null
  last_error: string | null
  imported_count: number
}

export function HeartbeatConnect() {
  const t = useTranslations('Settings.heartbeat')
  const [status, setStatus] = useState<Status | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingChannels, setSavingChannels] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(s => setIsAdmin(!!s?.isAdmin))
      .catch(() => setIsAdmin(false))
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/settings/heartbeat')
      .then(r => (r.ok ? r.json() : null))
      .then((s: Status | null) => {
        if (!s) return
        setStatus(s)
        setSelected(new Set(s.watched.map(w => w.channel_id)))
      })
      .catch(() => {})
  }, [isAdmin])

  async function connect() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? t('connectFailed'))
        return
      }
      setApiKey('')
      await refresh()
    } catch {
      setError(t('unreachable'))
    } finally {
      setSaving(false)
    }
  }

  async function refresh() {
    const res = await fetch('/api/settings/heartbeat')
    if (!res.ok) return
    const s: Status = await res.json()
    setStatus(s)
    setSelected(new Set(s.watched.map(w => w.channel_id)))
  }

  async function saveChannels() {
    if (!status) return
    setSavingChannels(true)
    setError(null)
    try {
      const channels = status.channels
        .filter(c => selected.has(c.id))
        .map(c => ({ channel_id: c.id, channel_name: c.name }))

      const res = await fetch('/api/settings/heartbeat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? t('saveChannelsFailed'))
        return
      }
      await refresh()
    } finally {
      setSavingChannels(false)
    }
  }

  async function setEnabled(next: boolean) {
    if (!status) return
    setStatus({ ...status, enabled: next }) // optimistic
    const res = await fetch('/api/settings/heartbeat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    })
    if (!res.ok) setStatus({ ...status, enabled: !next }) // roll back rather than lie
  }

  async function disconnect() {
    setSaving(true)
    await fetch('/api/settings/heartbeat', { method: 'DELETE' })
    setStatus(null)
    setSelected(new Set())
    setSaving(false)
    await refresh()
  }

  // Not an admin (or we don't know yet) — render nothing.
  if (!isAdmin) return null

  const watchedIds = new Set((status?.watched ?? []).map(w => w.channel_id))
  const dirty =
    selected.size !== watchedIds.size ||
    Array.from(selected).some(id => !watchedIds.has(id))

  return (
    <AdminSectionContext.Provider value={true}>
      <Section title="Heartbeat">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('description')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('keyHelp')}
        </p>

        {!status?.connected ? (
          <div className="flex gap-2">
            <Input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && apiKey.trim()) connect() }}
              placeholder={t('apiKey')}
              autoComplete="off"
            />
            <Button onClick={connect} disabled={saving || !apiKey.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('connect')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>
                {t('connected')}
                {status.imported_count > 0 && (
                  <span className="text-muted-foreground">
                    {' '}— {t('importedCount', { count: status.imported_count })}
                  </span>
                )}
              </span>
            </div>

            {status.last_error && (
              <div className="flex items-start gap-2 text-sm text-amber-600">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{status.last_error} {t('reconnectHelp')}</span>
              </div>
            )}

            {/* Channel picker. Nothing is watched by default, and that is the point:
                a community is a firehose, and turning every thread in #general into a
                deal would bury the real dealflow. */}
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-xs font-medium">{t('channels.title')}</p>

              {status.channels_error ? (
                <p className="text-xs text-amber-600">{status.channels_error}</p>
              ) : status.channels.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('channels.empty')}</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t('channels.help')}
                  </p>
                  <div className="max-h-56 overflow-y-auto space-y-1 pt-1">
                    {status.channels.map(c => (
                      <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={e => {
                            const next = new Set(selected)
                            if (e.target.checked) next.add(c.id)
                            else next.delete(c.id)
                            setSelected(next)
                          }}
                          className="h-3.5 w-3.5"
                        />
                        <span>{c.name}</span>
                      </label>
                    ))}
                  </div>
                  {dirty && (
                    <Button size="sm" onClick={saveChannels} disabled={savingChannels}>
                      {savingChannels ? <Loader2 className="h-4 w-4 animate-spin" /> : t('channels.save')}
                    </Button>
                  )}
                </>
              )}
            </div>

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={status.enabled}
                onChange={e => setEnabled(e.target.checked)}
                className="mt-1 h-3.5 w-3.5"
              />
              <span>
                {t('import.enable')}
                <span className="block text-xs text-muted-foreground">
                  {t('import.help')}
                </span>
              </span>
            </label>

            <div className="flex gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={t('replaceKey')}
                autoComplete="off"
              />
              <Button onClick={connect} disabled={saving || !apiKey.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('update')}
              </Button>
              <Button variant="outline" onClick={disconnect} disabled={saving}>
                {t('disconnect')}
              </Button>
            </div>

            {status.watched.some(w => !w.webhook_registered) && (
              <p className="text-xs text-amber-600">
                {t('webhookWarning')}
              </p>
            )}

            <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
              <p className="text-xs font-medium">{t('how.title')}</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc ml-4">
                <li>{t.rich('how.webhook', { strong: chunks => <strong>{chunks}</strong> })}</li>
                <li>{t.rich('how.sweep', { strong: chunks => <strong>{chunks}</strong> })}</li>
                <li>{t.rich('how.short', { strong: chunks => <strong>{chunks}</strong> })}</li>
              </ul>
            </div>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <p className="text-xs text-muted-foreground">
          {t('generateKeyHelp')}
        </p>
      </div>
      </Section>
    </AdminSectionContext.Provider>
  )
}
