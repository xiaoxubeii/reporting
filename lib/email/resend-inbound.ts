import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { scanFileAsync } from '@/lib/security/scan-file'
import type { FundEmailReceivingConfiguration } from './fund-credentials'
import type { FundEmailInboundRoutingResult } from './inbound-routing'

const MAX_TEXT_BYTES = 1024 * 1024
const MAX_HTML_BYTES = 2 * 1024 * 1024
const MAX_ATTACHMENTS = 10
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024
const ATTACHMENT_HOST = 'inbound-cdn.resend.com'
const ATTACHMENT_BUCKET = 'fund-email-inbound-attachments'

export interface ResendReceivedAttachmentMetadata {
  id: string
  filename: string | null
  size?: number
  content_type: string
  content_disposition: string | null
  content_id: string | null
}

export interface ResendReceivedEventData {
  email_id: string
  created_at: string
  from: string
  to: string[]
  bcc: string[]
  cc: string[]
  message_id: string
  subject: string
  attachments: ResendReceivedAttachmentMetadata[]
}

export interface StoredResendInboundAttachment {
  id: string
  filename: string
  size: number
  contentType: string
  contentDisposition: string | null
  contentId: string | null
  storagePath: string
}

export interface RetrievedResendInboundEmail {
  providerEmailId: string
  internetMessageId: string
  from: string
  to: string[]
  cc: string[]
  bcc: string[]
  replyTo: string[]
  subject: string
  text: string | null
  htmlUntrusted: string | null
  inReplyTo: string | null
  references: string[]
  receivedAt: string
  attachments: StoredResendInboundAttachment[]
  attachmentManifest?: ResendReceivedAttachmentMetadata[]
  quarantineReason: string | null
}

type InboundErrorCode =
  | 'inbound_provider_unavailable'
  | 'inbound_identity_mismatch'
  | 'inbound_header_invalid'
  | 'inbound_content_oversized'

export class FundEmailInboundError extends Error {
  constructor(
    public readonly code: InboundErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'FundEmailInboundError'
  }
}

interface StoreAttachmentInput {
  fundId: string
  mailboxId: string
  providerEmailId: string
  attachmentId: string
  index: number
  filename: string
  contentType: string
  bytes: Buffer
}

interface ResendInboundDependencies {
  getEmail?: (receivingApiKey: string, emailId: string) => Promise<ResendGetEmailResponse>
  listAttachments?: (
    receivingApiKey: string,
    emailId: string,
  ) => Promise<ResendListAttachmentsResponse>
  download?: (url: string, expectedBytes: number) => Promise<Buffer>
  scan?: (
    bytes: Buffer,
    filename: string,
    contentType: string,
  ) => Promise<{ safe: boolean; reason?: string }>
  storeAttachment?: (input: StoreAttachmentInput) => Promise<string>
  deleteAttachment?: (storagePath: string) => Promise<void>
}

interface ResendFetchedEmail {
  id?: unknown
  created_at?: unknown
  from?: unknown
  to?: unknown
  bcc?: unknown
  cc?: unknown
  reply_to?: unknown
  message_id?: unknown
  subject?: unknown
  text?: unknown
  html?: unknown
  headers?: unknown
  attachments?: unknown[]
}

interface ResendListedAttachment {
  id: string
  filename?: string | null
  size: number
  content_type: string
  content_disposition?: string | null
  content_id?: string | null
  download_url: string
}

interface ResendGetEmailResponse {
  data?: ResendFetchedEmail | null
  error?: unknown
}

interface ResendListAttachmentsResponse {
  data?: { data?: ResendListedAttachment[]; has_more?: unknown } | null
  error?: unknown
}

interface PendingAttachment {
  id: string
  filename: string
  size: number
  contentType: string
  contentDisposition: string | null
  contentId: string | null
  bytes: Buffer
}

