import {
  persistLegacyInboundAttachments,
  type PreparedLegacyInboundAttachment,
  type StoredLegacyInboundAttachment,
} from '@/lib/email/legacy-inbound-attachments'

type SubmissionAttachmentPersistenceResult =
  | { ok: true; attachments: StoredLegacyInboundAttachment[] }
  | { ok: false; code: 'attachment_storage_failed' }

interface SubmissionAttachmentDependencies {
  store(input: {
    index: number
    filename: string
    contentType: string
    bytes: Buffer
  }): Promise<string>
  remove(storagePath: string): Promise<void>
  persistMetadata(attachments: StoredLegacyInboundAttachment[]): Promise<void>
}

/**
 * Stores the complete prepared attachment set and publishes its database
 * metadata as one logical operation. Any storage or metadata failure removes
 * every object written by this attempt and returns a fail-closed result.
 */
export async function persistPreparedSubmissionAttachments(
  attachments: PreparedLegacyInboundAttachment[],
  dependencies: SubmissionAttachmentDependencies,
): Promise<SubmissionAttachmentPersistenceResult> {
  const stored = await persistLegacyInboundAttachments(attachments, dependencies)
  if (!stored.ok) return stored
  if (stored.attachments.length === 0) return stored

  try {
    await dependencies.persistMetadata(stored.attachments)
  } catch {
    await Promise.allSettled(
      stored.attachments.map(attachment => dependencies.remove(attachment.StoragePath)),
    )
    return { ok: false, code: 'attachment_storage_failed' }
  }

  return stored
}
