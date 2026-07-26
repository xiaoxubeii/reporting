import { createHash, createHmac } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from '@/lib/crypto'
import type { Database } from '@/lib/types/database'
import {
  getOutboundConfig,
  sendOutboundEmail,
  type EmailParams,
  type OutboundConfig,
} from '@/lib/email'
import {
  assertSafeEmailHeader,
  formatFundSender,
  normalizeDnsDomain,
} from './domain'
import { FundEmailError } from './errors'
import {
  loadReadyFundEmailIdentity,
  loadReadyFundEmailSendingConnection,
  type FundEmailConnection,
  type FundEmailIdentityConnection,
  type FundEmailSendingConnection,
} from './fund-credentials'
import {
  resolveFundSenderMailbox,
  type FundEmailMailbox,
  type SharedMailboxKind,
} from './mailboxes'

type Admin = SupabaseClient<Database>

export type FundEmailPurpose =
  | 'general'
  | 'pitch'
  | 'expert_invitation'
  | 'system'
export type FundEmailContextType = 'inbound_deal' | 'diligence_expert_request'

export interface PrepareFundOutboundMessageInput {
  fundId: string
  mailboxId: string
  purpose: FundEmailPurpose
  contextType: FundEmailContextType | null
  contextId: string | null
  externalParticipantAddress: string
  subject: string
  fromAddress: string
  toAddresses: string[]
  ccAddresses: string[]
  bccAddresses: string[]
  textBody: string | null
  htmlBodyUntrusted: string
  internetMessageId: string
  replyTokenHash: string
  idempotencyKey: string
}

export interface PreparedFundOutboundMessage {
  threadId: string
  messageId: string
  internetMessageId: string
  idempotencyKey: string
  providerMessageId: string | null
  priorInternetMessageIds: string[]
}

export interface FundEmailOutboundStore {
  prepare(
    input: PrepareFundOutboundMessageInput,
  ): Promise<PreparedFundOutboundMessage>
  markSubmitted(input: {
    fundId: string
    connectionId: string
    messageId: string
    providerMessageId: string
  }): Promise<void>
  markFailed(input: { fundId: string; messageId: string }): Promise<void>
}

export interface SendFundThreadEmailParams {
  fundId: string
  actorUserId: string
  operationId: string
  fallbackMailbox: SharedMailboxKind
  purpose: FundEmailPurpose
  contextType?: FundEmailContextType
  contextId?: string
  to: string
  cc?: string
  bcc?: string
  subject: string
  html: string
  text?: string
}

interface FundOutboundDependencies {
  store?: FundEmailOutboundStore
  loadConnection?: (
    admin: Admin,
    fundId: string,
  ) => Promise<FundEmailConnection | null>
  resolveMailbox?: (
    admin: Admin,
    params: { fundId: string; userId: string; fallback: SharedMailboxKind },
  ) => Promise<FundEmailMailbox>
  send?: (
    config: OutboundConfig,
    params: EmailParams,
  ) => Promise<{ id?: string }>
  replyTokenSecret?: string
}

interface FundOutboundProviderDependencies {
  loadIdentity?: (
    admin: Admin,
    fundId: string,
  ) => Promise<FundEmailIdentityConnection | null>
  loadProviderConfig?: (
    admin: Admin,
    fundId: string,
    purpose: 'asks',
  ) => Promise<OutboundConfig | null>
  loadLegacyConnection?: (
    admin: Admin,
    fundId: string,
  ) => Promise<FundEmailSendingConnection | null>
  loadSelectedProvider?: (
    admin: Admin,
    fundId: string,
  ) => Promise<string | null>
  promoteLegacyKey?: (
    admin: Admin,
    fundId: string,
    sendingApiKey: string,
    expectedCiphertext: string,
  ) => Promise<boolean>
}

export interface SendFundThreadEmailResult {
  id: string
  threadId: string
  messageId: string
  reused: boolean
}