export async function retrieveResendInboundEmail(
  admin: SupabaseClient,
  connection: FundEmailReceivingConfiguration,
  event: ResendReceivedEventData,
  dependencies: ResendInboundDependencies = {},
): Promise<RetrievedResendInboundEmail> {
  const getEmail = dependencies.getEmail ?? defaultGetEmail
  let response: ResendGetEmailResponse
  try {
    response = await getEmail(connection.receivingApiKey, event.email_id)
  } catch {
    throw providerUnavailable()
  }
  if (response?.error || !response?.data) throw providerUnavailable()
  const fetched = response.data
  validateSignedAndFetchedIdentity(connection.domain, event, fetched)

  const headers = normalizeHeaders(fetched.headers)
  const internetMessageId = assertMessageId(fetched.message_id)
  const headerMessageId = headers.get('message-id')
  if (headerMessageId && assertMessageId(headerMessageId) !== internetMessageId) {
    throw identityMismatch()
  }
  const inReplyTo = headers.has('in-reply-to')
    ? assertMessageId(headers.get('in-reply-to') as string)
    : null
  const references = headers.has('references')
    ? parseReferences(headers.get('references') as string)
    : []
  const text = boundedNullableBody(fetched.text, MAX_TEXT_BYTES)
  const htmlUntrusted = boundedNullableBody(fetched.html, MAX_HTML_BYTES)
  const base: RetrievedResendInboundEmail = {
    providerEmailId: event.email_id,
    internetMessageId,
    from: safeHeader(fetched.from, 320),
    to: normalizeAddressList(fetched.to, 50),
    cc: normalizeAddressList(fetched.cc ?? [], 50),
    bcc: normalizeAddressList(fetched.bcc ?? [], 50),
    replyTo: normalizeAddressList(fetched.reply_to ?? [], 50),
    subject: safeHeader(fetched.subject, 998),
    text,
    htmlUntrusted,
    inReplyTo,
    references,
    receivedAt: validTimestamp(fetched.created_at),
    attachments: [],
    attachmentManifest: [],
    quarantineReason: null,
  }

  if ((event.attachments ?? []).length === 0) return base
  if (event.attachments.length > MAX_ATTACHMENTS || (fetched.attachments?.length ?? 0) > MAX_ATTACHMENTS) {
    return quarantine(base, 'attachment_limit_exceeded')
  }
  if (!sameAttachmentMetadata(event.attachments, fetched.attachments ?? [])) {
    throw identityMismatch()
  }

  return {
    ...base,
    attachmentManifest: event.attachments.map(attachment => ({ ...attachment })),
  }
}

export async function materializeResendInboundAttachments(
  admin: SupabaseClient,
  connection: FundEmailReceivingConfiguration,
  email: RetrievedResendInboundEmail,
  routing: FundEmailInboundRoutingResult,
  dependencies: ResendInboundDependencies = {},
): Promise<RetrievedResendInboundEmail> {
  const manifest = email.attachmentManifest ?? []
  if (routing.disposition !== 'routed' || email.quarantineReason || manifest.length === 0) {
    return { ...email, attachments: [...email.attachments] }
  }

  const listAttachments = dependencies.listAttachments ?? defaultListAttachments
  let listedResponse: ResendListAttachmentsResponse
  try {
    listedResponse = await listAttachments(connection.receivingApiKey, email.providerEmailId)
  } catch {
    throw providerUnavailable()
  }
  if (listedResponse?.error || !listedResponse?.data) throw providerUnavailable()
  const listed = listedResponse.data.data
  if (
    listedResponse.data.has_more
    || !Array.isArray(listed)
    || listed.length !== manifest.length
    || listed.length > MAX_ATTACHMENTS
    || !sameAttachmentMetadata(manifest, listed)
  ) {
    return quarantine(email, 'attachment_metadata_mismatch')
  }

  const totalBytes = listed.reduce((sum, attachment) => sum + Number(attachment.size), 0)
  if (
    !Number.isSafeInteger(totalBytes)
    || totalBytes > MAX_TOTAL_ATTACHMENT_BYTES
    || listed.some(attachment => (
      !Number.isSafeInteger(attachment.size)
      || attachment.size < 0
      || attachment.size > MAX_ATTACHMENT_BYTES
    ))
  ) return quarantine(email, 'attachment_limit_exceeded')

  const download = dependencies.download ?? downloadResendAttachment
  const scan = dependencies.scan ?? scanFileAsync
  const pending: PendingAttachment[] = []
  for (let index = 0; index < listed.length; index += 1) {
    const attachment = listed[index]
    const filename = safeFilename(attachment.filename ?? `attachment-${index + 1}`)
    if (!validResendAttachmentUrl(
      attachment.download_url,
      email.providerEmailId,
      attachment.id,
    )) {
      return quarantine(email, 'attachment_url_invalid')
    }
    let bytes: Buffer
    try {
      bytes = await download(attachment.download_url, attachment.size)
    } catch {
      return quarantine(email, 'attachment_download_failed')
    }
    if (bytes.length !== attachment.size) return quarantine(email, 'attachment_size_mismatch')
    const scanResult = await scan(bytes, filename, safeContentType(attachment.content_type))
    if (!scanResult.safe) return quarantine(email, 'attachment_unsafe')
    pending.push({
      id: attachment.id,
      filename,
      size: attachment.size,
      contentType: safeContentType(attachment.content_type),
      contentDisposition: safeNullableHeader(attachment.content_disposition, 32),
      contentId: safeNullableHeader(attachment.content_id, 128),
      bytes,
    })
  }

  const storeAttachment = dependencies.storeAttachment ?? createSupabaseAttachmentStore(admin)
  const deleteAttachment = dependencies.deleteAttachment ?? createSupabaseAttachmentDelete(admin)
  const stored: StoredResendInboundAttachment[] = []
  try {
    for (let index = 0; index < pending.length; index += 1) {
      const attachment = pending[index]
      const storagePath = await storeAttachment({
        fundId: connection.fundId,
        mailboxId: routing.mailboxId,
        providerEmailId: email.providerEmailId,
        attachmentId: attachment.id,
        index,
        filename: attachment.filename,
        contentType: attachment.contentType,
        bytes: attachment.bytes,
      })
      stored.push({
        id: attachment.id,
        filename: attachment.filename,
        size: attachment.size,
        contentType: attachment.contentType,
        contentDisposition: attachment.contentDisposition,
        contentId: attachment.contentId,
        storagePath,
      })
    }
  } catch {
    await Promise.allSettled(stored.map(attachment => deleteAttachment(attachment.storagePath)))
    return quarantine(email, 'attachment_storage_failed')
  }
  return { ...email, attachments: stored }
}

