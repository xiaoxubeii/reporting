import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/types/database'

type Admin = ReturnType<typeof createAdminClient>

export interface SafeFundEmailAttachment {
  filename: string
  contentType: string
  sizeBytes: number
}

export interface SafeFundEmailMessage {
  id: string
  direction: 'inbound' | 'outbound'
  from: string
  to: string[]
  subject: string | null
  body: { kind: 'plain_text'; text: string }
  attachments: SafeFundEmailAttachment[]
  occurredAt: string
}

export interface ExpertEmailThreadView {
  id: string
  subject: string | null
  status: string
  participantAddress: string | null
  renderingPolicy: 'plain_text_only'
  createdAt: string
  updatedAt: string
  messages: SafeFundEmailMessage[]
}

export async function readExpertEmailThread(
  admin: Admin,
  input: Readonly<{ fundId: string; dealId: string; requestId: string }>,
): Promise<ExpertEmailThreadView | null> {
  const requestResult = await admin
    .from('diligence_expert_requests')
    .select('id, email_thread_id')
    .eq('id', input.requestId)
    .eq('deal_id', input.dealId)
    .eq('fund_id', input.fundId)
    .maybeSingle()
  if (requestResult.error) throw requestResult.error
  if (!requestResult.data) return null

  let threadQuery = admin
    .from('fund_email_threads')
    .select('id, subject, status, external_participant_address, created_at, updated_at')
    .eq('fund_id', input.fundId)
    .eq('context_type', 'diligence_expert_request')
    .eq('context_id', input.requestId)
  threadQuery = requestResult.data.email_thread_id
    ? threadQuery.eq('id', requestResult.data.email_thread_id)
    : threadQuery.order('updated_at', { ascending: false }).limit(1)
  const threadResult = await threadQuery.maybeSingle()
  if (threadResult.error) throw threadResult.error
  if (!threadResult.data) return null

  const messageResult = await admin
    .from('fund_email_messages')
    .select('id, direction, from_address, to_addresses, subject, text_body, attachment_metadata, provider_submitted_at, received_at, created_at')
    .eq('thread_id', threadResult.data.id)
    .eq('fund_id', input.fundId)
    .order('created_at', { ascending: true })
  if (messageResult.error) throw messageResult.error

  return {
    id: threadResult.data.id,
    subject: threadResult.data.subject,
    status: threadResult.data.status,
    participantAddress: threadResult.data.external_participant_address,
    renderingPolicy: 'plain_text_only',
    createdAt: threadResult.data.created_at,
    updatedAt: threadResult.data.updated_at,
    messages: (messageResult.data ?? []).map(row => ({
      id: row.id,
      direction: assertDirection(row.direction),
      from: row.from_address,
      to: [...row.to_addresses],
      subject: row.subject,
      body: { kind: 'plain_text' as const, text: row.text_body ?? '' },
      attachments: safeAttachmentMetadata(row.attachment_metadata),
      occurredAt: row.received_at ?? row.provider_submitted_at ?? row.created_at,
    })),
  }
}

function assertDirection(value: string): 'inbound' | 'outbound' {
  if (value === 'inbound' || value === 'outbound') return value
  throw new Error('Invalid stored email direction')
}

function safeAttachmentMetadata(value: Json): SafeFundEmailAttachment[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || Array.isArray(item) || typeof item !== 'object') return []
    const filename = safeMetadataString(item.filename, 255)
    const contentType = safeMetadataString(item.contentType, 255)
    const sizeBytes = item.size
    if (!filename || !contentType || !Number.isSafeInteger(sizeBytes) || Number(sizeBytes) < 0) return []
    return [{ filename, contentType, sizeBytes: Number(sizeBytes) }]
  })
}

function safeMetadataString(value: Json | undefined, maxLength: number): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    return null
  }
  return value
}
