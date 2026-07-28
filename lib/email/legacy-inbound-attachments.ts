import { scanFileAsync } from '@/lib/security/scan-file'

const MAX_ATTACHMENTS = 10
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024
const MAX_ENCODED_ATTACHMENT_BYTES = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4
const UNSAFE_METADATA = /[\r\n\0]/

export interface LegacyInboundAttachment {
  Name: string
  ContentType: string
  Content?: string
  ContentLength: number
}

export interface PreparedLegacyInboundAttachment {
  name: string
  contentType: string
  contentLength: number
  bytes: Buffer
}

export interface StoredLegacyInboundAttachment {
  Name: string
  ContentType: string
  ContentLength: number
  StoragePath: string
}

type AttachmentFailureCode =
  | 'attachment_limit_exceeded'
  | 'attachment_content_invalid'
  | 'attachment_size_mismatch'
  | 'attachment_unsafe'
  | 'attachment_storage_failed'

type PreparationResult =
  | { ok: true; attachments: PreparedLegacyInboundAttachment[] }
  | { ok: false; code: AttachmentFailureCode }

type PersistenceResult =
  | { ok: true; attachments: StoredLegacyInboundAttachment[] }
  | { ok: false; code: 'attachment_storage_failed' }

type ScanAttachment = (
  bytes: Buffer,
  filename: string,
  contentType: string,
) => Promise<{ safe: boolean; reason?: string }>

interface PersistenceDependencies {
  store(input: {
    index: number
    filename: string
    contentType: string
    bytes: Buffer
  }): Promise<string>
  remove(storagePath: string): Promise<void>
}

export async function prepareLegacyInboundAttachments(
  attachments: LegacyInboundAttachment[],
  scan: ScanAttachment = scanFileAsync,
): Promise<PreparationResult> {
  if (attachments.length > MAX_ATTACHMENTS) {
    return { ok: false, code: 'attachment_limit_exceeded' }
  }

  let totalBytes = 0
  const decoded: PreparedLegacyInboundAttachment[] = []
  for (const attachment of attachments) {
    if (!validMetadata(attachment)) {
      return { ok: false, code: 'attachment_content_invalid' }
    }
    if (attachment.ContentLength > MAX_ATTACHMENT_BYTES) {
      return { ok: false, code: 'attachment_limit_exceeded' }
    }
    if (attachment.Content === undefined || !isCanonicalBase64(attachment.Content)) {
      return { ok: false, code: 'attachment_content_invalid' }
    }
    if (attachment.Content.length > MAX_ENCODED_ATTACHMENT_BYTES) {
      return { ok: false, code: 'attachment_limit_exceeded' }
    }

    const bytes = Buffer.from(attachment.Content, 'base64')
    if (bytes.length !== attachment.ContentLength) {
      return { ok: false, code: 'attachment_size_mismatch' }
    }
    totalBytes += bytes.length
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return { ok: false, code: 'attachment_limit_exceeded' }
    }
    decoded.push({
      name: attachment.Name,
      contentType: attachment.ContentType,
      contentLength: attachment.ContentLength,
      bytes,
    })
  }

  for (const attachment of decoded) {
    const scanResult = await scan(
      attachment.bytes,
      attachment.name,
      attachment.contentType,
    )
    if (!scanResult.safe) return { ok: false, code: 'attachment_unsafe' }
  }

  return { ok: true, attachments: decoded }
}

export async function persistLegacyInboundAttachments(
  attachments: PreparedLegacyInboundAttachment[],
  dependencies: PersistenceDependencies,
): Promise<PersistenceResult> {
  const stored: StoredLegacyInboundAttachment[] = []
  try {
    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index]
      const filename = safeStorageFilename(index, attachment.name)
      const storagePath = await dependencies.store({
        index,
        filename,
        contentType: attachment.contentType,
        bytes: attachment.bytes,
      })
      stored.push({
        Name: attachment.name,
        ContentType: attachment.contentType,
        ContentLength: attachment.contentLength,
        StoragePath: storagePath,
      })
    }
  } catch {
    await Promise.allSettled(
      stored.map(attachment => dependencies.remove(attachment.StoragePath)),
    )
    return { ok: false, code: 'attachment_storage_failed' }
  }

  return { ok: true, attachments: stored }
}

export function attachmentFailureMessage(code: AttachmentFailureCode): string {
  const messages: Record<AttachmentFailureCode, string> = {
    attachment_limit_exceeded: 'Attachment limits exceeded; email was not processed.',
    attachment_content_invalid: 'Attachment content was invalid; email was not processed.',
    attachment_size_mismatch: 'Attachment size did not match provider metadata; email was not processed.',
    attachment_unsafe: 'An unsafe attachment was rejected; email was not processed.',
    attachment_storage_failed: 'Attachment storage failed; email was not processed.',
  }
  return messages[code]
}

function validMetadata(attachment: LegacyInboundAttachment): boolean {
  return Boolean(
    attachment.Name
    && attachment.Name.length <= 255
    && !UNSAFE_METADATA.test(attachment.Name)
    && attachment.ContentType
    && attachment.ContentType.length <= 255
    && !UNSAFE_METADATA.test(attachment.ContentType)
    && Number.isSafeInteger(attachment.ContentLength)
    && attachment.ContentLength >= 0,
  )
}

function isCanonicalBase64(value: string): boolean {
  if (value.length === 0) return true
  if (value.length % 4 !== 0) return false
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
}

function safeStorageFilename(index: number, filename: string): string {
  const sanitized = filename
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\.\./g, '_')
  return `${index}_${sanitized}`
}
