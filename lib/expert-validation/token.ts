import { createHash, randomBytes } from 'crypto'

export function createInvitationToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('base64url')
  return { rawToken, tokenHash: hashInvitationToken(rawToken) }
}

export function hashInvitationToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

export function invitationUrl(rawToken: string, canonicalOrigin?: string): string {
  const base = validatedInvitationBaseUrl(
    canonicalOrigin || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001',
  )
  return `${base}/expert-response#token=${encodeURIComponent(rawToken)}`
}

export function validatedInvitationBaseUrl(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('NEXT_PUBLIC_SITE_URL is invalid') }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('NEXT_PUBLIC_SITE_URL must use HTTPS (HTTP is allowed only for localhost)')
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('NEXT_PUBLIC_SITE_URL must be a bare origin')
  }
  return url.origin
}

export function invitationExpiry(now = new Date()): string {
  const hours = boundedInt(process.env.EXPERT_INVITATION_TTL_HOURS, 72, 1, 24 * 30)
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString()
}

function boundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback
}