export async function loadFundEmailOutboundProviderConnection(
  admin: Admin,
  fundId: string,
  dependencies: FundOutboundProviderDependencies = {},
): Promise<FundEmailSendingConnection | null> {
  const loadProviderConfig =
    dependencies.loadProviderConfig ?? getOutboundConfig
  const providerConfig = await loadProviderConfig(admin, fundId, 'asks')
  if (providerConfig && providerConfig.provider !== 'resend') return null

  if (providerConfig?.provider === 'resend' && providerConfig.apiKey) {
    const identity = await (
      dependencies.loadIdentity ?? loadReadyFundEmailIdentity
    )(admin, fundId)
    if (!identity) return null
    return { ...identity, sendingApiKey: providerConfig.apiKey }
  }

  const selectedProvider = providerConfig?.provider ?? await (
    dependencies.loadSelectedProvider ?? loadSelectedFundAsksProvider
  )(admin, fundId)
  if (selectedProvider !== 'resend') return null

  const legacyConnection = await (
    dependencies.loadLegacyConnection ?? loadReadyFundEmailSendingConnection
  )(admin, fundId)
  if (
    !legacyConnection ||
    legacyConnection.fundId !== fundId ||
    !legacyConnection.sendingApiKeyEncrypted
  ) return null

  const promoted = await (
    dependencies.promoteLegacyKey ?? promoteLegacyFundResendKey
  )(
    admin,
    fundId,
    legacyConnection.sendingApiKey,
    legacyConnection.sendingApiKeyEncrypted,
  )
  return promoted ? legacyConnection : null
}

async function loadSelectedFundAsksProvider(
  admin: Admin,
  fundId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('fund_settings')
    .select('asks_email_provider')
    .eq('fund_id', fundId)
    .maybeSingle()
  if (error) return null
  return data?.asks_email_provider ?? null
}

async function promoteLegacyFundResendKey(
  admin: Admin,
  fundId: string,
  sendingApiKey: string,
  expectedCiphertext: string,
): Promise<boolean> {
  const kek = process.env.ENCRYPTION_KEY
  if (!kek) return false

  const { data: settings, error: settingsError } = await admin
    .from('fund_settings')
    .select('encryption_key_encrypted')
    .eq('fund_id', fundId)
    .maybeSingle()
  if (settingsError || !settings?.encryption_key_encrypted) return false

  let authoritativeCiphertext: string
  try {
    const dek = decrypt(settings.encryption_key_encrypted, kek)
    authoritativeCiphertext = encrypt(sendingApiKey, dek)
  } catch {
    return false
  }

  const { data, error } = await admin.rpc(
    'fund_email_promote_legacy_resend_key',
    {
      p_fund_id: fundId,
      p_resend_api_key_encrypted: authoritativeCiphertext,
      p_expected_sending_api_key_encrypted: expectedCiphertext,
    },
  )
  return !error && data === true
}

