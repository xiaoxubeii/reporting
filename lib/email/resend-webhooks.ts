import { createHash } from 'node:crypto'
import { Resend } from 'resend'
import { FundEmailError } from './errors'

export interface ResendInboundWebhookRegistration {
  id: string
  signingSecret: string
}

export interface ResendInboundWebhookOptions {
  endpoint: string
  events: ['email.received']
}

interface ResendWebhookProviderDependencies {
  create(
    apiKey: string,
    options: ResendInboundWebhookOptions,
  ): Promise<{ data?: { id?: unknown; signing_secret?: unknown } | null; error?: unknown }>
  remove(
    apiKey: string,
    webhookId: string,
  ): Promise<{ data?: { id?: unknown; deleted?: unknown } | null; error?: unknown }>
  get(
    apiKey: string,
    webhookId: string,
  ): Promise<{
    data?: {
      id?: unknown
      endpoint?: unknown
      signing_secret?: unknown
      status?: unknown
      events?: unknown
    } | null
    error?: unknown
  }>
  list(
    apiKey: string,
    options: { limit: 100 },
  ): Promise<{
    data?: { data?: unknown; has_more?: unknown } | null
    error?: unknown
  }>
  update(
    apiKey: string,
    webhookId: string,
    options: ResendInboundWebhookOptions & { status: 'enabled' },
  ): Promise<{ data?: { id?: unknown } | null; error?: unknown }>
}

const defaultDependencies: ResendWebhookProviderDependencies = {
  create: async (apiKey, options) => await new Resend(apiKey).webhooks.create(options),
  remove: async (apiKey, webhookId) => await new Resend(apiKey).webhooks.remove(webhookId),
  get: async (apiKey, webhookId) => await new Resend(apiKey).webhooks.get(webhookId),
  list: async (apiKey, options) => await new Resend(apiKey).webhooks.list(options),
  update: async (apiKey, webhookId, options) => (
    await new Resend(apiKey).webhooks.update(webhookId, options)
  ),
}

export interface ResendRefreshedInboundWebhook extends ResendInboundWebhookRegistration {
  routeToken: string
}

export async function createResendInboundWebhook(
  apiKeyInput: string,
  options: ResendInboundWebhookOptions,
  dependencies: ResendWebhookProviderDependencies = defaultDependencies,
): Promise<ResendInboundWebhookRegistration> {
  const apiKey = validApiKey(apiKeyInput)
  let response: Awaited<ReturnType<ResendWebhookProviderDependencies['create']>>
  try {
    response = await dependencies.create(apiKey, options)
  } catch {
    throw providerUnavailable()
  }
  const id = response.data?.id
  const signingSecret = response.data?.signing_secret
  if (
    response.error
    || typeof id !== 'string'
    || !validProviderValue(id, 200)
    || typeof signingSecret !== 'string'
    || !validProviderValue(signingSecret, 2048)
  ) {
    throw providerUnavailable()
  }
  return { id, signingSecret }
}

export async function removeResendWebhook(
  apiKeyInput: string,
  webhookIdInput: string,
  dependencies: ResendWebhookProviderDependencies = defaultDependencies,
): Promise<void> {
  const apiKey = validApiKey(apiKeyInput)
  const webhookId = webhookIdInput.trim()
  if (!validProviderValue(webhookId, 200)) throw providerUnavailable()
  let response: Awaited<ReturnType<ResendWebhookProviderDependencies['remove']>>
  try {
    response = await dependencies.remove(apiKey, webhookId)
  } catch {
    throw providerUnavailable()
  }
  if (isProviderNotFound(response.error)) return
  if (response.error || response.data?.deleted !== true || response.data.id !== webhookId) {
    throw providerUnavailable()
  }
}

