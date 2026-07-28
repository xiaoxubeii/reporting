import { createHmac, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import { decrypt, encrypt } from '@/lib/crypto'
import {
  saveFundEmailIdentity,
  saveFundEmailReceivingConfiguration,
  saveFundEmailSendingConfiguration,
} from '@/lib/email/fund-credentials'
import type { Database } from '@/lib/types/database'

type Admin = SupabaseClient<Database>

export interface LocalResendFixture {
  readonly apiKey: string
  readonly baseUrl: string
  readonly controlUrl: string
  readonly controlToken: string
}

export interface ConfiguredFundMailFixture extends LocalResendFixture {
  readonly domain: string
  readonly routeToken: string
  readonly webhookSecret: string
}

export function readLocalResendFixture(
  env: Readonly<Record<string, string | undefined>> = process.env,
): LocalResendFixture {
  const apiKey = env.E2E_RESEND_API_KEY?.trim()
  const rawBaseUrl = env.RESEND_BASE_URL?.trim()
  const rawControlUrl = env.E2E_RESEND_CONTROL_URL?.trim()
  const controlToken = env.E2E_RESEND_CONTROL_TOKEN?.trim()
  if (!apiKey || !rawBaseUrl || !rawControlUrl || !controlToken) {
    throw new Error('Local Resend E2E provider is required')
  }
  let baseUrl: URL
  let controlUrl: URL
  try {
    baseUrl = new URL(rawBaseUrl)
    controlUrl = new URL(rawControlUrl)
  } catch {
    throw new Error('Local Resend E2E provider URLs are invalid')
  }
  const local = ['127.0.0.1', 'localhost'].includes(baseUrl.hostname)
  if (
    !local
    || baseUrl.protocol !== 'http:'
    || controlUrl.origin !== baseUrl.origin
    || !controlUrl.pathname.startsWith('/__e2e')
  ) {
    throw new Error('Local Resend E2E provider must use the same localhost origin')
  }
  return Object.freeze({
    apiKey,
    baseUrl: baseUrl.toString().replace(/\/$/, ''),
    controlUrl: controlUrl.toString().replace(/\/$/, ''),
    controlToken,
  })
}

export async function configureLocalFundMail(params: {
  readonly admin: Admin
  readonly fundId: string
  readonly userId: string
  readonly slug: string
}): Promise<ConfiguredFundMailFixture> {
  const provider = readLocalResendFixture()
  const webhookSecret = `whsec_${randomBytes(32).toString('base64')}`
  const identity = await saveFundEmailIdentity(params.admin, {
    fundId: params.fundId,
    actorUserId: params.userId,
    slug: params.slug,
  })
  await saveFundEmailSendingConfiguration(params.admin, {
    fundId: params.fundId,
    actorUserId: params.userId,
    slug: params.slug,
    sendingApiKey: provider.apiKey,
  })

  const keyEnvelope = await params.admin
    .from('fund_settings')
    .select('encryption_key_encrypted')
    .eq('fund_id', params.fundId)
    .maybeSingle()
  const kek = process.env.ENCRYPTION_KEY?.trim()
  if (keyEnvelope.error || !keyEnvelope.data?.encryption_key_encrypted || !kek) {
    throw new Error('Disposable Fund mail encryption is unavailable')
  }
  const dek = decrypt(keyEnvelope.data.encryption_key_encrypted, kek)
  const settings: Database['public']['Tables']['fund_settings']['Update'] = {
    asks_email_provider: 'resend',
    outbound_email_provider: 'resend',
    inbound_email_provider: 'resend',
    resend_api_key_encrypted: encrypt(provider.apiKey, dek),
    system_email_from_name: 'Reporting E2E Fund',
    system_email_from_address: `system@${identity.domain}`,
  }
  const selected = await params.admin
    .from('fund_settings')
    .update(settings)
    .eq('fund_id', params.fundId)
    .select('fund_id')
    .maybeSingle()
  if (selected.error || !selected.data) throw new Error('Could not select the disposable Fund mail provider')

  const routeToken = randomBytes(32).toString('base64url')
  await saveFundEmailReceivingConfiguration(params.admin, {
    fundId: params.fundId,
    actorUserId: params.userId,
    slug: params.slug,
    receivingApiKey: provider.apiKey,
    webhookSecret,
    routeToken,
    providerWebhookId: `webhook_e2e_${params.fundId.slice(0, 8)}`,
    expectedProviderWebhookId: null,
    expectedUpdatedAt: null,
    inspection: {
      providerDomainId: `domain_e2e_${params.fundId.slice(0, 8)}`,
      domainStatus: 'verified',
      sendingStatus: 'verified',
      receivingStatus: 'verified',
      dnsRecords: [],
      lastErrorCode: null,
    },
  })

  return Object.freeze({
    ...provider,
    domain: identity.domain,
    routeToken,
    webhookSecret,
  })
}

export function signResendWebhook(input: {
  readonly id: string
  readonly timestamp: number
  readonly body: string
  readonly webhookSecret: string
}): string {
  if (!Number.isSafeInteger(input.timestamp) || input.timestamp <= 0) throw new Error('Invalid webhook timestamp')
  if (!input.webhookSecret.startsWith('whsec_')) throw new Error('Invalid webhook secret')
  const key = Buffer.from(input.webhookSecret.slice('whsec_'.length), 'base64')
  if (key.length < 16) throw new Error('Invalid webhook secret')
  const signature = createHmac('sha256', key)
    .update(`${input.id}.${input.timestamp}.${input.body}`, 'utf8')
    .digest('base64')
  return `v1,${signature}`
}