export async function sendFundThreadEmail(
  admin: SupabaseClient<Database>,
  params: SendFundThreadEmailParams,
  dependencies: FundOutboundDependencies = {},
): Promise<SendFundThreadEmailResult> {
  const connection = await (
    dependencies.loadConnection ?? loadFundEmailOutboundProviderConnection
  )(admin, params.fundId)
  if (!connection || connection.fundId !== params.fundId) {
    throw new FundEmailError(
      'connection_not_found',
      'Fund email is not configured.',
      503,
    )
  }

  const mailbox = await (
    dependencies.resolveMailbox ?? resolveFundSenderMailbox
  )(admin, {
    fundId: params.fundId,
    userId: params.actorUserId,
    fallback: params.fallbackMailbox,
  })
  if (!mailbox.active || mailbox.fundId !== params.fundId) {
    throw new FundEmailError(
      'invalid_mailbox',
      'Fund sender mailbox is unavailable.',
      403,
    )
  }

  const domain = normalizeDnsDomain(connection.domain)
  const from = formatFundSender(mailbox.displayName, mailbox.localPart, domain)
  const to = normalizeEmailAddress(params.to, 'recipient')
  const cc = params.cc
    ? normalizeEmailAddress(params.cc, 'CC recipient')
    : undefined
  const bcc = params.bcc
    ? normalizeEmailAddress(params.bcc, 'BCC recipient')
    : undefined
  const subject = assertSafeEmailHeader(params.subject, 'subject', 998)
  const html = boundedBody(params.html, 'HTML body', 2 * 1024 * 1024)
  const text =
    params.text === undefined
      ? undefined
      : boundedBody(params.text, 'text body', 1024 * 1024)
  const context = normalizeContext(params.contextType, params.contextId)
  const idempotencyKey = fundProviderIdempotencyKey(
    params.fundId,
    params.operationId,
  )
  const internetMessageId = fundInternetMessageId(
    params.fundId,
    idempotencyKey,
    domain,
  )
  const rawReplyToken = deriveFundReplyToken(
    params.fundId,
    idempotencyKey,
    dependencies.replyTokenSecret,
  )
  const replyTo = `r_${rawReplyToken}@${domain}`
  const store =
    dependencies.store ?? createSupabaseFundEmailOutboundStore(admin)
  const prepared = await store.prepare({
    fundId: params.fundId,
    mailboxId: mailbox.id,
    purpose: params.purpose,
    contextType: context.contextType,
    contextId: context.contextId,
    externalParticipantAddress: to,
    subject,
    fromAddress: from,
    toAddresses: [to],
    ccAddresses: cc ? [cc] : [],
    bccAddresses: bcc ? [bcc] : [],
    textBody: text ?? null,
    htmlBodyUntrusted: html,
    internetMessageId,
    replyTokenHash: hashFundReplyToken(rawReplyToken),
    idempotencyKey,
  })

  if (
    prepared.idempotencyKey !== idempotencyKey ||
    prepared.internetMessageId !== internetMessageId
  )
    throw storageUnavailable()
  if (prepared.providerMessageId) {
    return {
      id: prepared.providerMessageId,
      threadId: prepared.threadId,
      messageId: prepared.messageId,
      reused: true,
    }
  }

  const headers = {
    'Message-ID': prepared.internetMessageId,
    ...buildThreadHeaders(prepared.priorInternetMessageIds),
  }
  let providerResult: { id?: string }
  try {
    providerResult = await (dependencies.send ?? sendOutboundEmail)(
      { provider: 'resend', apiKey: connection.sendingApiKey },
      {
        from,
        to,
        cc,
        bcc,
        replyTo,
        subject,
        html,
        text,
        headers,
        tags: [
          { name: 'scope', value: 'fund-mail' },
          { name: 'purpose', value: params.purpose },
        ],
        idempotencyKey,
      },
    )
  } catch {
    await bestEffortMarkFailed(store, params.fundId, prepared.messageId)
    throw new FundEmailError(
      'delivery_failed',
      'Fund email delivery failed.',
      502,
    )
  }

  if (!providerResult.id) {
    await bestEffortMarkFailed(store, params.fundId, prepared.messageId)
    throw new FundEmailError(
      'delivery_failed',
      'Fund email delivery failed.',
      502,
    )
  }
  try {
    await store.markSubmitted({
      fundId: params.fundId,
      connectionId: connection.id,
      messageId: prepared.messageId,
      providerMessageId: providerResult.id,
    })
  } catch {
    throw storageUnavailable()
  }
  return {
    id: providerResult.id,
    threadId: prepared.threadId,
    messageId: prepared.messageId,
    reused: false,
  }
}

export function fundProviderIdempotencyKey(
  fundId: string,
  operationIdInput: string,
): string {
  const operationId = assertSafeEmailHeader(
    operationIdInput,
    'email operation',
    200,
  )
  const digest = createHash('sha256')
    .update(`fund-email-operation:v1\0${fundId}\0${operationId}`, 'utf8')
    .digest('hex')
    .slice(0, 48)
  return `fund-email:${digest}`
}

export function fundInternetMessageId(
  fundId: string,
  idempotencyKey: string,
  domainInput: string,
): string {
  const domain = normalizeDnsDomain(domainInput)
  const digest = createHash('sha256')
    .update(`fund-email-message-id:v1\0${fundId}\0${idempotencyKey}`, 'utf8')
    .digest('hex')
    .slice(0, 48)
  return assertSafeInternetMessageId(`<fw.${digest}@${domain}>`)
}

export function deriveFundReplyToken(
  fundId: string,
  idempotencyKey: string,
  explicitSecret?: string,
): string {
  const secret = explicitSecret ?? process.env.ENCRYPTION_KEY?.trim()
  if (!secret || secret.length < 32 || /[\r\n\0]/.test(secret)) {
    throw new FundEmailError(
      'encryption_unavailable',
      'Fund email reply routing is not configured.',
      500,
    )
  }
  const derivedKey = createHmac('sha256', secret)
    .update('fund-email-reply-key:v1', 'utf8')
    .digest()
  return createHmac('sha256', derivedKey)
    .update(`${fundId}\0${idempotencyKey}`, 'utf8')
    .digest('hex')
    .slice(0, 40)
}

