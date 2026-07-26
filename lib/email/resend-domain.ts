import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import type { Database, Json } from '@/lib/types/database'
import { normalizeDnsDomain } from './domain'
import { FundEmailError } from './errors'

export type FundEmailCapabilityStatus = 'pending' | 'verified' | 'failed'

export interface SafeResendDnsRecord {
  record: string
  type: string
  name: string
  value: string
  ttl: string
  status: string
  priority?: number
}

export interface ResendFundDomainInspection {
  providerDomainId: string
  domainStatus: FundEmailCapabilityStatus
  sendingStatus: FundEmailCapabilityStatus
  receivingStatus: FundEmailCapabilityStatus
  dnsRecords: SafeResendDnsRecord[]
  lastErrorCode: string | null
}

interface ResendDomainDependencies {
  listDomains?: (
    apiKey: string,
    options: { limit: number; after?: string },
  ) => Promise<ResendDomainListResponse>
  getDomain?: (apiKey: string, domainId: string) => Promise<ResendDomainDetailResponse>
}

interface ResendDomainListResponse {
  data?: { data?: Array<{ id?: unknown; name?: unknown }>; has_more?: unknown } | null
  error?: unknown
}

interface ResendDomainDetailResponse {
  data?: {
    id?: unknown
    name?: unknown
    status?: unknown
    capabilities?: { sending?: unknown; receiving?: unknown } | null
    records?: unknown
  } | null
  error?: unknown
}

export async function inspectResendFundDomain(
  domainInput: string,
  receivingApiKey: string,
  dependencies: ResendDomainDependencies = {},
): Promise<ResendFundDomainInspection> {
  const domain = normalizeDnsDomain(domainInput)
  const receivingKey = validApiKey(receivingApiKey)
  const listDomains = dependencies.listDomains ?? defaultListDomains
  const getDomain = dependencies.getDomain ?? defaultGetDomain
  const receiving = await inspectCapabilityDomain(
    domain,
    receivingKey,
    listDomains,
    getDomain,
  )

  const sendingEnabled = receiving.detail.capabilities?.sending === 'enabled'
  const receivingEnabled = receiving.detail.capabilities?.receiving === 'enabled'
  const domainStatus = mapDomainStatus(receiving.detail.status)
  // A Resend sending_access key cannot call the Domains API. Keep this pending
  // until an actual provider send succeeds instead of requiring a full-access
  // sending key merely for onboarding.
  const sendingStatus = sendingEnabled && domainStatus !== 'failed' ? 'pending' : 'failed'
  const receivingStatus = receivingEnabled ? domainStatus : 'failed'
  return {
    providerDomainId: receiving.providerDomain.id,
    domainStatus,
    sendingStatus,
    receivingStatus,
    dnsRecords: safeDnsRecords(receiving.detail.records),
    lastErrorCode: !receivingEnabled
      ? 'receiving_disabled'
      : !sendingEnabled
        ? 'sending_disabled'
        : domainStatus === 'failed'
          ? 'domain_verification_failed'
          : null,
  }
}

async function inspectCapabilityDomain(
  domain: string,
  apiKey: string,
  listDomains: NonNullable<ResendDomainDependencies['listDomains']>,
  getDomain: NonNullable<ResendDomainDependencies['getDomain']>,
): Promise<{
  providerDomain: { id: string; name: string }
  detail: NonNullable<ResendDomainDetailResponse['data']>
}> {
  let providerDomain: { id: string; name: string } | null = null
  let after: string | undefined
  for (let page = 0; page < 10; page += 1) {
    let response: ResendDomainListResponse
    try {
      response = await listDomains(apiKey, { limit: 100, ...(after ? { after } : {}) })
    } catch {
      throw verificationUnavailable()
    }
    if (response?.error || !Array.isArray(response?.data?.data)) throw verificationUnavailable()
    const domains = response.data.data as Array<{ id?: unknown; name?: unknown }>
    const exact = domains.find(item => (
      typeof item.name === 'string'
      && item.name.trim().toLowerCase() === domain
      && typeof item.id === 'string'
    ))
    if (exact) {
      providerDomain = { id: exact.id as string, name: exact.name as string }
      break
    }
    if (!response.data.has_more || domains.length === 0) break
    const lastId = domains.at(-1)?.id
    if (typeof lastId !== 'string') throw verificationUnavailable()
    after = lastId
  }
  if (!providerDomain) {
    throw new FundEmailError(
      'invalid_domain',
      `Add the exact domain ${domain} to this Resend account before connecting it.`,
      400,
    )
  }

  let detailResponse: ResendDomainDetailResponse
  try {
    detailResponse = await getDomain(apiKey, providerDomain.id)
  } catch {
    throw verificationUnavailable()
  }
  const detail = detailResponse?.data
  if (
    detailResponse?.error
    || !detail
    || detail.id !== providerDomain.id
    || typeof detail.name !== 'string'
    || detail.name.trim().toLowerCase() !== domain
  ) throw verificationUnavailable()

  return {
    providerDomain,
    detail,
  }
}

