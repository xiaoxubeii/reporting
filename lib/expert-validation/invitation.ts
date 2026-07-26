import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/types/database'
import { getOutboundConfig, sendOutboundEmail, type EmailParams } from '@/lib/email'
import { sendFundThreadEmail } from '@/lib/email/fund-outbound'
import { createInvitationToken, invitationExpiry, invitationUrl } from './token'
import { sanitizeProviderError } from './validation'
import { toExpertRequest } from './service'
import { canonicalFundOriginForId } from '@/lib/tenancy/links'

type Admin = ReturnType<typeof createAdminClient>
type RequestRow = Tables<'diligence_expert_requests'>

export async function issueInvitation(params: {
  admin: Admin
  fundId: string
  actorUserId: string
  dealId: string
  requestId: string
  reissue?: boolean
}): Promise<{ request: ReturnType<typeof toExpertRequest>; invitationUrl: string; emailAccepted: boolean; warning?: string }> {
  const { admin, fundId, dealId, requestId } = params
  const { data: current, error: loadError } = await admin
    .from('diligence_expert_requests')
    .select('*')
    .eq('id', requestId)
    .eq('fund_id', fundId)
    .eq('deal_id', dealId)
    .maybeSingle()
  if (loadError) throw loadError
  const existing = current
  if (!existing || !existing.expert_id || !existing.expert_email) throw new Error('Selected expert request not found')
  const { data: eligibleExpert, error: expertError } = await admin
    .from('experts')
    .select('id, scope, fund_id, status, verification_type, source_type, verified_at, verified_by')
    .eq('id', existing.expert_id)
    .maybeSingle()
  if (expertError) throw expertError
  const eligible = eligibleExpert?.status === 'active' && (
    (eligibleExpert.scope === 'global' && eligibleExpert.verification_type === 'platform_certified'
      && eligibleExpert.source_type === 'platform' && Boolean(eligibleExpert.verified_at))
    || (eligibleExpert.scope === 'fund' && eligibleExpert.fund_id === fundId
      && eligibleExpert.verification_type === 'fund_confirmed'
      && Boolean(eligibleExpert.verified_at) && Boolean(eligibleExpert.verified_by))
  )
  if (!eligible) throw new Error('Selected expert is no longer eligible for invitation')
  const expertEmail = existing.expert_email
  const expertName = existing.expert_name ?? 'Expert'
  if (existing.status === 'submitted') throw new Error('Expert response has already been submitted')
  if (params.reissue ? existing.status !== 'invited' : existing.status !== 'draft') {
    throw new Error('Invitation state changed; refresh and try again')
  }

  const credential = createInvitationToken()
  const expiresAt = invitationExpiry()
  let update = admin
    .from('diligence_expert_requests')
    .update({
      status: 'invited',
      token_hash: credential.tokenHash,
      expires_at: expiresAt,
      invited_at: new Date().toISOString(),
      email_provider_accepted_at: null,
      email_message_id: null,
      email_thread_id: null,
      email_error_code: null,
      email_error_message: null,
    })
    .eq('id', requestId)
    .eq('fund_id', fundId)
    .eq('deal_id', dealId)
    .is('response_markdown', null)
  if (params.reissue && !existing.token_hash) throw new Error('Invitation state changed; refresh and try again')
  update = params.reissue
    ? update.eq('status', 'invited').eq('token_hash', existing.token_hash as string)
    : update.eq('status', 'draft').is('token_hash', null)

  const { data: issued, error: issueError } = await update.select('*').maybeSingle()
  if (issueError) throw issueError
  if (!issued) throw new Error('Invitation state changed; refresh and try again')

  const url = invitationUrl(
    credential.rawToken,
    await canonicalFundOriginForId(admin as never, fundId),
  )
  const { data: fund } = await admin.from('funds').select('name').eq('id', fundId).maybeSingle()
  const invitationParty = fund?.name ?? 'the investment team'
  let emailAccepted = false
  let acceptedThreadId: string | null = null
  let warning: string | undefined
  try {
    const message: EmailParams = {
      to: expertEmail,
      subject: 'Invitation to provide an expert perspective',
      html: invitationHtml({
        expertName,
        invitationParty,
        expiresAt,
        invitationUrl: url,
      }),
    }
    const provider = await getOutboundConfig(admin, fundId, 'asks')
    if (!provider) throw new Error('Asks email provider is not configured')

    let acceptedMessageId: string | null = null
    if (provider.provider === 'resend') {
      const result = await sendFundThreadEmail(admin, {
        fundId,
        actorUserId: params.actorUserId,
        operationId: `expert-invitation:${requestId}:${credential.tokenHash}`,
        fallbackMailbox: 'expert',
        purpose: 'expert_invitation',
        contextType: 'diligence_expert_request',
        contextId: requestId,
        ...message,
      })
      acceptedMessageId = result.id
      acceptedThreadId = result.threadId
    } else {
      const result = await sendOutboundEmail(provider, message)
      acceptedMessageId = result.id ?? null
    }
    emailAccepted = true
    const acceptanceUpdate = await admin.from('diligence_expert_requests').update({
      email_provider_accepted_at: new Date().toISOString(),
      email_message_id: acceptedMessageId?.slice(0, 500) ?? null,
      email_thread_id: acceptedThreadId,
    }).eq('id', requestId).eq('token_hash', credential.tokenHash).select('id').maybeSingle()
    if (acceptanceUpdate.error || !acceptanceUpdate.data) {
      throw new Error('Invitation email tracking state could not be saved')
    }
  } catch (error) {
    const safe = sanitizeProviderError(error)
    warning = emailAccepted
      ? 'The email provider accepted the invitation, but its tracking state could not be saved. Do not resend it until delivery has been checked.'
      : 'The invitation link was issued, but the email provider did not accept the message. Copy the link and send it manually.'
    await admin.from('diligence_expert_requests').update({
      email_error_code: safe.code,
      email_error_message: safe.message,
    }).eq('id', requestId).eq('token_hash', credential.tokenHash)
  }

  const { data: finalRow } = await admin.from('diligence_expert_requests').select('*').eq('id', requestId).single()
  const storedRequest = toExpertRequest((finalRow ?? issued) as RequestRow)
  const request = acceptedThreadId && !storedRequest.emailThreadId
    ? { ...storedRequest, emailThreadId: acceptedThreadId }
    : storedRequest
  return { request, invitationUrl: url, emailAccepted, warning }
}

export function invitationHtml(params: {
  expertName: string
  invitationParty: string
  expiresAt: string
  invitationUrl: string
}): string {
  const name = escapeHtml(params.expertName)
  const party = escapeHtml(params.invitationParty)
  const deadline = escapeHtml(new Date(params.expiresAt).toUTCString())
  const href = escapeHtml(params.invitationUrl)
  return `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#172033;max-width:560px">
<p>Hello ${name},</p>
<p>${party} has invited you to provide a short expert perspective for an investment diligence question.</p>
<p>The response is a single text answer and is expected to take about 10–15 minutes. This private link expires ${deadline}.</p>
<p><a href="${href}" style="display:inline-block;padding:10px 16px;background:#172033;color:#fff;text-decoration:none;border-radius:6px">Open expert question</a></p>
<p>Please do not forward this link.</p>
</div>`
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] as string)
}