export function hashFundReplyToken(token: string): string {
  if (!/^[a-f0-9]{40}$/.test(token)) {
    throw new FundEmailError(
      'invalid_configuration',
      'Fund reply route is invalid.',
      500,
    )
  }
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function buildThreadHeaders(
  internetMessageIds: string[],
): Record<string, string> | undefined {
  const normalized = Array.from(new Set(internetMessageIds))
    .map((value) => assertSafeInternetMessageId(value))
    .slice(-20)
  if (normalized.length === 0) return undefined
  while (normalized.join(' ').length > 900) normalized.shift()
  const latest = normalized.at(-1)
  if (!latest) return undefined
  return {
    'In-Reply-To': latest,
    References: normalized.join(' '),
  }
}

export function createSupabaseFundEmailOutboundStore(
  admin: Admin,
): FundEmailOutboundStore {
  return {
    async prepare(input) {
      const result = await admin.rpc('fund_email_prepare_outbound_message', {
        p_fund_id: input.fundId,
        p_mailbox_id: input.mailboxId,
        p_purpose: input.purpose,
        p_context_type: input.contextType,
        p_context_id: input.contextId,
        p_external_participant_address: input.externalParticipantAddress,
        p_subject: input.subject,
        p_from_address: input.fromAddress,
        p_to_addresses: input.toAddresses,
        p_cc_addresses: input.ccAddresses,
        p_bcc_addresses: input.bccAddresses,
        p_text_body: input.textBody,
        p_html_body_untrusted: input.htmlBodyUntrusted,
        p_internet_message_id: input.internetMessageId,
        p_reply_token_hash: input.replyTokenHash,
        p_idempotency_key: input.idempotencyKey,
      })
      if (result.error) throw storageUnavailable()
      const row = Array.isArray(result.data) ? result.data[0] : result.data
      if (!row?.message_id || !row?.thread_id || !row?.internet_message_id) {
        throw storageUnavailable()
      }
      return {
        threadId: row.thread_id,
        messageId: row.message_id,
        internetMessageId: row.internet_message_id,
        idempotencyKey: row.idempotency_key,
        providerMessageId: row.provider_message_id ?? null,
        priorInternetMessageIds: Array.isArray(row.prior_internet_message_ids)
          ? row.prior_internet_message_ids
          : [],
      }
    },
    async markSubmitted(input) {
      const result = await admin.rpc('fund_email_mark_outbound_submitted', {
        p_fund_id: input.fundId,
        p_connection_id: input.connectionId,
        p_message_id: input.messageId,
        p_provider_message_id: input.providerMessageId,
      })
      if (result.error || result.data !== true) throw storageUnavailable()
    },
    async markFailed(input) {
      const result = await admin
        .from('fund_email_messages')
        .update({ routing_status: 'failed' })
        .eq('fund_id', input.fundId)
        .eq('id', input.messageId)
        .eq('direction', 'outbound')
        .select('id')
        .maybeSingle()
      if (result.error || !result.data) throw storageUnavailable()
    },
  }
}

async function bestEffortMarkFailed(
  store: FundEmailOutboundStore,
  fundId: string,
  messageId: string,
): Promise<void> {
  try {
    await store.markFailed({ fundId, messageId })
  } catch {
    // The provider failure remains the caller-facing error. A pending outbox row is retryable.
  }
}

function normalizeContext(
  contextType: FundEmailContextType | undefined,
  contextId: string | undefined,
): { contextType: FundEmailContextType | null; contextId: string | null } {
  if (Boolean(contextType) !== Boolean(contextId)) {
    throw new FundEmailError(
      'invalid_configuration',
      'Email context is incomplete.',
    )
  }
  return {
    contextType: contextType ?? null,
    contextId: contextId ?? null,
  }
}

function normalizeEmailAddress(input: string, field: string): string {
  const address = assertSafeEmailHeader(input, field, 320).toLowerCase()
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) {
    throw new FundEmailError(
      'invalid_header',
      `A valid ${field} email address is required.`,
    )
  }
  return address
}

function boundedBody(input: string, field: string, maxBytes: number): string {
  if (
    !input ||
    Buffer.byteLength(input, 'utf8') > maxBytes ||
    input.includes('\0')
  ) {
    throw new FundEmailError(
      'invalid_configuration',
      `A valid ${field} is required.`,
    )
  }
  return input
}

function assertSafeInternetMessageId(input: string): string {
  const value = assertSafeEmailHeader(input, 'Message-ID', 998)
  if (!/^<[^<>\s]+>$/.test(value)) {
    throw new FundEmailError(
      'invalid_header',
      'A valid Message-ID is required.',
      500,
    )
  }
  return value
}

function storageUnavailable(): FundEmailError {
  return new FundEmailError(
    'storage_unavailable',
    'Fund email storage is unavailable.',
    503,
  )
}