async function defaultGetEmail(
  receivingApiKey: string,
  emailId: string,
): Promise<ResendGetEmailResponse> {
  const { Resend } = await import('resend')
  return await new Resend(receivingApiKey).emails.receiving.get(emailId) as unknown as ResendGetEmailResponse
}

async function defaultListAttachments(
  receivingApiKey: string,
  emailId: string,
): Promise<ResendListAttachmentsResponse> {
  const { Resend } = await import('resend')
  return await new Resend(receivingApiKey).emails.receiving.attachments.list({ emailId }) as unknown as ResendListAttachmentsResponse
}

function createSupabaseAttachmentStore(admin: SupabaseClient) {
  return async (input: StoreAttachmentInput): Promise<string> => {
    const objectPath = [
      input.fundId,
      input.mailboxId,
      sha256(input.providerEmailId),
      `${input.index}_${sha256(input.attachmentId)}_${input.filename}`,
    ].join('/')
    const result = await admin.storage
      .from(ATTACHMENT_BUCKET)
      .upload(objectPath, input.bytes, { contentType: input.contentType, upsert: true })
    if (result.error) throw new Error('Attachment storage failed')
    return `${ATTACHMENT_BUCKET}/${objectPath}`
  }
}

function createSupabaseAttachmentDelete(admin: SupabaseClient) {
  return async (storagePath: string): Promise<void> => {
    const prefix = `${ATTACHMENT_BUCKET}/`
    if (!storagePath.startsWith(prefix)) throw new Error('Attachment cleanup path is invalid')
    const result = await admin.storage
      .from(ATTACHMENT_BUCKET)
      .remove([storagePath.slice(prefix.length)])
    if (result.error) throw new Error('Attachment cleanup failed')
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export async function downloadResendAttachment(url: string, expectedBytes: number): Promise<Buffer> {
  if (!validResendAttachmentUrl(url)) throw new Error('Attachment URL is invalid')
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > MAX_ATTACHMENT_BYTES) {
    throw new Error('Attachment size is invalid')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { accept: 'application/octet-stream' },
    })
    if (!response.ok || !response.body) throw new Error('Attachment download failed')
    const declared = response.headers.get('content-length')
    if (declared && Number(declared) > expectedBytes) throw new Error('Attachment is oversized')
    const chunks: Buffer[] = []
    let received = 0
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > expectedBytes || received > MAX_ATTACHMENT_BYTES) {
        await reader.cancel()
        throw new Error('Attachment is oversized')
      }
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks, received)
  } finally {
    clearTimeout(timeout)
  }
}

function validateSignedAndFetchedIdentity(
  domain: string,
  event: ResendReceivedEventData,
  fetched: ResendFetchedEmail,
): void {
  const signedTo = normalizeAddressList(event.to, 50)
  const fetchedTo = normalizeAddressList(fetched.to, 50)
  if (
    fetched.id !== event.email_id
    || safeHeader(fetched.from, 320) !== safeHeader(event.from, 320)
    || safeHeader(fetched.subject, 998) !== safeHeader(event.subject, 998)
    || assertMessageId(fetched.message_id) !== assertMessageId(event.message_id)
    || !sameStrings(signedTo, fetchedTo)
    || !sameStrings(normalizeAddressList(event.cc ?? [], 50), normalizeAddressList(fetched.cc ?? [], 50))
    || !sameStrings(normalizeAddressList(event.bcc ?? [], 50), normalizeAddressList(fetched.bcc ?? [], 50))
  ) throw identityMismatch()
  const expectedDomain = domain.toLowerCase()
  if (!fetchedTo.some(address => addressDomain(address) === expectedDomain)) throw identityMismatch()
}

