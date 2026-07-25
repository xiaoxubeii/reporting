import { SignJWT, jwtVerify } from 'jose'

import { backgroundJobSecret } from './config'
import type { BackgroundJobAudience, VerifiedBackgroundJobToken } from './types'

const TOKEN_ISSUER = 'reporting-background-jobs'
const TOKEN_ALGORITHM = 'HS256'
const TOKEN_LIFETIME_MS = 10 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TOKEN_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/
const AUDIENCE_PATTERN = /^reporting-[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/
const ALLOWED_CLAIMS = Object.freeze(['aud', 'exp', 'iat', 'iss', 'job_attempt', 'jti', 'nbf', 'sub'])

interface IssueBackgroundJobTokenInput {
  readonly jobId: string
  readonly attemptId: string
  readonly audience: BackgroundJobAudience
  readonly tokenId: string
  readonly leaseExpiresAt: Date
  readonly now?: Date
  readonly secret?: string
}

interface VerifyBackgroundJobTokenInput {
  readonly audience: BackgroundJobAudience
  readonly now?: Date
  readonly secret?: string
}

export async function issueBackgroundJobToken(input: IssueBackgroundJobTokenInput): Promise<string> {
  requireUuid(input.jobId)
  requireUuid(input.attemptId)
  requireAudience(input.audience)
  requireTokenId(input.tokenId)

  const secret = backgroundJobSecret({
    BACKGROUND_JOB_TOKEN_SECRET: input.secret ?? process.env.BACKGROUND_JOB_TOKEN_SECRET,
  })
  const now = input.now ?? new Date()
  requireValidDate(now)
  requireValidDate(input.leaseExpiresAt)

  const expiresAt = Math.min(input.leaseExpiresAt.getTime(), now.getTime() + TOKEN_LIFETIME_MS)
  if (expiresAt <= now.getTime()) throw new Error('Job Token lease has expired')

  const issuedAtSeconds = Math.floor(now.getTime() / 1000)
  const expiresAtSeconds = Math.floor(expiresAt / 1000)
  if (expiresAtSeconds <= issuedAtSeconds) throw new Error('Job Token lifetime is too short')

  return new SignJWT({ job_attempt: input.attemptId })
    .setProtectedHeader({ alg: TOKEN_ALGORITHM, typ: 'JWT' })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(input.audience)
    .setSubject(input.jobId)
    .setJti(input.tokenId)
    .setIssuedAt(issuedAtSeconds)
    .setNotBefore(issuedAtSeconds - 5)
    .setExpirationTime(expiresAtSeconds)
    .sign(new TextEncoder().encode(secret))
}

export async function verifyBackgroundJobToken(
  token: string,
  input: VerifyBackgroundJobTokenInput,
): Promise<VerifiedBackgroundJobToken> {
  try {
    requireAudience(input.audience)
    const secret = backgroundJobSecret({
      BACKGROUND_JOB_TOKEN_SECRET: input.secret ?? process.env.BACKGROUND_JOB_TOKEN_SECRET,
    })
    const now = input.now ?? new Date()
    requireValidDate(now)

    const verified = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: [TOKEN_ALGORITHM],
      issuer: TOKEN_ISSUER,
      audience: input.audience,
      currentDate: now,
      clockTolerance: 5,
      maxTokenAge: '10m',
    })

    if (verified.protectedHeader.typ !== 'JWT') throw new Error('Unexpected token type')
    if (!hasExactClaims(verified.payload)) throw new Error('Unexpected token claims')
    if (verified.payload.aud !== input.audience) throw new Error('Unexpected audience shape')
    if (typeof verified.payload.sub !== 'string' || !UUID_PATTERN.test(verified.payload.sub)) throw new Error('Invalid job id')
    if (typeof verified.payload.job_attempt !== 'string' || !UUID_PATTERN.test(verified.payload.job_attempt)) throw new Error('Invalid attempt id')
    if (typeof verified.payload.jti !== 'string' || !TOKEN_ID_PATTERN.test(verified.payload.jti)) throw new Error('Invalid token id')
    for (const value of [verified.payload.iat, verified.payload.nbf, verified.payload.exp]) {
      if (!Number.isInteger(value)) throw new Error('Invalid token timestamps')
    }

    return Object.freeze({
      jobId: verified.payload.sub,
      attemptId: verified.payload.job_attempt,
      audience: input.audience,
      tokenId: verified.payload.jti,
    })
  } catch {
    throw new Error('Invalid background Job Token')
  }
}

export function parseBearerJobToken(header: string | null): string {
  const match = header?.match(BEARER_PATTERN)
  if (!match) throw new Error('Invalid background Job Token')
  return match[1]
}

function hasExactClaims(payload: Record<string, unknown>): boolean {
  const keys = Object.keys(payload).sort()
  return keys.length === ALLOWED_CLAIMS.length && keys.every((key, index) => key === ALLOWED_CLAIMS[index])
}

function requireAudience(value: string): asserts value is BackgroundJobAudience {
  if (!AUDIENCE_PATTERN.test(value)) throw new Error('Invalid Job Token audience')
}

function requireUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error('Invalid Job Token UUID')
}

function requireTokenId(value: string): void {
  if (!TOKEN_ID_PATTERN.test(value)) throw new Error('Invalid Job Token id')
}

function requireValidDate(value: Date): void {
  if (!Number.isFinite(value.getTime())) throw new Error('Invalid Job Token date')
}
