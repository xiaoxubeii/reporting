import { createAdminClient } from '@/lib/supabase/admin'
import { hashInvitationToken } from './token'
import type { PublicExpertInvitation } from './types'

type Admin = ReturnType<typeof createAdminClient>

export const PUBLIC_INVITATION_ERROR = 'This invitation is invalid or no longer available.'

export function validateRawToken(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error(PUBLIC_INVITATION_ERROR)
  return value
}

export async function resolvePublicInvitation(
  admin: Admin,
  rawToken: string,
  expectedFundId?: string,
): Promise<PublicExpertInvitation> {
  const tokenHash = hashInvitationToken(validateRawToken(rawToken))
  let invitationQuery = admin
    .from('diligence_expert_requests')
    .select('fund_id, question, context_snapshot, expires_at, status, submitted_at')
    .eq('token_hash', tokenHash)
  if (expectedFundId) invitationQuery = invitationQuery.eq('fund_id', expectedFundId)
  const { data, error } = await invitationQuery.maybeSingle()
  if (error) throw error
  const row = data
  if (!row || !row.expires_at || Date.parse(row.expires_at) <= Date.now() || !['invited', 'submitted'].includes(row.status)) {
    throw new Error(PUBLIC_INVITATION_ERROR)
  }
  const { data: fund } = await admin.from('funds').select('name').eq('id', row.fund_id).maybeSingle()
  return {
    invitationParty: fund?.name ?? 'Investment team',
    deadline: row.expires_at,
    question: row.question,
    contextSnapshot: row.context_snapshot,
    responseInstructions: 'Provide a concise answer based on your direct professional experience. State important assumptions and any limits to your confidence.',
    submittedAt: row.submitted_at ?? null,
  }
}

export async function submitPublicResponse(params: {
  admin: Admin
  rawToken: string
  responseMarkdown: string
  expectedFundId?: string
}): Promise<{ requestId: string; submittedAt: string; alreadySubmitted: boolean }> {
  const tokenHash = hashInvitationToken(validateRawToken(params.rawToken))
  const now = new Date().toISOString()
  let submissionQuery = params.admin
    .from('diligence_expert_requests')
    .update({
      response_markdown: params.responseMarkdown,
      submitted_at: now,
      status: 'submitted',
    })
    .eq('token_hash', tokenHash)
  if (params.expectedFundId) submissionQuery = submissionQuery.eq('fund_id', params.expectedFundId)
  const { data, error } = await submissionQuery
    .eq('status', 'invited')
    .gt('expires_at', now)
    .is('response_markdown', null)
    .select('id, submitted_at')
    .maybeSingle()
  if (error) throw error
  if (data?.submitted_at) return { requestId: data.id, submittedAt: data.submitted_at, alreadySubmitted: false }

  let existingQuery = params.admin
    .from('diligence_expert_requests')
    .select('id, status, submitted_at, expires_at')
    .eq('token_hash', tokenHash)
  if (params.expectedFundId) existingQuery = existingQuery.eq('fund_id', params.expectedFundId)
  const { data: existing } = await existingQuery.maybeSingle()
  const row = existing
  if (row?.status === 'submitted' && row.submitted_at && row.expires_at && Date.parse(row.expires_at) > Date.now()) {
    return { requestId: row.id, submittedAt: row.submitted_at, alreadySubmitted: true }
  }
  throw new Error(PUBLIC_INVITATION_ERROR)
}

export function rateKey(kind: 'ip' | 'token', value: string): string {
  return `expert-response:${kind}:${hashInvitationToken(value)}`
}
