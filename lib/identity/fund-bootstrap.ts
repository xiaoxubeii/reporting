import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { encrypt } from '@/lib/crypto'
import { canonicalFundOriginForId } from '@/lib/tenancy/links'
import { normalizeFundSlugCandidate } from '@/lib/tenancy/host'
import type { Database } from '@/lib/types/database'
import { IdentityOnboardingError, identityStorageError } from './errors'

export interface FundBootstrapInput {
  actorUserId: string
  fundName: unknown
  slug: unknown
  claudeApiKey?: unknown
}

export interface FundBootstrapResult {
  fundId: string
  slug: string
  canonicalOrigin: string
}

export function normalizeFundDisplayName(input: unknown): string {
  if (typeof input !== 'string') {
    throw new IdentityOnboardingError('invalid_fund_name', 'Enter a Fund name.', 400)
  }
  const name = input.normalize('NFKC').trim().replace(/[ \t]+/g, ' ')
  if (!name || name.length > 160 || /[\r\n\0]/.test(name)) {
    throw new IdentityOnboardingError('invalid_fund_name', 'Enter a valid Fund name.', 400)
  }
  return name
}

export function normalizeRequestedFundSlug(input: unknown): string {
  if (typeof input !== 'string') {
    throw new IdentityOnboardingError('invalid_fund_slug', 'Enter a Fund workspace name.', 400)
  }
  const slug = normalizeFundSlugCandidate(input)
  if (!slug) {
    throw new IdentityOnboardingError('invalid_fund_slug', 'Enter a valid Fund workspace name.', 400)
  }
  return slug
}

export async function bootstrapFundIdentity(
  admin: SupabaseClient<Database>,
  input: FundBootstrapInput,
  environment: Record<string, string | undefined> = process.env,
): Promise<FundBootstrapResult> {
  const name = normalizeFundDisplayName(input.fundName)
  const slug = normalizeRequestedFundSlug(input.slug)
  const kek = environment.ENCRYPTION_KEY?.trim()
  if (!kek) {
    throw new IdentityOnboardingError(
      'encryption_unavailable',
      'Fund creation is temporarily unavailable.',
      503,
    )
  }

  const dek = randomBytes(32).toString('hex')
  let encryptionKeyEncrypted: string
  let claudeApiKeyEncrypted: string | null = null
  try {
    encryptionKeyEncrypted = encrypt(dek, kek)
    if (typeof input.claudeApiKey === 'string' && input.claudeApiKey.trim()) {
      claudeApiKeyEncrypted = encrypt(input.claudeApiKey.trim(), dek)
    }
  } catch {
    throw new IdentityOnboardingError(
      'encryption_unavailable',
      'Fund creation is temporarily unavailable.',
      503,
    )
  }

  const result = await admin.rpc('bootstrap_fund_identity', {
    p_actor_user_id: input.actorUserId,
    p_name: name,
    p_slug: slug,
    p_encryption_key_encrypted: encryptionKeyEncrypted,
    p_claude_api_key_encrypted: claudeApiKeyEncrypted,
    p_postmark_webhook_token_encrypted: null,
  })

  if (result.error) {
    if (result.error.code === '23505') {
      throw new IdentityOnboardingError(
        'fund_identity_conflict',
        'That Fund workspace name is unavailable.',
        409,
      )
    }
    if (result.error.code === '22023') {
      throw new IdentityOnboardingError('invalid_fund_identity', 'Invalid Fund identity.', 400)
    }
    if (result.error.code === '42501') {
      throw new IdentityOnboardingError('fund_creation_denied', 'Fund creation is unavailable.', 403)
    }
    throw identityStorageError()
  }

  const row = Array.isArray(result.data) ? result.data[0] : result.data
  if (!row?.fund_id || !row.slug) throw identityStorageError()
  const canonicalOrigin = await canonicalFundOriginForId(admin as never, row.fund_id, environment)
  return { fundId: row.fund_id, slug: row.slug, canonicalOrigin }
}
