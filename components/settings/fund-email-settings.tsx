'use client'

import { useCallback, useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface DnsRecord {
  record: string
  type: string
  name: string
  value: string
  status: string
  priority?: number
}

interface FundEmailStatus {
  configured: boolean
  isAdmin: boolean
  baseDomain: string
  emailSubdomain: string | null
  domain: string | null
  domainStatus: string | null
  sendingStatus: string | null
  receivingStatus: string | null
  sendingConfigured: boolean
  receivingConfigured: boolean
  webhookConfigured: boolean
  webhookManaged: boolean
  lastVerifiedAt: string | null
  lastErrorCode: string | null
  dnsRecords: DnsRecord[]
  mailbox: {
    localPart: string
    displayName: string
    active: boolean
    address: string | null
  } | null
}

const STATUS_CHANGED_EVENT = 'fund-email-status-changed'

export function FundResendOutboundProviderFields() {
  const t = useTranslations('Settings.fundEmail')
  const { status, loading, loadError } = useFundEmailStatus()

  if (loading) return <LoadingSection />
  if (!status) return <LoadError message={loadError ?? t('errors.load')} />

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <ImmutableDomain status={status} />
      <StatusBadge label={t('sending')} status={status.sendingStatus} statusText={translatedStatus(t, status.sendingStatus)} />
    </div>
  )
}

