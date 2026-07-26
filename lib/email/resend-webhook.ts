import type { FundEmailReceivingConfiguration } from './fund-credentials'
import type {
  FundEmailInboundRoutingResult,
} from './inbound-routing'
import {
  FundEmailInboundError,
  type ResendReceivedEventData,
  type RetrievedResendInboundEmail,
} from './resend-inbound'

const MAX_WEBHOOK_BYTES = 256 * 1024

interface SvixHeaders {
  id: string
  timestamp: string
  signature: string
}

interface VerifiedWebhookEvent {
  type: string
  created_at?: string
  data?: unknown
}

export interface ResendWebhookClaim {
  id: string
  attemptId: string
}

export interface ResendWebhookDependencies {
  resolveConnection(routeToken: string): Promise<FundEmailReceivingConfiguration | null>
  verify(
    rawBody: string,
    headers: SvixHeaders,
    webhookSecret: string,
  ): VerifiedWebhookEvent
  claim(input: {
    routeToken: string
    svixId: string
    providerEmailId: string
  }): Promise<ResendWebhookClaim | null>
  retrieve(
    connection: FundEmailReceivingConfiguration,
    event: ResendReceivedEventData,
  ): Promise<RetrievedResendInboundEmail>
  route(
    connection: FundEmailReceivingConfiguration,
    email: RetrievedResendInboundEmail,
  ): Promise<FundEmailInboundRoutingResult>
  materializeAttachments(
    connection: FundEmailReceivingConfiguration,
    email: RetrievedResendInboundEmail,
    routing: FundEmailInboundRoutingResult,
  ): Promise<{
    email: RetrievedResendInboundEmail
    routing: FundEmailInboundRoutingResult
  }>
  persist(
    connection: FundEmailReceivingConfiguration,
    email: RetrievedResendInboundEmail,
    routing: FundEmailInboundRoutingResult,
  ): Promise<void>
  complete(
    eventId: string,
    attemptId: string,
    disposition: 'routed' | 'unroutable' | 'quarantined' | 'ignored',
  ): Promise<boolean>
  fail(eventId: string, attemptId: string, errorCode: string): Promise<boolean>
}

export interface ResendWebhookResult {
  status: number
  body: Record<string, boolean | string>
}

export async function handleResendInboundWebhook(
  request: Request,
  routeToken: string,
  dependencies: ResendWebhookDependencies,
): Promise<ResendWebhookResult> {
  let connection: FundEmailReceivingConfiguration | null
  try {
    connection = await dependencies.resolveConnection(routeToken)
  } catch {
    connection = null
  }
  if (!connection) return errorResult(404, 'route_not_found')

  const svixHeaders = readSvixHeaders(request.headers)
  if (!svixHeaders) return errorResult(400, 'signature_headers_missing')

  let rawBody: string
  try {
    rawBody = await readBoundedRawBody(request, MAX_WEBHOOK_BYTES)
  } catch (error) {
    return error instanceof RawBodyTooLargeError
      ? errorResult(413, 'payload_too_large')
      : errorResult(400, 'payload_invalid')
  }

  let verified: VerifiedWebhookEvent
  try {
    verified = dependencies.verify(rawBody, svixHeaders, connection.webhookSecret)
  } catch {
    return errorResult(401, 'invalid_signature')
  }

  if (verified.type !== 'email.received') {
    return { status: 200, body: { ok: true, ignored: true } }
  }
  const event = validateReceivedEvent(verified.data)
  if (!event) return errorResult(400, 'payload_invalid')

  let claim: ResendWebhookClaim | null
  try {
    claim = await dependencies.claim({
      routeToken,
      svixId: svixHeaders.id,
      providerEmailId: event.email_id,
    })
  } catch {
    return errorResult(503, 'temporarily_unavailable')
  }
  if (!claim) return { status: 200, body: { ok: true, duplicate: true } }

  try {
    const email = await dependencies.retrieve(connection, event)
    const routing = await dependencies.route(connection, email)
    const materialized = await dependencies.materializeAttachments(connection, email, routing)
    await dependencies.persist(connection, materialized.email, materialized.routing)
    const completed = await dependencies.complete(
      claim.id,
      claim.attemptId,
      materialized.routing.disposition,
    )
    if (!completed) throw new Error('Webhook lease was lost')
    return { status: 200, body: { ok: true } }
  } catch (error) {
    if (error instanceof FundEmailInboundError && !error.retryable) {
      const completed = await safelyCompleteAsQuarantined(dependencies, claim)
      return completed
        ? { status: 200, body: { ok: true, quarantined: true } }
        : errorResult(503, 'temporarily_unavailable')
    }
    const errorCode = error instanceof FundEmailInboundError
      ? error.code
      : 'inbound_processing_failed'
    await safelyFail(dependencies, claim, errorCode)
    return errorResult(503, 'temporarily_unavailable')
  }
}

async function safelyCompleteAsQuarantined(
  dependencies: ResendWebhookDependencies,
  claim: ResendWebhookClaim,
): Promise<boolean> {
  try {
    return await dependencies.complete(claim.id, claim.attemptId, 'quarantined')
  } catch {
    return false
  }
}

async function safelyFail(
  dependencies: ResendWebhookDependencies,
  claim: ResendWebhookClaim,
  errorCode: string,
): Promise<void> {
  try {
    await dependencies.fail(claim.id, claim.attemptId, errorCode)
  } catch {
    // The original retryable response is still returned. A lease timeout makes
    // the same provider event claimable again without exposing provider data.
  }
}

function readSvixHeaders(headers: Headers): SvixHeaders | null {
  const id = headers.get('svix-id')?.trim()
  const timestamp = headers.get('svix-timestamp')?.trim()
  const signature = headers.get('svix-signature')?.trim()
  if (!id || !timestamp || !signature) return null
  if (id.length > 240 || timestamp.length > 64 || signature.length > 2048) return null
  return { id, timestamp, signature }
}

class RawBodyTooLargeError extends Error {}

async function readBoundedRawBody(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new RawBodyTooLargeError()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function validateReceivedEvent(input: unknown): ResendReceivedEventData | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (
    typeof value.email_id !== 'string'
    || typeof value.created_at !== 'string'
    || typeof value.from !== 'string'
    || typeof value.message_id !== 'string'
    || typeof value.subject !== 'string'
    || !Array.isArray(value.to)
    || !Array.isArray(value.cc)
    || !Array.isArray(value.bcc)
    || !Array.isArray(value.attachments)
  ) return null
  return value as unknown as ResendReceivedEventData
}

function errorResult(status: number, error: string): ResendWebhookResult {
  return { status, body: { ok: false, error } }
}
