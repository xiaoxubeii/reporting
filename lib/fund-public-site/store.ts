import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import {
  createDefaultFundPublicSiteContent,
  parseFundPublicSiteContent,
  type FundPublicSiteContentV1,
} from './content'
import { isFundPublicSiteTemplate, type FundPublicSiteTemplate } from './templates'

type AdminClient = SupabaseClient<Database>
type SiteRow = Database['public']['Tables']['fund_public_sites']['Row']

export interface FundPublicSiteDraft {
  readonly templateKey: FundPublicSiteTemplate
  readonly content: FundPublicSiteContentV1
  readonly draftRevision: number
  readonly lifecycleRevision: number
  readonly publishedVersion: number
  readonly publishedFromDraftRevision: number | null
  readonly isPublished: boolean
  readonly publishedAt: string | null
  readonly hasUnpublishedChanges: boolean
}

export interface PublishedFundPublicSite {
  readonly fundId: string
  readonly slug: string
  readonly fundName: string
  readonly logoUrl: string | null
  readonly templateKey: FundPublicSiteTemplate
  readonly content: FundPublicSiteContentV1
  readonly publishedVersion: number
  readonly publishedAt: string
}

export class FundPublicSiteConflictError extends Error {}

export async function getOrCreateFundPublicSiteDraft(
  admin: AdminClient,
  fundId: string,
  fundName: string,
  userId: string,
): Promise<FundPublicSiteDraft> {
  const existing = await loadDraftRow(admin, fundId)
  if (existing) return draftFromRow(existing)

  const content = createDefaultFundPublicSiteContent(fundName)
  const { data, error } = await admin
    .from('fund_public_sites')
    .insert({
      fund_id: fundId,
      draft_template_key: 'focus',
      draft_content: content as unknown as Json,
      updated_by: userId,
    })
    .select('*')
    .maybeSingle()
  if (error) {
    if (error.code === '23505') {
      const raced = await loadDraftRow(admin, fundId)
      if (raced) return draftFromRow(raced)
    }
    throw new Error('Unable to initialize Fund public site')
  }
  if (!data) throw new Error('Unable to initialize Fund public site')
  return draftFromRow(data)
}

export async function saveFundPublicSiteDraft(
  admin: AdminClient,
  input: {
    readonly fundId: string
    readonly userId: string
    readonly expectedRevision: number
    readonly templateKey: FundPublicSiteTemplate
    readonly content: FundPublicSiteContentV1
  },
): Promise<FundPublicSiteDraft> {
  const content = parseFundPublicSiteContent(input.content)
  if (!isFundPublicSiteTemplate(input.templateKey)) throw new Error('Unsupported template')
  const { data, error } = await admin
    .from('fund_public_sites')
    .update({
      draft_template_key: input.templateKey,
      draft_content: content as unknown as Json,
      draft_revision: input.expectedRevision + 1,
      updated_at: new Date().toISOString(),
      updated_by: input.userId,
    })
    .eq('fund_id', input.fundId)
    .eq('draft_revision', input.expectedRevision)
    .select('*')
    .maybeSingle()
  if (error) throw new Error('Unable to save Fund public site')
  if (!data) throw new FundPublicSiteConflictError('The draft changed in another session')
  return draftFromRow(data)
}

export async function publishFundPublicSite(
  admin: AdminClient,
  fundId: string,
  userId: string,
  expectedDraftRevision: number,
  expectedLifecycleRevision: number,
): Promise<FundPublicSiteDraft> {
  const row = await loadDraftRow(admin, fundId)
  if (!row || row.draft_revision !== expectedDraftRevision) {
    throw new FundPublicSiteConflictError('The draft changed in another session')
  }
  parseFundPublicSiteContent(row.draft_content)
  if (!isFundPublicSiteTemplate(row.draft_template_key)) throw new Error('Unsupported template')

  const { error } = await admin.rpc('publish_fund_public_site', {
    p_fund_id: fundId,
    p_expected_draft_revision: expectedDraftRevision,
    p_expected_lifecycle_revision: expectedLifecycleRevision,
    p_user_id: userId,
  })
  if (error?.code === '40001' || error?.message?.includes('stale public site state')) {
    throw new FundPublicSiteConflictError('The public site changed in another session')
  }
  if (error) throw new Error('Unable to publish Fund public site')
  const published = await loadDraftRow(admin, fundId)
  if (!published) throw new Error('Unable to publish Fund public site')
  return draftFromRow(published)
}

export async function unpublishFundPublicSite(
  admin: AdminClient,
  fundId: string,
  userId: string,
  expectedLifecycleRevision: number,
): Promise<FundPublicSiteDraft> {
  const { error } = await admin.rpc('unpublish_fund_public_site', {
    p_fund_id: fundId,
    p_expected_lifecycle_revision: expectedLifecycleRevision,
    p_user_id: userId,
  })
  if (error?.code === '40001' || error?.message?.includes('stale public site state')) {
    throw new FundPublicSiteConflictError('The public site changed in another session')
  }
  if (error) throw new Error('Unable to unpublish Fund public site')
  const unpublished = await loadDraftRow(admin, fundId)
  if (!unpublished) throw new Error('Unable to unpublish Fund public site')
  return draftFromRow(unpublished)
}

export async function resolvePublishedFundPublicSite(
  client: Pick<AdminClient, 'rpc'>,
  trustedSlug: string,
  expectedFundId?: string,
): Promise<PublishedFundPublicSite | null> {
  const { data, error } = await client.rpc('resolve_published_fund_site', { p_slug: trustedSlug })
  if (error) throw new Error('Unable to resolve published Fund site')
  if (!Array.isArray(data) || data.length === 0) return null
  if (data.length !== 1) throw new Error('Invalid published Fund site result')
  const row = data[0]
  if (row.slug !== trustedSlug || (expectedFundId && row.fund_id !== expectedFundId)) {
    throw new Error('Published Fund site does not match trusted tenant')
  }
  if (!isFundPublicSiteTemplate(row.template_key)) throw new Error('Invalid published template')
  if (!row.published_at || !Number.isSafeInteger(row.published_version) || row.published_version < 1) {
    throw new Error('Invalid published Fund site version')
  }
  return Object.freeze({
    fundId: row.fund_id,
    slug: row.slug,
    fundName: row.name,
    logoUrl: row.logo_url,
    templateKey: row.template_key,
    content: parseFundPublicSiteContent(row.content),
    publishedVersion: row.published_version,
    publishedAt: row.published_at,
  })
}

async function loadDraftRow(admin: AdminClient, fundId: string): Promise<SiteRow | null> {
  const { data, error } = await admin.from('fund_public_sites').select('*').eq('fund_id', fundId).maybeSingle()
  if (error) throw new Error('Unable to load Fund public site')
  return data
}

function draftFromRow(row: SiteRow): FundPublicSiteDraft {
  if (!isFundPublicSiteTemplate(row.draft_template_key)) throw new Error('Invalid draft template')
  const content = parseFundPublicSiteContent(row.draft_content)
  return Object.freeze({
    templateKey: row.draft_template_key,
    content,
    draftRevision: row.draft_revision,
    lifecycleRevision: row.lifecycle_revision,
    publishedVersion: row.published_version,
    publishedFromDraftRevision: row.published_from_draft_revision,
    isPublished: row.is_published,
    publishedAt: row.published_at,
    hasUnpublishedChanges: row.published_from_draft_revision !== row.draft_revision,
  })
}
