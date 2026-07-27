import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  assertAdminAccess,
  assertReadAccess,
  assertWriteAccess,
} from '@/lib/api-helpers'
import {
  beginFundEmailReceivingDisconnect,
  finalizeFundEmailReceivingDisconnect,
  getFundEmailConnectionStatus,
  loadFundEmailReceivingConfiguration,
  loadFundEmailReceivingConfigurationForAdmin,
} from '@/lib/email/fund-credentials'
import { FundEmailError } from '@/lib/email/errors'
import {
  createSupabaseFundEmailMailboxStore,
} from '@/lib/email/mailboxes'
import {
  configureFundEmailInboundSettings,
  resolveFundEmailWebhookBaseUrl,
} from '@/lib/email/fund-settings'
import {
  inspectResendFundDomain,
  mergeResendFundDomainRefresh,
  persistResendFundDomainInspection,
} from '@/lib/email/resend-domain'
import { removeResendWebhook } from '@/lib/email/resend-webhooks'
import { fundEmailBaseDomain } from '@/lib/email/domain'
import { rateLimit } from '@/lib/rate-limit'

const MAX_SETTINGS_BODY_BYTES = 8 * 1024
const SETTINGS_ACTIONS = new Set([
  'configure_inbound',
  'recreate_inbound_webhook',
  'refresh_status',
])

export async function GET() {
  const context = await authenticatedContext()
  if (context instanceof NextResponse) return context
  const { admin, user } = context
  const access = await assertReadAccess(admin, user.id)
  if (access instanceof NextResponse) return access

  try {
    const [status, mailbox, safeConnection] = await Promise.all([
      getFundEmailConnectionStatus(admin, access.fundId),
      createSupabaseFundEmailMailboxStore(admin).getUserMailbox(
        access.fundId,
        user.id,
      ),
      admin
        .from('fund_email_provider_credentials')
        .select('dns_records')
        .eq('fund_id', access.fundId)
        .maybeSingle(),
    ])
    if (safeConnection.error) throw new Error('Status unavailable')
    return NextResponse.json({
      ...status,
      isAdmin: access.role === 'admin',
      baseDomain: fundEmailBaseDomain(),
      dnsRecords: safeConnection.data?.dns_records ?? [],
      mailbox: mailbox
        ? {
            localPart: mailbox.localPart,
            displayName: mailbox.displayName,
            active: mailbox.active,
            address: status.domain
              ? `${mailbox.localPart}@${status.domain}`
              : null,
          }
        : null,
    })
  } catch (error) {
    return emailError(error)
  }
}

export async function PATCH(request: NextRequest) {
  const context = await authenticatedContext()
  if (context instanceof NextResponse) return context
  const { admin, user } = context
  const access = await assertWriteAccess(admin, user.id)
  if (access instanceof NextResponse) return access

  try {
    const body = await readBoundedJson(request)
    const action = requiredString(body.action)
    if (!SETTINGS_ACTIONS.has(action)) {
      throw new FundEmailError(
        'invalid_configuration',
        'Unknown Fund email settings action.',
      )
    }
    const limited = await limitSettingsAction(access.fundId, user.id, action)
    if (limited) return limited
    const adminAccess = await assertAdminAccess(admin, user.id)
    if (adminAccess instanceof NextResponse) return adminAccess
    const status = await getFundEmailConnectionStatus(admin, adminAccess.fundId)
    if (action === 'configure_inbound') {
      const configured = await configureFundEmailInboundSettings(admin, {
        fundId: adminAccess.fundId,
        actorUserId: user.id,
        slug: requiredExistingIdentity(status.emailSubdomain),
        receivingApiKey: requiredString(body.receivingApiKey),
        publicBaseUrl: publicBaseUrl(request),
      })
      await setInboundProvider(admin, adminAccess.fundId, 'resend')
      return NextResponse.json(configured)
    }
    if (action === 'recreate_inbound_webhook') {
      const current = await loadFundEmailReceivingConfiguration(
        admin,
        adminAccess.fundId,
      )
      if (!current) {
        throw new FundEmailError(
          'connection_not_found',
          'Fund email receiving is not configured.',
          404,
        )
      }
      return NextResponse.json(
        await configureFundEmailInboundSettings(admin, {
          fundId: adminAccess.fundId,
          actorUserId: user.id,
          slug: requiredExistingIdentity(status.emailSubdomain),
          receivingApiKey: current.receivingApiKey,
          publicBaseUrl: publicBaseUrl(request),
        }),
      )
    }
    if (action === 'refresh_status') {
      const connection = await loadFundEmailReceivingConfiguration(
        admin,
        adminAccess.fundId,
      )
      if (!connection)
        throw new FundEmailError(
          'connection_not_found',
          'Fund email is not configured.',
          404,
        )
      const inspected = await inspectResendFundDomain(
        connection.domain,
        connection.receivingApiKey,
      )
      const inspection = mergeResendFundDomainRefresh(
        status.sendingStatus ?? 'pending',
        inspected,
      )
      await persistResendFundDomainInspection(
        admin,
        adminAccess.fundId,
        inspection,
      )
      return NextResponse.json({ inspection })
    }
    throw new FundEmailError('invalid_configuration', 'Unsupported action.')
  } catch (error) {
    return emailError(error)
  }
}

