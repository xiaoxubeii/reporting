import type { SupabaseClient } from '@supabase/supabase-js'
import { getFeatureProvider } from '@/lib/ai/feature-provider'
import type { AIProvider } from '@/lib/ai/types'
import {
  extractAttachmentText,
  hydrateAttachments,
  type ExtractionResult,
} from '@/lib/parsing/extractAttachmentText'
import { emailFingerprint } from '@/lib/pipeline/emailFingerprint'
import { finalizeEmail, type PostmarkPayload } from '@/lib/pipeline/processEmail'
import { processDeal } from '@/lib/pipeline/processDeal'
import type { Database, Json } from '@/lib/types/database'
import type { FundEmailReceivingConfiguration } from './fund-credentials'
import type { FundEmailInboundRoutingResult } from './inbound-routing'
import type { RetrievedResendInboundEmail } from './resend-inbound'

type Admin = SupabaseClient<Database>
const PITCH_SCREENING_DEADLINE_MS = 240_000

export interface PersistedFundInboundMessage {
  messageId: string
  threadId: string
  reused: boolean
}

interface InboundPitchRecord {
  id: string
  processingStatus: string
}

interface CreateInboundPitchInput {
  admin: Admin
  fundId: string
  threadId: string
  providerEmailId: string
  email: RetrievedResendInboundEmail
  payload: PostmarkPayload
}

export interface FundInboundActionDependencies {
  createOrLoadInboundEmail(input: CreateInboundPitchInput): Promise<InboundPitchRecord>
  hydrateAttachments(payload: PostmarkPayload): Promise<PostmarkPayload>
  extractAttachments(payload: PostmarkPayload): Promise<ExtractionResult>
  getDealProvider(admin: Admin, fundId: string): Promise<{
    provider: AIProvider
    providerType: string
    model: string
  }>
  processDeal(params: Parameters<typeof processDeal>[0]): ReturnType<typeof processDeal>
  finalizeEmail: typeof finalizeEmail
}

export async function dispatchFundInboundBusinessAction(input: {
  admin: Admin
  connection: FundEmailReceivingConfiguration
  email: RetrievedResendInboundEmail
  routing: FundEmailInboundRoutingResult
  persisted: PersistedFundInboundMessage | null
  dependencies?: FundInboundActionDependencies
}): Promise<void> {
  if (!isNewPitchMailboxMessage(input.routing) || !input.persisted) return
  const dependencies = input.dependencies ?? defaultDependencies
  const payload = toPostmarkPayload(input.email)
  const inbound = await dependencies.createOrLoadInboundEmail({
    admin: input.admin,
    fundId: input.connection.fundId,
    threadId: input.persisted.threadId,
    providerEmailId: input.email.providerEmailId,
    email: input.email,
    payload,
  })
  if (inbound.processingStatus === 'success') return

  try {
    const hydrated = await dependencies.hydrateAttachments(payload)
    const extracted = await dependencies.extractAttachments(hydrated)
    const provider = await dependencies.getDealProvider(input.admin, input.connection.fundId)
    const result = await dependencies.processDeal({
      supabase: input.admin,
      emailId: inbound.id,
      fundId: input.connection.fundId,
      payload: hydrated,
      extracted,
      provider: provider.provider,
      providerType: provider.providerType,
      model: provider.model,
      introSourceOverride: 'email',
      signal: AbortSignal.timeout(PITCH_SCREENING_DEADLINE_MS),
    })
    if (!result.dealId) throw new Error('Deal screening did not create a record')
    await dependencies.finalizeEmail(input.admin, inbound.id, { status: 'success' })
  } catch {
    await dependencies.finalizeEmail(input.admin, inbound.id, {
      status: 'failed',
      warnings: ['Pitch screening failed.'],
    })
    throw new Error('Pitch screening failed')
  }
}

