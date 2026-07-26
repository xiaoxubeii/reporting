const LEGACY_BUCKET = 'email-attachments'
const FUND_EMAIL_BUCKET = 'fund-email-inbound-attachments'
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/

export interface EmailAttachmentStorageLocation {
  bucket: typeof LEGACY_BUCKET | typeof FUND_EMAIL_BUCKET
  objectPath: string
}

export function resolveEmailAttachmentStorageLocation(
  storagePath: string,
  expected: { expectedEmailId?: string; expectedFundId?: string } = {},
): EmailAttachmentStorageLocation | null {
  if (!validPath(storagePath)) return null
  const fundPrefix = `${FUND_EMAIL_BUCKET}/`
  if (storagePath.startsWith(fundPrefix)) {
    const objectPath = storagePath.slice(fundPrefix.length)
    const parts = objectPath.split('/')
    if (
      parts.length !== 4
      || !UUID.test(parts[0])
      || !UUID.test(parts[1])
      || !SHA256.test(parts[2])
      || !/^\d+_[a-f0-9]{64}_.{1,260}$/.test(parts[3])
      || (expected.expectedFundId !== undefined && parts[0] !== expected.expectedFundId)
    ) return null
    return { bucket: FUND_EMAIL_BUCKET, objectPath }
  }

  const parts = storagePath.split('/')
  if (
    parts.length < 2
    || !UUID.test(parts[0])
    || (expected.expectedEmailId !== undefined && parts[0] !== expected.expectedEmailId)
  ) return null
  return { bucket: LEGACY_BUCKET, objectPath: storagePath }
}

function validPath(value: unknown): value is string {
  if (
    typeof value !== 'string'
    || value.length < 3
    || value.length > 1024
    || value.startsWith('/')
    || /[\0\r\n]/.test(value)
  ) return false
  const parts = value.split('/')
  return parts.every(part => part.length > 0 && part !== '.' && part !== '..')
}