export async function refreshResendInboundWebhook(
  apiKeyInput: string,
  webhookIdInput: string | null,
  expectedRouteTokenHash: string,
  endpointBaseUrl: string,
  dependencies: ResendWebhookProviderDependencies = defaultDependencies,
): Promise<ResendRefreshedInboundWebhook | null> {
  const apiKey = validApiKey(apiKeyInput)
  if (!/^[a-f0-9]{64}$/.test(expectedRouteTokenHash)) throw providerUnavailable()

  const current = webhookIdInput
    ? await getWebhook(apiKey, webhookIdInput, dependencies)
    : await findWebhookByRouteHash(apiKey, expectedRouteTokenHash, dependencies)
  if (!current) {
    if (webhookIdInput) throw providerUnavailable()
    return null
  }
  if (hashRouteToken(current.routeToken) !== expectedRouteTokenHash) throw providerUnavailable()

  return await updateManagedWebhook(apiKey, current, endpointBaseUrl, dependencies)
}

export async function recoverResendInboundWebhook(
  apiKeyInput: string,
  endpointBaseUrl: string,
  dependencies: ResendWebhookProviderDependencies = defaultDependencies,
): Promise<ResendRefreshedInboundWebhook | null> {
  const apiKey = validApiKey(apiKeyInput)
  inboundEndpoint(endpointBaseUrl, 'A'.repeat(43))
  const candidates: Array<{ id: string; routeToken: string }> = []

  for (const row of await listWebhooks(apiKey, dependencies)) {
    if (!row || typeof row !== 'object') continue
    const id = 'id' in row ? row.id : null
    const endpoint = 'endpoint' in row ? row.endpoint : null
    if (typeof id !== 'string' || typeof endpoint !== 'string') continue
    const routeToken = endpointRouteToken(endpoint)
    if (
      routeToken
      && endpoint === inboundEndpoint(endpointBaseUrl, routeToken)
      && validProviderValue(id, 200)
    ) {
      candidates.push({ id, routeToken })
    }
  }

  if (candidates.length === 0) return null
  if (candidates.length !== 1) throw providerUnavailable()
  const candidate = candidates[0]
  const current = await getWebhook(apiKey, candidate.id, dependencies)
  if (
    !current
    || current.routeToken !== candidate.routeToken
    || current.endpoint !== inboundEndpoint(endpointBaseUrl, candidate.routeToken)
  ) {
    throw providerUnavailable()
  }
  return await updateManagedWebhook(apiKey, current, endpointBaseUrl, dependencies)
}

async function updateManagedWebhook(
  apiKey: string,
  current: SafeWebhook,
  endpointBaseUrl: string,
  dependencies: ResendWebhookProviderDependencies,
): Promise<ResendRefreshedInboundWebhook> {
  const expectedEndpoint = inboundEndpoint(endpointBaseUrl, current.routeToken)

  let updated: Awaited<ReturnType<ResendWebhookProviderDependencies['update']>>
  try {
    updated = await dependencies.update(apiKey, current.id, {
      endpoint: expectedEndpoint,
      events: ['email.received'],
      status: 'enabled',
    })
  } catch {
    throw providerUnavailable()
  }
  if (updated.error || updated.data?.id !== current.id) throw providerUnavailable()

  const refreshed = await getWebhook(apiKey, current.id, dependencies)
  if (
    !refreshed
    || refreshed.endpoint !== expectedEndpoint
    || refreshed.routeToken !== current.routeToken
    || refreshed.status !== 'enabled'
    || refreshed.events.length !== 1
    || refreshed.events[0] !== 'email.received'
  ) {
    throw providerUnavailable()
  }
  return {
    id: refreshed.id,
    signingSecret: refreshed.signingSecret,
    routeToken: refreshed.routeToken,
  }
}

function inboundEndpoint(baseInput: string, routeToken: string): string {
  let base: URL
  try {
    base = new URL(baseInput)
  } catch {
    throw providerUnavailable()
  }
  const hostname = base.hostname.toLowerCase()
  const loopback = hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
  if (
    (base.protocol !== 'https:' && !(base.protocol === 'http:' && loopback))
    || base.username
    || base.password
    || base.pathname !== '/'
    || base.search
    || base.hash
  ) {
    throw providerUnavailable()
  }
  base.pathname = `/api/inbound-email/resend/${routeToken}`
  return base.toString().replace(/\/$/, '')
}

