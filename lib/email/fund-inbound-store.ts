import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import type { PersistedFundInboundMessage } from './fund-inbound-actions'
import {
  hashFundEmailRouteToken,
  type FundEmailReceivingConfiguration,
} from './fund-credentials'
import type { FundEmailPurpose } from './fund-outbound'
import type {
  FundEmailInboundMailboxMatch,
  FundEmailInboundRoutingResult,
  FundEmailInboundRoutingStore,
  FundEmailInboundThreadMatch,
} from './inbound-routing'
import type { RetrievedResendInboundEmail } from './resend-inbound'
import type { ResendWebhookClaim } from './resend-webhook'

const FUND_EMAIL_WEBHOOK_LEASE_SECONDS = 900

export function createSupabaseFundEmailInboundPersistence(admin: SupabaseClient<Database>) {
  return async (
    connection: FundEmailReceivingConfiguration,
    email: RetrievedResendInboundEmail,
    routing: FundEmailInboundRoutingResult,
  ): Promise<PersistedFundInboundMessage | null> => {
    if (routing.disposition !== 'routed') return null
    const result = await admin.rpc('fund_email_store_inbound_message', {
      p_fund_id: connection.fundId,
      p_mailbox_id: routing.mailboxId,
      p_thread_id: routing.threadId,
      p_purpose: routing.purpose,
      p_provider_message_id: email.providerEmailId,
      p_internet_message_id: email.internetMessageId,
      p_in_reply_to: email.inReplyTo,
      p_message_references: [...email.references],
      p_from_address: email.from,
      p_to_addresses: [...email.to],
      p_cc_addresses: [...email.cc],
      p_bcc_addresses: [...email.bcc],
      p_reply_to_address: email.replyTo[0] ?? null,
      p_subject: email.subject,
      p_text_body: email.text,
      p_html_body_untrusted: email.htmlUntrusted,
      p_attachment_metadata: email.attachments.map(attachment => ({ ...attachment })) as unknown as Json,
      p_received_at: email.receivedAt,
    })
    if (result.error) throw storageUnavailable()
    const row = Array.isArray(result.data) ? result.data[0] : result.data
    if (!row?.message_id || !row?.thread_id || typeof row.reused !== 'boolean') {
      throw storageUnavailable()
    }
    return {
      messageId: row.message_id,
      threadId: row.thread_id,
      reused: row.reused,
    }
  }
}

export function createSupabaseFundEmailWebhookEventStore(admin: SupabaseClient<Database>) {
  return {
    async claim(input: {
      routeToken: string
      svixId: string
      providerEmailId: string
    }): Promise<ResendWebhookClaim | null> {
      const result = await admin.rpc('fund_email_claim_webhook_event', {
        p_route_token_hash: hashFundEmailRouteToken(input.routeToken),
        p_svix_id: input.svixId,
        p_provider_email_id: input.providerEmailId,
        p_lease_seconds: FUND_EMAIL_WEBHOOK_LEASE_SECONDS,
      })
      if (result.error) throw storageUnavailable()
      const row = Array.isArray(result.data) ? result.data[0] : result.data
      return row?.id && row?.attempt_id
        ? { id: row.id, attemptId: row.attempt_id }
        : null
    },
    async complete(
      eventId: string,
      attemptId: string,
      disposition: 'routed' | 'unroutable' | 'quarantined' | 'ignored',
    ): Promise<boolean> {
      const result = await admin.rpc('fund_email_complete_webhook_event', {
        p_event_id: eventId,
        p_attempt_id: attemptId,
        p_disposition: disposition,
      })
      if (result.error) throw storageUnavailable()
      return result.data === true
    },
    async fail(eventId: string, attemptId: string, errorCode: string): Promise<boolean> {
      const result = await admin.rpc('fund_email_fail_webhook_event', {
        p_event_id: eventId,
        p_attempt_id: attemptId,
        p_error_code: errorCode,
      })
      if (result.error) throw storageUnavailable()
      return result.data === true
    },
  }
}

export function createSupabaseFundEmailInboundRoutingStore(
  admin: SupabaseClient<Database>,
): FundEmailInboundRoutingStore {
  return {
    async findReplyRoute(fundId, tokenHash) {
      const now = new Date().toISOString()
      const result = await admin
        .from('fund_email_reply_routes')
        .select('thread_id,mailbox_id')
        .eq('fund_id', fundId)
        .eq('token_hash', tokenHash)
        .is('revoked_at', null)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .maybeSingle()
      if (result.error) throw storageUnavailable()
      if (!result.data) return null
      const matches = await loadThreadMatches(admin, fundId, [result.data.thread_id])
      const match = matches[0] ?? null
      return match?.mailboxId === result.data.mailbox_id ? match : null
    },
    async findThreadByInternetMessageIds(fundId, messageIds) {
      if (messageIds.length === 0) return []
      const result = await admin
        .from('fund_email_messages')
        .select('thread_id')
        .eq('fund_id', fundId)
        .in('internet_message_id', messageIds)
        .limit(25)
      if (result.error) throw storageUnavailable()
      const threadIds = Array.from(new Set(
        (result.data ?? []).map(row => row.thread_id).filter(Boolean),
      )) as string[]
      return loadThreadMatches(admin, fundId, threadIds)
    },
    async findMailboxesByLocalParts(fundId, localParts) {
      if (localParts.length === 0) return []
      const result = await admin
        .from('fund_email_mailboxes')
        .select('id,local_part,kind')
        .eq('fund_id', fundId)
        .eq('active', true)
        .in('local_part', localParts)
      if (result.error) throw storageUnavailable()
      return (result.data ?? []).map((row): FundEmailInboundMailboxMatch => ({
        mailboxId: row.id,
        localPart: row.local_part,
        purpose: purposeForMailboxKind(row.kind),
      }))
    },
  }
}

async function loadThreadMatches(
  admin: SupabaseClient<Database>,
  fundId: string,
  threadIds: string[],
): Promise<FundEmailInboundThreadMatch[]> {
  if (threadIds.length === 0) return []
  const result = await admin
    .from('fund_email_threads')
    .select('id,mailbox_id,purpose')
    .eq('fund_id', fundId)
    .in('id', threadIds)
  if (result.error) throw storageUnavailable()
  return (result.data ?? []).map((row): FundEmailInboundThreadMatch => ({
    threadId: row.id,
    mailboxId: row.mailbox_id,
    purpose: assertPurpose(row.purpose),
  }))
}

function purposeForMailboxKind(kind: unknown): FundEmailPurpose {
  if (kind === 'pitch') return 'pitch'
  if (kind === 'expert') return 'expert_invitation'
  if (kind === 'user' || kind === 'shared') return 'general'
  throw storageUnavailable()
}

function assertPurpose(value: unknown): FundEmailPurpose {
  if (value === 'general' || value === 'pitch' || value === 'expert_invitation' || value === 'system') {
    return value
  }
  throw storageUnavailable()
}

function storageUnavailable(): Error {
  return new Error('Fund email storage is temporarily unavailable.')
}
