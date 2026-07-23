'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Connect an Affinity API key.
 *
 * This is PER USER, not per fund — Affinity issues one key per person and scopes
 * it to what that person can see. That's a feature, not a limitation: the
 * assistant and the sync can never surface CRM records the user couldn't open
 * themselves. The notes they import still land in the shared data room.
 */

interface Status {
  connected: boolean
  affinity_user_email: string | null
  affinity_user_name: string | null
  last_verified_at: string | null
  last_error: string | null
}

export function AffinityConnect() {
  const t = useTranslations('Settings.affinity')
  const [status, setStatus] = useState<Status | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The assistant's Affinity transport is a FUND setting, so it rides on /api/settings
  // rather than the per-user key endpoint, and only an admin may change it.
  const [isAdmin, setIsAdmin] = useState(false)
  const [mcpEnabled, setMcpEnabled] = useState(false)
  const [savingMcp, setSavingMcp] = useState(false)

  useEffect(() => {
    fetch('/api/settings/affinity')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false, affinity_user_email: null, affinity_user_name: null, last_verified_at: null, last_error: null }))

    fetch('/api/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(s => {
        if (!s) return
        setIsAdmin(!!s.isAdmin)
        setMcpEnabled(!!s.affinityMcpEnabled)
      })
      .catch(() => {})
  }, [])

  async function setMcp(next: boolean) {
    setSavingMcp(true)
    setMcpEnabled(next) // optimistic
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ affinityMcpEnabled: next }),
    })
    if (!res.ok) setMcpEnabled(!next) // roll back rather than lie about the state
    setSavingMcp(false)
  }

  async function connect() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/affinity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? t('connectFailed'))
        return
      }
      setStatus({
        connected: true,
        affinity_user_email: body.affinity_user_email,
        affinity_user_name: body.affinity_user_name,
        last_verified_at: new Date().toISOString(),
        last_error: null,
      })
      setApiKey('')
    } catch {
      setError(t('unreachable'))
    } finally {
      setSaving(false)
    }
  }

  async function disconnect() {
    setSaving(true)
    await fetch('/api/settings/affinity', { method: 'DELETE' })
    setStatus({ connected: false, affinity_user_email: null, affinity_user_name: null, last_verified_at: null, last_error: null })
    setSaving(false)
  }

  if (!status) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Affinity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('description')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('keyHelp')}
        </p>

        {status.connected ? (
          <>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>
                {t('connectedAs', { account: status.affinity_user_name ?? status.affinity_user_email ?? t('yourAccount') })}
                {status.affinity_user_name && status.affinity_user_email && (
                  <span className="text-muted-foreground"> ({status.affinity_user_email})</span>
                )}
              </span>
            </div>

            {status.last_error && (
              <div className="flex items-start gap-2 text-sm text-amber-600">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{status.last_error} {t('reconnectHelp')}</span>
              </div>
            )}

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
          </>
        ) : (
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
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <p className="text-xs text-muted-foreground">
          {t('generateKeyHelp')}
        </p>

        {/* How the sync actually behaves. It was doing all of this already and saying none
            of it, so nobody could tell whether they had to press anything. */}
        {status.connected && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
            <p className="text-xs font-medium">{t('sync.title')}</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc ml-4">
              <li>{t.rich('sync.link', { strong: chunks => <strong>{chunks}</strong> })}</li>
              <li>{t.rich('sync.hourly', { strong: chunks => <strong>{chunks}</strong> })}</li>
              <li>{t.rich('sync.now', { strong: chunks => <strong>{chunks}</strong> })}</li>
            </ul>
          </div>
        )}

        {/* The assistant's Affinity transport. This flag existed and was read by the
            diligence chat, but nothing could ever set it — so the MCP path was dead code. */}
        {status.connected && isAdmin && (
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={mcpEnabled}
              onChange={e => setMcp(e.target.checked)}
              disabled={savingMcp}
              className="mt-1 h-3.5 w-3.5"
            />
            <span>
              {t('assistant.enable')}
              <span className="block text-xs text-muted-foreground">
                {t('assistant.help')}
              </span>
            </span>
            {savingMcp && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
          </label>
        )}
      </CardContent>
    </Card>
  )
}
