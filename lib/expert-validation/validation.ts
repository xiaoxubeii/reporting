import {
  EXPERT_LIMITS,
  EXPERT_REQUEST_STATUSES,
  EXPERT_SOURCE_KINDS,
  type ExpertRequestStatus,
  type ExpertSourceKind,
  type ExpertSourceRef,
} from './types'

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function requiredString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new ValidationError(`${field} is required`)
  const normalized = value.trim()
  if (!normalized) throw new ValidationError(`${field} is required`)
  if (normalized.length > max) throw new ValidationError(`${field} is too long`)
  return normalized
}

export function optionalString(value: unknown, field: string, max: number): string | null {
  if (value == null || value === '') return null
  return requiredString(value, field, max)
}

export function parseSourceKind(value: unknown): ExpertSourceKind {
  if (typeof value !== 'string' || !EXPERT_SOURCE_KINDS.includes(value as ExpertSourceKind)) {
    throw new ValidationError('source_kind must be research_gap or contradiction')
  }
  return value as ExpertSourceKind
}

export function parseRequestStatus(value: unknown): ExpertRequestStatus {
  if (typeof value !== 'string' || !EXPERT_REQUEST_STATUSES.includes(value as ExpertRequestStatus)) {
    throw new ValidationError('Invalid expert request status')
  }
  return value as ExpertRequestStatus
}

export function parseSourceLocator(value: unknown): { draftId: string; researchJobId?: string; kind: ExpertSourceKind; index: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('source_ref is required')
  }
  const input = value as Record<string, unknown>
  const draftId = requiredString(input.draftId, 'source_ref.draftId', 100)
  const kind = parseSourceKind(input.kind)
  if (!Number.isInteger(input.index) || Number(input.index) < 0 || Number(input.index) > 10_000) {
    throw new ValidationError('source_ref.index must be a non-negative integer')
  }
  const researchJobId = optionalString(input.researchJobId, 'source_ref.researchJobId', 100) ?? undefined
  return { draftId, researchJobId, kind, index: Number(input.index) }
}

export function buildSourceRef(
  locator: ReturnType<typeof parseSourceLocator>,
  snapshot: unknown,
): ExpertSourceRef {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new ValidationError('The referenced Research item is invalid')
  }
  const cloned = structuredClone(snapshot as Record<string, unknown>)
  if (Buffer.byteLength(JSON.stringify({ ...locator, snapshot: cloned }), 'utf8') > 30_000) {
    throw new ValidationError('The referenced Research item is too large')
  }
  return { ...locator, snapshot: cloned }
}

export function parseConfirmedInputs(value: unknown): {
  question: string
  expertProfile: string
  contextSnapshot: string
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Request body is required')
  }
  const input = value as Record<string, unknown>
  return {
    question: requiredString(input.question, 'question', EXPERT_LIMITS.question),
    expertProfile: requiredString(input.expert_profile ?? input.expertProfile, 'expert_profile', EXPERT_LIMITS.expertProfile),
    contextSnapshot: requiredString(input.context_snapshot ?? input.contextSnapshot, 'context_snapshot', EXPERT_LIMITS.contextSnapshot),
  }
}

export function parseExpertInput(value: unknown): {
  name: string
  email: string
  title: string | null
  organization: string | null
  profileText: string
  scope: 'global' | 'fund'
  status: 'active' | 'inactive'
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('Request body is required')
  const input = value as Record<string, unknown>
  const email = requiredString(input.email, 'email', EXPERT_LIMITS.expertEmail).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('email is invalid')
  const scope = input.scope === 'global' ? 'global' : 'fund'
  const status = input.status === 'inactive' ? 'inactive' : 'active'
  return {
    name: requiredString(input.name, 'name', EXPERT_LIMITS.expertName),
    email,
    title: optionalString(input.title, 'title', EXPERT_LIMITS.expertTitle),
    organization: optionalString(input.organization, 'organization', EXPERT_LIMITS.expertOrganization),
    profileText: requiredString(input.profile_text ?? input.profileText, 'profile_text', EXPERT_LIMITS.profileText),
    scope,
    status,
  }
}

export function parseResponse(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('Request body is required')
  return requiredString((value as Record<string, unknown>).response_markdown, 'response_markdown', EXPERT_LIMITS.response)
}

export function sanitizeProviderError(error: unknown): { code: string; message: string } {
  const raw = error instanceof Error ? error.message : 'Email provider error'
  const message = raw
    .replace(/https?:\/\/\S+/gi, '[url removed]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[credential removed]')
    .slice(0, 500)
  return { code: 'provider_error', message: message || 'Email provider error' }
}

export function isExpired(expiresAt: string | null, now = Date.now()): boolean {
  return !expiresAt || Date.parse(expiresAt) <= now
}
