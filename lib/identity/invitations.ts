import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPlatformEmail } from '@/lib/email/system'
import { canonicalFundOriginForId } from '@/lib/tenancy/links'
import { automaticMinifluxProvisioningEnabled } from '@/lib/feeds/config'
import { ensureMinifluxConnection } from '@/lib/feeds/provisioning'
import type { Database } from '@/lib/types/database'
import { IdentityOnboardingError, identityStorageError } from './errors'

export type FundInvitationRole = 'admin' | 'member'

export interface FundInvitationSummary {
  id: string
  email: string
  role: FundInvitationRole
  status: 'pending' | 'accepted' | 'revoked' | 'replaced' | 'expired'
  expiresAt: string
  createdAt: string
  acceptedAt: string | null
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/

export function normalizeExternalInvitationEmail(input: unknown): string {
  if (typeof input !== 'string') {
    throw new IdentityOnboardingError('invalid_invitation', 'Enter a valid external email.', 400)
  }
  const email = input.normalize('NFKC').trim().toLowerCase()
  const domain = email.split('@')[1] ?? ''
  if (
    email.length < 3
    || email.length > 320
    || !EMAIL_PATTERN.test(email)
    || /[\r\n\0]/.test(email)
    || domain === 'fundworkspace.com'
    || domain.endsWith('.fundworkspace.com')
  ) {
    throw new IdentityOnboardingError('invalid_invitation', 'Enter a valid external email.', 400)
  }
  return email
}

export function normalizeFundInvitationRole(input: unknown): FundInvitationRole {
  if (input !== 'admin' && input !== 'member') {
    throw new IdentityOnboardingError('invalid_invitation', 'Invalid invitation role.', 400)
  }
  return input
}

export function generateFundInvitationToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashFundInvitationToken(rawToken: unknown): string {
  if (typeof rawToken !== 'string' || !TOKEN_PATTERN.test(rawToken)) {
    throw new IdentityOnboardingError(
      'invitation_unavailable',
      'This invitation is invalid or expired.',
      404,
    )
  }
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

export function buildFundInvitationLink(origin: string, rawToken: string): string {
  hashFundInvitationToken(rawToken)
  const url = new URL('/invite', origin)
  url.search = ''
  url.hash = new URLSearchParams({ token: rawToken }).toString()
  return url.toString()
}

export async function listFundInvitations(
  admin: SupabaseClient<Database>,
  fundId: string,
): Promise<FundInvitationSummary[]> {
  const result = await admin
    .from('fund_member_invitations')
    .select('id,email_normalized,role,expires_at,created_at,accepted_at,revoked_at,replaced_at')
    .eq('fund_id', fundId)
    .not('delivery_confirmed_at', 'is', null)
    .order('created_at', { ascending: false })
  if (result.error) throw identityStorageError()
  const now = Date.now()
  return (result.data ?? []).map(row => ({
    id: row.id,
    email: row.email_normalized,
    role: normalizeFundInvitationRole(row.role),
    status: row.accepted_at
      ? 'accepted'
      : row.revoked_at
        ? 'revoked'
        : row.replaced_at
          ? 'replaced'
          : new Date(row.expires_at).getTime() <= now
            ? 'expired'
            : 'pending',
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
  }))
}

export async function createFundInvitation(
  admin: SupabaseClient<Database>,
  params: {
    fundId: string
    actorUserId: string
    email: unknown
    role: unknown
    locale?: 'en' | 'zh-CN'
  },
): Promise<FundInvitationSummary> {
  const email = normalizeExternalInvitationEmail(params.email)
  const role = normalizeFundInvitationRole(params.role)
  const rawToken = generateFundInvitationToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const created = await admin.rpc('create_fund_member_invitation', {
    p_fund_id: params.fundId,
    p_email_normalized: email,
    p_role: role,
    p_token_hash: hashFundInvitationToken(rawToken),
    p_expires_at: expiresAt,
    p_invited_by: params.actorUserId,
  })
  if (created.error || !created.data) throw mapInvitationMutationError(created.error)

  try {
    await sendInvitationEmail(admin, {
      fundId: params.fundId,
      email,
      role,
      rawToken,
      locale: params.locale,
    })
    const confirmed = await admin.rpc('confirm_fund_member_invitation_delivery', {
      p_invitation_id: created.data.id,
      p_fund_id: params.fundId,
      p_actor_user_id: params.actorUserId,
    })
    if (confirmed.error || !confirmed.data) throw identityStorageError()
  } catch (error) {
    try {
      const revoked = await admin.rpc('revoke_fund_member_invitation', {
        p_invitation_id: created.data.id,
        p_fund_id: params.fundId,
        p_actor_user_id: params.actorUserId,
      })
      if (revoked.error || revoked.data !== true) {
        console.error('[fund-invitation] unable to revoke invitation after delivery failure')
      }
    } catch {
      // The original provider failure remains the user-facing error. The live
      // invitation can still be explicitly revoked from Fund settings.
    }
    throw error
  }
  return rowToSummary(created.data)
}

export async function resendFundInvitation(
  admin: SupabaseClient<Database>,
  params: {
    fundId: string
    invitationId: string
    actorUserId: string
    locale?: 'en' | 'zh-CN'
  },
): Promise<FundInvitationSummary> {
  const rawToken = generateFundInvitationToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const rotated = await admin.rpc('rotate_fund_member_invitation', {
    p_invitation_id: params.invitationId,
    p_fund_id: params.fundId,
    p_token_hash: hashFundInvitationToken(rawToken),
    p_expires_at: expiresAt,
    p_actor_user_id: params.actorUserId,
  })
  if (rotated.error || !rotated.data) throw mapInvitationMutationError(rotated.error)
  try {
    await sendInvitationEmail(admin, {
      fundId: params.fundId,
      email: rotated.data.email_normalized,
      role: normalizeFundInvitationRole(rotated.data.role),
      rawToken,
      locale: params.locale,
    })
    const confirmed = await admin.rpc('confirm_fund_member_invitation_delivery', {
      p_invitation_id: rotated.data.id,
      p_fund_id: params.fundId,
      p_actor_user_id: params.actorUserId,
    })
    if (confirmed.error || !confirmed.data) throw identityStorageError()
  } catch (error) {
    try {
      const revoked = await admin.rpc('revoke_fund_member_invitation', {
        p_invitation_id: rotated.data.id,
        p_fund_id: params.fundId,
        p_actor_user_id: params.actorUserId,
      })
      if (revoked.error || revoked.data !== true) {
        console.error('[fund-invitation] unable to revoke rotated invitation after delivery failure')
      }
    } catch {
      // Keep the provider error authoritative; the admin can revoke manually.
    }
    throw error
  }
  return rowToSummary(rotated.data)
}

export async function revokeFundInvitation(
  admin: SupabaseClient<Database>,
  params: { fundId: string; invitationId: string; actorUserId: string },
): Promise<void> {
  const result = await admin.rpc('revoke_fund_member_invitation', {
    p_invitation_id: params.invitationId,
    p_fund_id: params.fundId,
    p_actor_user_id: params.actorUserId,
  })
  if (result.error) throw mapInvitationMutationError(result.error)
  if (!result.data) {
    throw new IdentityOnboardingError(
      'invitation_unavailable',
      'This invitation is no longer available.',
      409,
    )
  }
}

export async function resolveFundInvitation(
  admin: SupabaseClient<Database>,
  rawToken: unknown,
): Promise<{
  fundName: string
  fundSlug: string
  emailMasked: string
  role: FundInvitationRole
  expiresAt: string
} | null> {
  const tokenHash = hashFundInvitationToken(rawToken)
  const result = await admin.rpc('resolve_fund_member_invitation', { p_token_hash: tokenHash })
  if (result.error) throw identityStorageError()
  const row = result.data?.[0]
  if (!row) return null
  return {
    fundName: row.fund_name,
    fundSlug: row.fund_slug,
    emailMasked: row.email_masked,
    role: normalizeFundInvitationRole(row.role),
    expiresAt: row.expires_at,
  }
}

/**
 * Server-only Host binding for acceptance. Unlike the public resolver, this
 * deliberately includes an already accepted token so a same-user retry can
 * still reach the idempotent acceptance RPC after a lost response.
 */
export async function resolveFundInvitationAcceptanceContext(
  admin: SupabaseClient<Database>,
  rawToken: unknown,
): Promise<{ fundId: string; fundSlug: string } | null> {
  const invitation = await admin
    .from('fund_member_invitations')
    .select('fund_id')
    .eq('token_hash', hashFundInvitationToken(rawToken))
    .maybeSingle()
  if (invitation.error) throw identityStorageError()
  if (!invitation.data) return null
  const fund = await admin
    .from('funds')
    .select('slug')
    .eq('id', invitation.data.fund_id)
    .maybeSingle()
  if (fund.error) throw identityStorageError()
  return fund.data
    ? { fundId: invitation.data.fund_id, fundSlug: fund.data.slug }
    : null
}

export async function acceptFundInvitation(
  admin: SupabaseClient<Database>,
  params: { rawToken: unknown; userId: string },
): Promise<{ fundId: string; role: FundInvitationRole }> {
  const result = await admin.rpc('accept_fund_member_invitation', {
    p_token_hash: hashFundInvitationToken(params.rawToken),
    p_user_id: params.userId,
  })
  if (result.error) {
    if (result.error.code === '42501') {
      throw new IdentityOnboardingError(
        'invitation_identity_mismatch',
        'Sign in with the invited, verified external email.',
        403,
      )
    }
    if (result.error.code === 'P0002' || result.error.code === '23505') {
      throw new IdentityOnboardingError(
        'invitation_unavailable',
        'This invitation is invalid or expired.',
        409,
      )
    }
    throw identityStorageError()
  }
  const row = result.data?.[0]
  if (!row) throw identityStorageError()
  if (automaticMinifluxProvisioningEnabled()) {
    await ensureMinifluxConnection(admin, params.userId)
  }
  return { fundId: row.fund_id, role: normalizeFundInvitationRole(row.role) }
}

async function sendInvitationEmail(
  admin: SupabaseClient<Database>,
  params: {
    fundId: string
    email: string
    role: FundInvitationRole
    rawToken: string
    locale?: 'en' | 'zh-CN'
  },
): Promise<void> {
  const origin = await canonicalFundOriginForId(admin as never, params.fundId)
  const link = buildFundInvitationLink(origin, params.rawToken)
  const chinese = params.locale === 'zh-CN'
  const subject = chinese ? '您受邀加入 FundWorkspace' : 'You are invited to FundWorkspace'
  const role = params.role === 'admin'
    ? (chinese ? '管理员' : 'administrator')
    : (chinese ? '成员' : 'member')
  const html = chinese
    ? `<p>您受邀以${role}身份加入基金工作区。</p><p><a href="${escapeHtml(link)}">查看邀请</a></p>`
    : `<p>You were invited to join a Fund workspace as a ${role}.</p><p><a href="${escapeHtml(link)}">Review invitation</a></p>`
  await sendPlatformEmail({ to: params.email, subject, html })
}

function rowToSummary(
  row: Database['public']['Tables']['fund_member_invitations']['Row'],
): FundInvitationSummary {
  return {
    id: row.id,
    email: row.email_normalized,
    role: normalizeFundInvitationRole(row.role),
    status: 'pending',
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
  }
}

function mapInvitationMutationError(error: { code?: string } | null): IdentityOnboardingError {
  if (error?.code === '23505') {
    return new IdentityOnboardingError(
      'invitation_conflict',
      'A live invitation or membership already exists for that email.',
      409,
    )
  }
  if (error?.code === '42501') {
    return new IdentityOnboardingError('invitation_denied', 'Invitation access denied.', 403)
  }
  if (error?.code === '22023') {
    return new IdentityOnboardingError('invalid_invitation', 'Invalid invitation.', 400)
  }
  if (error?.code === 'P0002') {
    return new IdentityOnboardingError(
      'invitation_unavailable',
      'This invitation is no longer available.',
      409,
    )
  }
  return identityStorageError()
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character)
}