interface SafeWebhook {
  id: string
  endpoint: string
  routeToken: string
  signingSecret: string
  status: 'enabled' | 'disabled'
  events: string[]
}

async function findWebhookByRouteHash(
  apiKey: string,
  expectedRouteTokenHash: string,
  dependencies: ResendWebhookProviderDependencies,
): Promise<SafeWebhook | null> {
  const rows = await listWebhooks(apiKey, dependencies)
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const id = 'id' in row ? row.id : null
    const endpoint = 'endpoint' in row ? row.endpoint : null
    if (typeof id !== 'string' || typeof endpoint !== 'string') continue
    const routeToken = endpointRouteToken(endpoint)
    if (routeToken && hashRouteToken(routeToken) === expectedRouteTokenHash) {
      return await getWebhook(apiKey, id, dependencies)
    }
  }
  return null
}

async function listWebhooks(
  apiKey: string,
  dependencies: ResendWebhookProviderDependencies,
): Promise<unknown[]> {
  let response: Awaited<ReturnType<ResendWebhookProviderDependencies['list']>>
  try {
    response = await dependencies.list(apiKey, { limit: 100 })
  } catch {
    throw providerUnavailable()
  }
  const rows = response.data?.data
  if (
    response.error
    || !Array.isArray(rows)
    || rows.length > 100
    || response.data?.has_more !== false
  ) {
    throw providerUnavailable()
  }
  return rows
}

async function getWebhook(
  apiKey: string,
  webhookIdInput: string,
  dependencies: ResendWebhookProviderDependencies,
): Promise<SafeWebhook | null> {
  const webhookId = webhookIdInput.trim()
  if (!validProviderValue(webhookId, 200)) throw providerUnavailable()
  let response: Awaited<ReturnType<ResendWebhookProviderDependencies['get']>>
  try {
    response = await dependencies.get(apiKey, webhookId)
  } catch {
    throw providerUnavailable()
  }
  if (isProviderNotFound(response.error)) return null
  const data = response.data
  const routeToken = typeof data?.endpoint === 'string'
    ? endpointRouteToken(data.endpoint)
    : null
  if (
    response.error
    || data?.id !== webhookId
    || typeof data.endpoint !== 'string'
    || !routeToken
    || typeof data.signing_secret !== 'string'
    || !validProviderValue(data.signing_secret, 2048)
    || (data.status !== 'enabled' && data.status !== 'disabled')
    || !Array.isArray(data.events)
    || !data.events.every(event => typeof event === 'string')
  ) {
    throw providerUnavailable()
  }
  return {
    id: webhookId,
    endpoint: data.endpoint,
    routeToken,
    signingSecret: data.signing_secret,
    status: data.status,
    events: data.events,
  }
}

function endpointRouteToken(endpoint: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(endpoint)
  } catch {
    return null
  }
  const match = parsed.pathname.match(/^\/api\/inbound-email\/resend\/([A-Za-z0-9_-]{43,128})$/)
  if (!match || parsed.search || parsed.hash) return null
  return match[1]
}

function hashRouteToken(routeToken: string): string {
  return createHash('sha256').update(routeToken, 'utf8').digest('hex')
}

function isProviderNotFound(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && (
      ('name' in error && error.name === 'not_found')
      || ('statusCode' in error && error.statusCode === 404)
    )
  )
}

function validApiKey(value: string): string {
  const apiKey = value.trim()
  if (!validProviderValue(apiKey, 512)) {
    throw new FundEmailError('invalid_configuration', 'A valid Resend Full Access API key is required.')
  }
  return apiKey
}

function validProviderValue(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength && !/[\r\n\0]/.test(value)
}

function providerUnavailable(): FundEmailError {
  return new FundEmailError(
    'credential_unavailable',
    'Resend could not configure the inbound webhook. Verify the Full Access key and try again.',
    400,
  )
}