function normalizeHeaders(input: unknown): Map<string, string> {
  if (input === null || input === undefined) return new Map()
  if (typeof input !== 'object' || Array.isArray(input)) throw invalidHeader()
  const result = new Map<string, string>()
  for (const [name, rawValue] of Object.entries(input)) {
    if (!/^[A-Za-z0-9-]{1,78}$/.test(name) || typeof rawValue !== 'string') throw invalidHeader()
    const value = safeHeader(rawValue, 8 * 1024)
    const key = name.toLowerCase()
    const existing = result.get(key)
    if (existing !== undefined && existing !== value) throw invalidHeader()
    result.set(key, value)
  }
  return result
}

function parseReferences(input: string): string[] {
  const references = input.trim().split(/\s+/).filter(Boolean)
  if (references.length > 20) throw invalidHeader()
  return references.map(assertMessageId)
}

function assertMessageId(input: unknown): string {
  if (typeof input !== 'string') throw invalidHeader()
  const value = safeHeader(input, 998)
  if (!/^<[^<>\s]+>$/.test(value)) throw invalidHeader()
  return value
}

function normalizeAddressList(input: unknown, max: number): string[] {
  if (!Array.isArray(input) || input.length > max) throw identityMismatch()
  return input.map(value => {
    if (typeof value !== 'string') throw identityMismatch()
    return safeHeader(value, 320).toLowerCase()
  }).sort()
}

function addressDomain(value: string): string | null {
  const angle = value.match(/<([^<>]+)>/)?.[1] ?? value
  const match = angle.trim().match(/^[^@\s]+@([^@\s]+)$/)
  return match?.[1]?.toLowerCase() ?? null
}

function sameStrings(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function sameAttachmentMetadata(a: unknown[], b: unknown[]): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  const normalize = (values: unknown[]) => values.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    return [
      record.id,
      record.filename ?? null,
      record.content_type,
      record.content_disposition ?? null,
      record.content_id ?? null,
    ]
  }).sort((left, right) => String(left?.[0]).localeCompare(String(right?.[0])))
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))
}

function validResendAttachmentUrl(urlInput: unknown, emailId?: string, attachmentId?: string): boolean {
  if (typeof urlInput !== 'string' || urlInput.length > 4096) return false
  try {
    const url = new URL(urlInput)
    if (
      url.protocol !== 'https:'
      || url.hostname !== ATTACHMENT_HOST
      || url.username
      || url.password
      || url.port
    ) return false
    if (emailId && !url.pathname.includes(`/${encodeURIComponent(emailId)}/`)) return false
    if (attachmentId && !url.pathname.endsWith(`/attachments/${encodeURIComponent(attachmentId)}`)) return false
    return true
  } catch {
    return false
  }
}

function boundedNullableBody(input: unknown, maxBytes: number): string | null {
  if (input === null || input === undefined) return null
  if (typeof input !== 'string' || input.includes('\0') || Buffer.byteLength(input, 'utf8') > maxBytes) {
    throw new FundEmailInboundError(
      'inbound_content_oversized',
      'Inbound email content exceeds the allowed limit.',
      false,
    )
  }
  return input
}

function safeHeader(input: unknown, maxLength: number): string {
  if (typeof input !== 'string') throw invalidHeader()
  const value = input.trim()
  if (!value || value.length > maxLength || /[\r\n\0]/.test(value)) throw invalidHeader()
  return value
}

function safeNullableHeader(input: unknown, maxLength: number): string | null {
  if (input === null || input === undefined) return null
  return safeHeader(input, maxLength)
}

function safeContentType(input: unknown): string {
  if (typeof input !== 'string' || !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(input)) {
    throw invalidHeader()
  }
  return input.toLowerCase()
}

function safeFilename(input: string): string {
  const normalized = input
    .normalize('NFKC')
    .replace(/[\/\\:*?"<>|\0\r\n]/g, '_')
    .replace(/\.\./g, '_')
    .slice(0, 180)
  return normalized || 'attachment'
}

function validTimestamp(input: unknown): string {
  if (typeof input !== 'string' || !Number.isFinite(Date.parse(input))) throw identityMismatch()
  return new Date(input).toISOString()
}

function quarantine(
  base: RetrievedResendInboundEmail,
  reason: string,
): RetrievedResendInboundEmail {
  return { ...base, attachments: [], quarantineReason: reason }
}

function providerUnavailable(): FundEmailInboundError {
  return new FundEmailInboundError(
    'inbound_provider_unavailable',
    'Resend inbound content is temporarily unavailable.',
    true,
  )
}

function identityMismatch(): FundEmailInboundError {
  return new FundEmailInboundError(
    'inbound_identity_mismatch',
    'Inbound email identity could not be verified.',
    false,
  )
}

function invalidHeader(): FundEmailInboundError {
  return new FundEmailInboundError(
    'inbound_header_invalid',
    'Inbound email headers are invalid.',
    false,
  )
}
