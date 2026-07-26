import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveFundEmailDomain, normalizeFundEmailSlug } from './domain'
import {
  generateFundEmailRouteToken,
  loadFundEmailReceivingConfiguration,
  rotateFundEmailWebhookRoute,
  saveFundEmailIdentity,
  saveFundEmailReceivingConfiguration,
  saveFundEmailSendingConfiguration,
  saveFundEmailConnection,
} from './fund-credentials'
import {
  inspectResendFundDomain,
  persistResendFundDomainInspection,
  type ResendFundDomainInspection,
} from './resend-domain'
import {
  createResendInboundWebhook,
  recoverResendInboundWebhook,
  refreshResendInboundWebhook,
  removeResendWebhook,
  type ResendInboundWebhookOptions,
  type ResendInboundWebhookRegistration,
} from './resend-webhooks'

export interface FundEmailSettingsDependencies {
  inspectDomain(
    domain: string,
    receivingApiKey: string,
  ): Promise<ResendFundDomainInspection>
  saveConnection: typeof saveFundEmailConnection
  persistInspection: typeof persistResendFundDomainInspection
  rotateRoute: typeof rotateFundEmailWebhookRoute
}

export interface FundEmailIdentitySettingsDependencies {
  saveIdentity: typeof saveFundEmailIdentity
}

const defaultDependencies: FundEmailSettingsDependencies = {
  inspectDomain: inspectResendFundDomain,
  saveConnection: saveFundEmailConnection,
  persistInspection: persistResendFundDomainInspection,
  rotateRoute: rotateFundEmailWebhookRoute,
}

export interface FundEmailOutboundSettingsDependencies {
  saveSendingConfiguration: typeof saveFundEmailSendingConfiguration
}

export interface FundEmailInboundSettingsDependencies {
  inspectDomain(
    domain: string,
    receivingApiKey: string,
  ): Promise<ResendFundDomainInspection>
  createWebhook(
    receivingApiKey: string,
    options: ResendInboundWebhookOptions,
  ): Promise<ResendInboundWebhookRegistration>
  refreshWebhook(
    receivingApiKey: string,
    providerWebhookId: string | null,
    expectedRouteTokenHash: string,
    endpointBaseUrl: string,
  ): Promise<(ResendInboundWebhookRegistration & { routeToken: string }) | null>
  recoverWebhook(
    receivingApiKey: string,
    endpointBaseUrl: string,
  ): Promise<(ResendInboundWebhookRegistration & { routeToken: string }) | null>
  saveReceivingConfiguration: typeof saveFundEmailReceivingConfiguration
  loadReceivingConfiguration: typeof loadFundEmailReceivingConfiguration
  removeWebhook(receivingApiKey: string, webhookId: string): Promise<void>
  generateRouteToken(): string
}

const defaultOutboundDependencies: FundEmailOutboundSettingsDependencies = {
  saveSendingConfiguration: saveFundEmailSendingConfiguration,
}

const defaultIdentityDependencies: FundEmailIdentitySettingsDependencies = {
  saveIdentity: saveFundEmailIdentity,
}

export async function configureFundEmailIdentity(
  admin: SupabaseClient,
  params: { fundId: string; actorUserId: string; slug: string },
  dependencies: FundEmailIdentitySettingsDependencies = defaultIdentityDependencies,
): Promise<{ domain: string }> {
  const slug = normalizeFundEmailSlug(params.slug)
  const domain = deriveFundEmailDomain(slug)
  const saved = await dependencies.saveIdentity(admin, { ...params, slug })
  if (saved.domain !== domain) throw new Error('Fund email domain mismatch')
  return { domain }
}

const defaultInboundDependencies: FundEmailInboundSettingsDependencies = {
  inspectDomain: inspectResendFundDomain,
  createWebhook: createResendInboundWebhook,
  recoverWebhook: recoverResendInboundWebhook,
  refreshWebhook: refreshResendInboundWebhook,
  saveReceivingConfiguration: saveFundEmailReceivingConfiguration,
  loadReceivingConfiguration: loadFundEmailReceivingConfiguration,
  removeWebhook: removeResendWebhook,
  generateRouteToken: generateFundEmailRouteToken,
}

export async function configureFundEmailOutboundSettings(
  admin: SupabaseClient,
  params: {
    fundId: string
    actorUserId: string
    slug: string
    sendingApiKey: string
  },
  dependencies: FundEmailOutboundSettingsDependencies = defaultOutboundDependencies,
): Promise<{ domain: string }> {
  const slug = normalizeFundEmailSlug(params.slug)
  const domain = deriveFundEmailDomain(slug)
  const saved = await dependencies.saveSendingConfiguration(admin, {
    fundId: params.fundId,
    actorUserId: params.actorUserId,
    slug,
    sendingApiKey: params.sendingApiKey,
  })
  if (saved.domain !== domain) throw new Error('Fund email domain mismatch')
  return { domain }
}

