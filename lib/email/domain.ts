import { FundEmailError } from './errors'
import { RESERVED_FUND_NAMESPACE_LABELS } from '@/lib/fund-namespace'

const RESERVED_USER_MAILBOXES = new Set([
  'abuse',
  'admin',
  'expert',
  'mail',
  'no-reply',
  'noreply',
  'pitch',
  'postmaster',
  'security',
  'support',
  'system',
])

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const MAILBOX_LOCAL_PART = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/

export function fundEmailBaseDomain(): string {
  const value = process.env.FUND_EMAIL_BASE_DOMAIN?.trim()
  if (!value) {
    throw new FundEmailError(
      'invalid_configuration',
      'FUND_EMAIL_BASE_DOMAIN is not configured.',
      500,
    )
  }
  return normalizeDnsDomain(value)
}

export function normalizeFundEmailSlug(input: string): string {
  const slug = input.trim().toLowerCase()
  if (!DNS_LABEL.test(slug)) {
    throw new FundEmailError('invalid_slug', 'A valid Fund email slug is required.')
  }
  if (RESERVED_FUND_NAMESPACE_LABELS.has(slug)) {
    throw new FundEmailError('invalid_slug', 'This Fund email slug is reserved.')
  }
  return slug
}

export function deriveFundEmailDomain(slugInput: string, baseDomainInput?: string): string {
  // Stored legacy identities may pre-date the current reserved-label union.
  // Creation paths call normalizeFundEmailSlug first; rendering an immutable
  // persisted identity only needs DNS validation.
  const slug = normalizePersistedFundEmailSlug(slugInput)
  const baseDomain = baseDomainInput === undefined
    ? fundEmailBaseDomain()
    : normalizeDnsDomain(baseDomainInput)
  return `${slug}.${baseDomain}`
}

function normalizePersistedFundEmailSlug(input: string): string {
  const slug = input.trim().toLowerCase()
  if (!DNS_LABEL.test(slug) || slug.startsWith('xn--')) {
    throw new FundEmailError('invalid_slug', 'A valid Fund email slug is required.')
  }
  return slug
}

export function normalizeUserMailboxLocalPart(input: string): string {
  const localPart = normalizeFundMailboxLocalPart(input)
  if (RESERVED_USER_MAILBOXES.has(localPart)) {
    throw new FundEmailError('invalid_mailbox', 'This mailbox name is reserved.')
  }
  return localPart
}

export function normalizeFundMailboxLocalPart(input: string): string {
  const localPart = input.trim().toLowerCase()
  if (
    !MAILBOX_LOCAL_PART.test(localPart)
    || localPart.includes('..')
    || localPart.includes('._')
    || localPart.includes('_.')
  ) {
    throw new FundEmailError('invalid_mailbox', 'A valid mailbox name is required.')
  }
  return localPart
}

export function assertSafeEmailHeader(value: string, field: string, maxLength: number): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength || /[\r\n\0]/.test(normalized)) {
    throw new FundEmailError('invalid_header', `A valid ${field} email header is required.`)
  }
  return normalized
}

export function formatFundSender(displayNameInput: string, localPartInput: string, domainInput: string): string {
  const displayName = assertSafeEmailHeader(displayNameInput, 'sender name', 120)
  const localPart = normalizeFundMailboxLocalPart(localPartInput)
  const domain = normalizeDnsDomain(domainInput)
  const renderedName = /^[A-Za-z0-9][A-Za-z0-9 .'-]*$/.test(displayName)
    ? displayName
    : `"${displayName.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
  return `${renderedName} <${localPart}@${domain}>`
}

export function normalizeDnsDomain(input: string): string {
  const domain = input.trim().toLowerCase()
  if (
    domain.length < 3
    || domain.length > 253
    || domain.includes('*')
    || domain.endsWith('.')
    || !domain.includes('.')
    || !domain.split('.').every((label) => DNS_LABEL.test(label))
  ) {
    throw new FundEmailError('invalid_domain', 'A valid email base domain is required.')
  }
  return domain
}