function isNewPitchMailboxMessage(
  routing: FundEmailInboundRoutingResult,
): routing is Extract<FundEmailInboundRoutingResult, { source: 'mailbox' }> {
  return routing.disposition === 'routed'
    && routing.source === 'mailbox'
    && routing.localPart === 'pitch'
    && routing.purpose === 'pitch'
    && routing.threadId === null
}

const defaultDependencies: FundInboundActionDependencies = {
  createOrLoadInboundEmail: createOrLoadInboundPitchEmail,
  hydrateAttachments: async payload => ({
    ...payload,
    ...await hydrateAttachments(payload),
  }),
  extractAttachments: extractAttachmentText,
  getDealProvider: (admin, fundId) => getFeatureProvider(admin, fundId, 'deal_analysis'),
  processDeal,
  finalizeEmail,
}

async function createOrLoadInboundPitchEmail(
  input: CreateInboundPitchInput,
): Promise<InboundPitchRecord> {
  const fingerprint = emailFingerprint(
    input.email.from,
    input.email.subject,
    input.email.receivedAt,
    input.email.internetMessageId,
  )
  const insert = await input.admin
    .from('inbound_emails')
    .insert({
      fund_id: input.fundId,
      from_address: extractAddress(input.email.from),
      to_address: input.email.to[0] ?? null,
      subject: input.email.subject,
      raw_payload: input.payload as unknown as Json,
      processing_status: 'processing',
      attachments_count: input.email.attachments.length,
      email_fingerprint: fingerprint,
      routed_to: 'deals',
      routing_label: 'deals',
      routing_confidence: 1,
      routing_reasoning: 'Delivered to the Fund pitch mailbox.',
      provider: 'resend',
      provider_email_id: input.providerEmailId,
      email_thread_id: input.threadId,
      internet_message_id: input.email.internetMessageId,
      in_reply_to: input.email.inReplyTo,
      message_references: [...input.email.references],
    })
    .select('id,processing_status')
    .single()
  if (!insert.error && insert.data) {
    return { id: insert.data.id, processingStatus: inboundProcessingStatus(insert.data.processing_status) }
  }
  if (insert.error?.code !== '23505') throw new Error('Inbound pitch storage failed')

  const existing = await input.admin
    .from('inbound_emails')
    .select('id,processing_status')
    .eq('fund_id', input.fundId)
    .eq('provider', 'resend')
    .eq('provider_email_id', input.providerEmailId)
    .maybeSingle()
  if (existing.error || !existing.data) throw new Error('Inbound pitch storage failed')
  const status = inboundProcessingStatus(existing.data.processing_status)
  if (status !== 'success') {
    const update = await input.admin
      .from('inbound_emails')
      .update({ processing_status: 'processing', processing_error: null })
      .eq('id', existing.data.id)
    if (update.error) throw new Error('Inbound pitch storage failed')
  }
  return { id: existing.data.id, processingStatus: status }
}

function inboundProcessingStatus(value: string | null): string {
  return value ?? 'processing'
}

function toPostmarkPayload(email: RetrievedResendInboundEmail): PostmarkPayload {
  const sender = splitSender(email.from)
  return {
    From: sender.email,
    FromFull: { Email: sender.email, Name: sender.name },
    To: email.to.join(', '),
    OriginalRecipient: email.to[0],
    Date: email.receivedAt,
    Subject: email.subject,
    TextBody: email.text ?? undefined,
    HtmlBody: email.htmlUntrusted ?? undefined,
    MessageID: email.internetMessageId,
    Attachments: email.attachments.map(attachment => ({
      Name: attachment.filename,
      ContentType: attachment.contentType,
      ContentLength: attachment.size,
      StoragePath: attachment.storagePath,
    })),
  }
}

function splitSender(input: string): { email: string; name: string } {
  const match = input.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/)
  if (!match) return { email: input.trim(), name: '' }
  return { email: match[2].trim(), name: match[1].replace(/^"|"$/g, '').trim() }
}

function extractAddress(input: string): string {
  return splitSender(input).email.toLowerCase()
}