export function FundResendInboundProviderFields({
  onChanged,
}: {
  onChanged?: () => void
}) {
  const t = useTranslations('Settings.fundEmail')
  const format = useFormatter()
  const { status, loading, loadError, reload } = useFundEmailStatus()
  const [receivingKey, setReceivingKey] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function run(action: string, operation: () => Promise<void>) {
    setBusy(action)
    setError(null)
    setNotice(null)
    try {
      await operation()
    } catch (cause) {
      setError(errorMessage(cause, t('errors.save')))
    } finally {
      setBusy(null)
    }
  }

  async function configureInbound() {
    await run('inbound', async () => {
      await settingsRequest(
        'PATCH',
        {
          action: 'configure_inbound',
          receivingApiKey: receivingKey,
        },
        t('errors.save'),
      )
      setReceivingKey('')
      setNotice(t('inboundConfigured'))
      notifyStatusChanged()
      await reload()
      onChanged?.()
    })
  }

  async function recreateWebhook() {
    await run('webhook', async () => {
      await settingsRequest(
        'PATCH',
        { action: 'recreate_inbound_webhook' },
        t('errors.save'),
      )
      setNotice(t('webhookRecreated'))
      notifyStatusChanged()
      await reload()
    })
  }

  async function refreshStatus() {
    await run('refresh', async () => {
      await settingsRequest(
        'PATCH',
        { action: 'refresh_status' },
        t('errors.save'),
      )
      setNotice(t('statusRefreshed'))
      notifyStatusChanged()
      await reload()
    })
  }

  async function disconnect() {
    if (!window.confirm(t('disconnectConfirm'))) return
    await run('disconnect', async () => {
      await settingsRequest('DELETE', undefined, t('errors.save'))
      setNotice(t('disconnected'))
      notifyStatusChanged()
      await reload()
      onChanged?.()
    })
  }

  if (loading) return <LoadingSection />
  if (!status) return <LoadError message={loadError ?? t('errors.load')} />
  if (!status.isAdmin) return null

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <ImmutableDomain status={status} />
      <div className="space-y-1.5">
        <Label htmlFor="fund-email-receiving-key">{t('receivingKey')}</Label>
        <Input
          id="fund-email-receiving-key"
          type="password"
          autoComplete="off"
          value={receivingKey}
          onChange={(event) => setReceivingKey(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t('receivingKeyHelp')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={configureInbound}
          disabled={busy !== null || !status.emailSubdomain || !receivingKey.trim()}
        >
          {busy === 'inbound' && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {status.receivingConfigured
            ? t('replaceReceivingKey')
            : t('configureReceiving')}
        </Button>
        {status.webhookConfigured && (
          <Button
            variant="outline"
            size="sm"
            onClick={recreateWebhook}
            disabled={busy !== null}
          >
            {busy === 'webhook' && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('recreateWebhook')}
          </Button>
        )}
        {status.receivingConfigured && (
          <Button
            variant="outline"
            size="sm"
            onClick={refreshStatus}
            disabled={busy !== null}
          >
            <RefreshCw
              className={`mr-2 h-3.5 w-3.5 ${busy === 'refresh' ? 'animate-spin' : ''}`}
            />
            {t('refresh')}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge
          label={t('domain')}
          status={status.domainStatus}
          statusText={translatedStatus(t, status.domainStatus)}
        />
        <StatusBadge
          label={t('receiving')}
          status={status.receivingStatus}
          statusText={translatedStatus(t, status.receivingStatus)}
        />
        <span className="rounded-full bg-muted px-2 py-1 text-xs">
          {status.webhookManaged
            ? t('webhookManaged')
            : status.webhookConfigured
              ? t('webhookLegacy')
              : t('webhookMissing')}
        </span>
      </div>
      {status.lastVerifiedAt && (
        <p className="text-xs text-muted-foreground">
          {t('lastVerified', {
            date: format.dateTime(new Date(status.lastVerifiedAt), { dateStyle: 'medium', timeStyle: 'short' }),
          })}
        </p>
      )}
      {status.lastErrorCode && (
        <p className="text-xs text-destructive">
          {t('lastError', { code: status.lastErrorCode })}
        </p>
      )}
      <DnsRecords records={status.dnsRecords} t={t} />
      {status.receivingConfigured && (
        <div className="border-t pt-4">
          <Button
            variant="destructive"
            size="sm"
            onClick={disconnect}
            disabled={busy !== null}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            {t('disconnect')}
          </Button>
        </div>
      )}
      <Feedback notice={notice} error={error} />
    </div>
  )
}

function useFundEmailStatus() {
  const t = useTranslations('Settings.fundEmail')
  const [status, setStatus] = useState<FundEmailStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/fund-email', {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error()
      setStatus((await response.json()) as FundEmailStatus)
      setLoadError(null)
    } catch {
      setLoadError(t('errors.load'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void reload()
    const listener = () => {
      void reload()
    }
    window.addEventListener(STATUS_CHANGED_EVENT, listener)
    return () => window.removeEventListener(STATUS_CHANGED_EVENT, listener)
  }, [reload])

  return { status, loading, loadError, reload }
}

async function settingsRequest(
  method: string,
  body: Record<string, unknown> | undefined,
  fallbackMessage: string,
): Promise<Record<string, unknown>> {
  const response = await fetch('/api/settings/fund-email', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (!response.ok)
    throw new Error(
      typeof result.error === 'string' ? result.error : fallbackMessage,
    )
  return result
}

function notifyStatusChanged(): void {
  window.dispatchEvent(new Event(STATUS_CHANGED_EVENT))
}

function ImmutableDomain({ status }: { status: FundEmailStatus }) {
  const t = useTranslations('Settings.fundEmail')
  return (
    <div className="space-y-1.5">
      <Label>{t('immutableDomain')}</Label>
      <Input value={status.domain ?? ''} readOnly />
      <p className="text-xs text-muted-foreground">{t('immutableDomainHelp')}</p>
    </div>
  )
}

function DnsRecords({
  records,
  t,
}: {
  records: DnsRecord[]
  t: ReturnType<typeof useTranslations<'Settings.fundEmail'>>
}) {
  if (records.length === 0) return null
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{t('dnsTitle')}</h3>
      <div className="space-y-2">
        {records.map((record, index) => (
          <div
            key={`${record.name}-${record.type}-${index}`}
            className="grid gap-1 rounded-md border p-2 text-xs sm:grid-cols-[70px_1fr_auto]"
          >
            <span className="font-medium">{record.type}</span>
            <span className="min-w-0 break-all text-muted-foreground">
              {record.name} → {record.value}
              {record.priority !== undefined ? ` (${record.priority})` : ''}
            </span>
            <span>{translatedStatus(t, record.status)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusBadge({
  label,
  status,
  statusText,
}: {
  label: string
  status: string | null
  statusText: string
}) {
  const tone =
    status === 'verified'
      ? 'bg-green-500/10 text-green-700'
      : status === 'failed'
        ? 'bg-destructive/10 text-destructive'
        : 'bg-amber-500/10 text-amber-700'
  return (
    <span className={`rounded-full px-2 py-1 text-xs ${tone}`}>
      {label}: {statusText}
    </span>
  )
}

function translatedStatus(
  t: ReturnType<typeof useTranslations<'Settings.fundEmail'>>,
  status: string | null,
): string {
  if (status === 'verified') return t('statuses.verified')
  if (status === 'pending') return t('statuses.pending')
  if (status === 'failed') return t('statuses.failed')
  return t('statuses.unknown')
}

function Feedback({
  notice,
  error,
}: {
  notice: string | null
  error: string | null
}) {
  return (
    <>
      {notice && (
        <div className="mt-4 flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          {notice}
        </div>
      )}
      {error && (
        <div className="mt-4 flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </>
  )
}

function LoadingSection() {
  return <div className="h-32 animate-pulse rounded-lg bg-muted" />
}

function LoadError({ message }: { message: string }) {
  return <p className="text-sm text-destructive">{message}</p>
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}