export async function persistResendFundDomainInspection(
  admin: SupabaseClient<Database>,
  fundId: string,
  inspection: ResendFundDomainInspection,
): Promise<void> {
  const result = await admin
    .from('fund_email_provider_credentials')
    .update({
      provider_domain_id: inspection.providerDomainId,
      domain_status: inspection.domainStatus,
      sending_status: inspection.sendingStatus,
      receiving_status: inspection.receivingStatus,
      dns_records: inspection.dnsRecords as unknown as Json,
      last_error_code: inspection.lastErrorCode,
      last_verified_at: new Date().toISOString(),
    })
    .eq('fund_id', fundId)
    .eq('provider', 'resend')
    .select('id')
    .maybeSingle()
  if (result.error || !result.data) {
    throw new FundEmailError('storage_unavailable', 'Fund email status could not be saved.', 503)
  }
}

export function mergeResendFundDomainRefresh(
  currentSendingStatus: FundEmailCapabilityStatus,
  inspection: ResendFundDomainInspection,
): ResendFundDomainInspection {
  if (
    currentSendingStatus === 'verified'
    && inspection.domainStatus === 'verified'
    && inspection.sendingStatus === 'pending'
  ) {
    return { ...inspection, sendingStatus: 'verified' }
  }
  return inspection
}

async function defaultListDomains(
  apiKey: string,
  options: { limit: number; after?: string },
): Promise<ResendDomainListResponse> {
  return await new Resend(apiKey).domains.list(options)
}

async function defaultGetDomain(apiKey: string, domainId: string): Promise<ResendDomainDetailResponse> {
  return await new Resend(apiKey).domains.get(domainId)
}

function mapDomainStatus(value: unknown): FundEmailCapabilityStatus {
  if (value === 'verified') return 'verified'
  if (value === 'failed' || value === 'temporary_failure') return 'failed'
  return 'pending'
}

function validApiKey(value: string): string {
  const apiKey = value.trim()
  if (!apiKey || apiKey.length > 512 || /[\r\n\0]/.test(apiKey)) {
    throw new FundEmailError(
      'credential_unavailable',
      'A valid Resend receiving API key is required.',
    )
  }
  return apiKey
}

function safeDnsRecords(input: unknown): SafeResendDnsRecord[] {
  if (!Array.isArray(input)) return []
  return input.slice(0, 20).flatMap((record): SafeResendDnsRecord[] => {
    if (!record || typeof record !== 'object') return []
    const value = record as Record<string, unknown>
    if (![value.record, value.type, value.name, value.value, value.ttl, value.status]
      .every(item => typeof item === 'string' && item.length <= 1024 && !/[\r\n\0]/.test(item))) {
      return []
    }
    return [{
      record: value.record as string,
      type: value.type as string,
      name: value.name as string,
      value: value.value as string,
      ttl: value.ttl as string,
      status: value.status as string,
      ...(Number.isInteger(value.priority) ? { priority: value.priority as number } : {}),
    }]
  })
}

function verificationUnavailable(): FundEmailError {
  return new FundEmailError(
    'credential_unavailable',
    'Resend could not verify this Fund email configuration.',
    400,
  )
}