export async function DELETE() {
  const context = await authenticatedContext()
  if (context instanceof NextResponse) return context
  const { admin, user } = context
  const access = await assertAdminAccess(admin, user.id)
  if (access instanceof NextResponse) return access
  try {
    const limited = await limitSettingsAction(
      access.fundId,
      user.id,
      'disconnect_inbound',
    )
    if (limited) return limited
    const [status, receiving] = await Promise.all([
      getFundEmailConnectionStatus(admin, access.fundId),
      loadFundEmailReceivingConfigurationForAdmin(admin, access.fundId),
    ])
    if (!receiving) {
      await setInboundProvider(admin, access.fundId, null)
      return NextResponse.json({ ok: true })
    }
    if (!status.updatedAt) throw new Error('Fund email revision unavailable')
    const expectedProviderWebhookId = receiving.providerWebhookId ?? null
    const disconnectRevision = await beginFundEmailReceivingDisconnect(admin, {
      fundId: access.fundId,
      actorUserId: user.id,
      expectedProviderWebhookId,
      expectedUpdatedAt: status.updatedAt,
    })
    if (!disconnectRevision) throw connectionChangedDuringDelete()
    if (receiving.providerWebhookId) {
      await removeResendWebhook(
        receiving.receivingApiKey,
        receiving.providerWebhookId,
      )
    }
    const disconnected = await finalizeFundEmailReceivingDisconnect(admin, {
      fundId: access.fundId,
      actorUserId: user.id,
      expectedProviderWebhookId,
      expectedUpdatedAt: disconnectRevision,
    })
    if (!disconnected) throw connectionChangedDuringDelete()
    await setInboundProvider(admin, access.fundId, null)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return emailError(error)
  }
}

async function setInboundProvider(
  admin: ReturnType<typeof createAdminClient>,
  fundId: string,
  provider: 'resend' | null,
): Promise<void> {
  const values =
    provider === 'resend'
      ? { inbound_email_provider: 'resend' as const }
      : { inbound_email_provider: null }
  let update = admin
    .from('fund_settings')
    .update(values)
    .eq('fund_id', fundId)
  if (provider === null) {
    update = update.eq('inbound_email_provider', 'resend')
  }
  const result = await update
  if (result.error) throw new Error('Inbound provider status unavailable')
}

async function limitSettingsAction(
  fundId: string,
  userId: string,
  action: string,
): Promise<NextResponse | null> {
  return rateLimit({
    key: `fund-email-settings:${fundId}:${userId}:${action}`,
    limit: action === 'refresh_status' ? 30 : 10,
    windowSeconds: 300,
    databaseFailure: 'deny',
  })
}

function connectionChangedDuringDelete(): FundEmailError {
  return new FundEmailError(
    'connection_conflict',
    'Fund email changed while it was being disconnected. Retry the operation.',
    409,
  )
}

function requiredExistingIdentity(existing: string | null): string {
  if (!existing) {
    throw new FundEmailError(
      'invalid_configuration',
      'Fund email identity must be reserved during Fund creation.',
      409,
    )
  }
  return existing
}

async function authenticatedContext() {
  const auth = createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return { admin: createAdminClient(), user }
}

async function readBoundedJson(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  ) {
    throw new FundEmailError(
      'invalid_configuration',
      'Content-Type must be application/json.',
    )
  }
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > MAX_SETTINGS_BODY_BYTES) {
    throw new FundEmailError(
      'invalid_configuration',
      'Request body is too large.',
      413,
    )
  }
  const raw = await request.text()
  if (Buffer.byteLength(raw, 'utf8') > MAX_SETTINGS_BODY_BYTES) {
    throw new FundEmailError(
      'invalid_configuration',
      'Request body is too large.',
      413,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new FundEmailError('invalid_configuration', 'Invalid JSON.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FundEmailError(
      'invalid_configuration',
      'A JSON object is required.',
    )
  }
  return parsed as Record<string, unknown>
}

function requiredString(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 1024 ||
    /[\0\r\n]/.test(value)
  ) {
    throw new FundEmailError(
      'invalid_configuration',
      'A required Fund email field is invalid.',
    )
  }
  return value.trim()
}

function publicBaseUrl(request: NextRequest): string {
  return resolveFundEmailWebhookBaseUrl(request.nextUrl.origin)
}

function emailError(error: unknown): NextResponse {
  if (error instanceof FundEmailError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    )
  }
  return NextResponse.json(
    { error: 'Fund email settings are temporarily unavailable.' },
    { status: 500 },
  )
}
