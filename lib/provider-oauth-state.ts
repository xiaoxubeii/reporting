import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export type ProviderOAuthProvider = 'google' | 'dropbox'

interface ProviderOAuthStatePayload {
  readonly version: 1
  readonly provider: ProviderOAuthProvider
  readonly fundId: string
  readonly userId: string
  readonly returnTo: string
  readonly nonce: string
  readonly expiresAt: number
}

interface CreateProviderOAuthStateOptions {
  readonly provider: ProviderOAuthProvider
  readonly fundId: string
  readonly userId: string
  readonly returnTo: string
  readonly secret: string
  readonly now?: number
}

interface VerifyProviderOAuthStateOptions {
  readonly provider: ProviderOAuthProvider
  readonly userId: string
  readonly secret: string
  readonly now?: number
}

const STATE_TTL_SECONDS = 600
const STATE_CONTEXT = 'reporting-provider-oauth-state-v1'

export function providerOAuthStateSecret(): string {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret) throw new Error('Provider OAuth state secret is not configured')
  return secret
}

export function providerOAuthStateCookieName(provider: ProviderOAuthProvider): string {
  return `__Host-reporting-${provider}-oauth-state`
}

export function createProviderOAuthState(options: CreateProviderOAuthStateOptions): string {
  const now = options.now ?? Math.floor(Date.now() / 1000)
  const payload: ProviderOAuthStatePayload = {
    version: 1,
    provider: options.provider,
    fundId: options.fundId,
    userId: options.userId,
    returnTo: options.returnTo,
    nonce: randomBytes(24).toString('base64url'),
    expiresAt: now + STATE_TTL_SECONDS,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${sign(encoded, options.secret)}`
}

export function verifyProviderOAuthState(
  token: string,
  options: VerifyProviderOAuthStateOptions,
): ProviderOAuthStatePayload | null {
  if (!token || token.length > 2048) return null
  const [encoded, signature, extra] = token.split('.')
  if (!encoded || !signature || extra) return null

  const expected = sign(encoded, options.secret)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null
  }

  try {
    const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    if (!isPayload(value)) return null
    const now = options.now ?? Math.floor(Date.now() / 1000)
    if (value.provider !== options.provider || value.userId !== options.userId || value.expiresAt < now) {
      return null
    }
    return value
  } catch {
    return null
  }
}

function sign(encoded: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${STATE_CONTEXT}.${encoded}`)
    .digest('base64url')
}

function isPayload(value: unknown): value is ProviderOAuthStatePayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Record<string, unknown>
  return payload.version === 1
    && (payload.provider === 'google' || payload.provider === 'dropbox')
    && typeof payload.fundId === 'string'
    && payload.fundId.length > 0
    && typeof payload.userId === 'string'
    && payload.userId.length > 0
    && typeof payload.returnTo === 'string'
    && typeof payload.nonce === 'string'
    && payload.nonce.length >= 24
    && typeof payload.expiresAt === 'number'
    && Number.isSafeInteger(payload.expiresAt)
}