export async function configureFundEmailInboundSettings(
  admin: SupabaseClient,
  params: {
    fundId: string
    actorUserId: string
    slug: string
    receivingApiKey: string
    publicBaseUrl: string
  },
  dependencies: FundEmailInboundSettingsDependencies = defaultInboundDependencies,
): Promise<{
  domain: string
  webhookConfigured: true
  inspection: ResendFundDomainInspection
}> {
  const publicBaseUrl = validateFundEmailWebhookBaseUrl(params.publicBaseUrl)
  const slug = normalizeFundEmailSlug(params.slug)
  const domain = deriveFundEmailDomain(slug)
  const receivingApiKey = params.receivingApiKey.trim()
  const previous = await dependencies.loadReceivingConfiguration(
    admin,
    params.fundId,
  )
  if (previous && !previous.routeTokenHash) {
    throw new Error('Fund email route token is unavailable')
  }
  const inspection = await dependencies.inspectDomain(domain, receivingApiKey)
  const refreshed = previous
    ? await dependencies.refreshWebhook(
        receivingApiKey,
        previous.providerWebhookId ?? null,
        previous.routeTokenHash!,
        publicBaseUrl,
      )
    : await dependencies.recoverWebhook(receivingApiKey, publicBaseUrl)
  const routeToken = refreshed?.routeToken ?? dependencies.generateRouteToken()
  const registration =
    refreshed ??
    (await dependencies.createWebhook(receivingApiKey, {
      endpoint: webhookUrl(publicBaseUrl, routeToken),
      events: ['email.received'],
    }))

  try {
    await dependencies.saveReceivingConfiguration(admin, {
      fundId: params.fundId,
      actorUserId: params.actorUserId,
      slug,
      receivingApiKey,
      webhookSecret: registration.signingSecret,
      routeToken,
      providerWebhookId: registration.id,
      expectedProviderWebhookId: previous?.providerWebhookId ?? null,
      expectedUpdatedAt: previous?.updatedAt ?? null,
      inspection,
    })
  } catch (error) {
    if (!refreshed) {
      await ignoreWebhookCleanupFailure(
        dependencies.removeWebhook(receivingApiKey, registration.id),
      )
    }
    throw error
  }

  return { domain, webhookConfigured: true, inspection }
}

export function resolveFundEmailWebhookBaseUrl(
  requestOrigin: string,
  environment: {
    FUND_EMAIL_WEBHOOK_BASE_URL?: string
    NEXT_PUBLIC_SITE_URL?: string
  } = {
    FUND_EMAIL_WEBHOOK_BASE_URL: process.env.FUND_EMAIL_WEBHOOK_BASE_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
): string {
  const configured =
    environment.FUND_EMAIL_WEBHOOK_BASE_URL?.trim() ||
    environment.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured

  const fallback = new URL(validateFundEmailWebhookBaseUrl(requestOrigin))
  const hostname = fallback.hostname.toLowerCase()
  const loopback =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  if (!loopback) {
    throw new Error('A server-configured public webhook origin is required')
  }
  return fallback.origin
}

export async function configureFundEmailSettings(
  admin: SupabaseClient,
  params: {
    fundId: string
    actorUserId: string
    slug: string
    sendingApiKey: string
    receivingApiKey: string
    webhookSecret: string
    publicBaseUrl: string
  },
  dependencies: FundEmailSettingsDependencies = defaultDependencies,
): Promise<{
  domain: string
  webhookUrl: string
  inspection: ResendFundDomainInspection
}> {
  const publicBaseUrl = validateFundEmailWebhookBaseUrl(params.publicBaseUrl)
  const slug = normalizeFundEmailSlug(params.slug)
  const domain = deriveFundEmailDomain(slug)
  const inspection = await dependencies.inspectDomain(
    domain,
    params.receivingApiKey.trim(),
  )
  const saved = await dependencies.saveConnection(admin, {
    fundId: params.fundId,
    actorUserId: params.actorUserId,
    slug,
    sendingApiKey: params.sendingApiKey,
    receivingApiKey: params.receivingApiKey,
    webhookSecret: params.webhookSecret,
  })
  if (saved.domain !== domain) throw new Error('Fund email domain mismatch')
  await dependencies.persistInspection(admin, params.fundId, inspection)
  return {
    domain,
    webhookUrl: webhookUrl(publicBaseUrl, saved.routeToken),
    inspection,
  }
}

export async function rotateFundEmailRouteForSettings(
  admin: SupabaseClient,
  params: { fundId: string; actorUserId: string; publicBaseUrl: string },
  dependencies: FundEmailSettingsDependencies = defaultDependencies,
): Promise<{ webhookUrl: string }> {
  const publicBaseUrl = validateFundEmailWebhookBaseUrl(params.publicBaseUrl)
  const rotated = await dependencies.rotateRoute(
    admin,
    params.fundId,
    params.actorUserId,
  )
  return { webhookUrl: webhookUrl(publicBaseUrl, rotated.routeToken) }
}

export function validateFundEmailWebhookBaseUrl(baseInput: string): string {
  let base: URL
  try {
    base = new URL(baseInput)
  } catch {
    throw new Error('A secure public application origin is required')
  }
  const hostname = base.hostname.toLowerCase()
  const loopback =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  const allowedProtocol =
    base.protocol === 'https:' || (base.protocol === 'http:' && loopback)
  const bareOrigin =
    !base.username &&
    !base.password &&
    base.pathname === '/' &&
    !base.search &&
    !base.hash
  if (!allowedProtocol || !bareOrigin) {
    throw new Error('A secure public application origin is required')
  }
  return base.origin
}

function webhookUrl(baseInput: string, routeToken: string): string {
  const base = new URL(validateFundEmailWebhookBaseUrl(baseInput))
  base.pathname = `/api/inbound-email/resend/${routeToken}`
  base.search = ''
  base.hash = ''
  return base.toString().replace(/\/$/, '')
}

async function ignoreWebhookCleanupFailure(
  cleanup: Promise<void>,
): Promise<void> {
  try {
    await cleanup
  } catch {
    console.error(
      '[fund-email] failed to remove an unpersisted Resend webhook; the next setup attempt will recover it',
    )
  }
}
