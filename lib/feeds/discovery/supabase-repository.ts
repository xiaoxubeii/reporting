import { createAdminClient } from '@/lib/supabase/admin'
import { exploreCategoryRef, exploreEntryRef, exploreSourceRef } from '../explore-references'
import type {
  DiscoveryRepository,
  SaveClassificationSuccessInput,
  SaveSemanticSuccessInput,
  StoredDealClassification,
  StoredSemanticEnrichment,
} from './store'
import { validateDiscoveryFundId } from './config'

type Admin = ReturnType<typeof createAdminClient>
type Row = Record<string, unknown>
const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000

export class SupabaseDiscoveryRepository implements DiscoveryRepository {
  private readonly fundId: string

  constructor(fundId: string, private readonly admin: Admin = createAdminClient()) {
    this.fundId = validateDiscoveryFundId(fundId)
  }

  async findSemanticForEntry(entryId: number): Promise<StoredSemanticEnrichment | null> {
    const { data, error } = await this.admin.from('explore_article_enrichments')
      .select('*').eq('fund_id', this.fundId).eq('collector_entry_id', entryId).maybeSingle()
    if (error) throw error
    return data ? semanticRecord(data as unknown as Row) : null
  }

  async findReusableSemantic(contentHash: string, version: string, now: Date): Promise<StoredSemanticEnrichment | null> {
    const { data, error } = await this.admin.from('explore_article_enrichments')
      .select('*')
      .eq('fund_id', this.fundId)
      .eq('content_hash', contentHash)
      .eq('semantic_version', version)
      .eq('processing_status', 'enriched')
      .gt('expires_at', now.toISOString())
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data ? semanticRecord(data as unknown as Row) : null
  }

  async saveSemanticSuccess(input: SaveSemanticSuccessInput): Promise<StoredSemanticEnrichment> {
    const { article, result } = input
    const expiresAt = new Date(input.now.getTime() + RETENTION_MS).toISOString()
    const { data, error } = await this.admin.from('explore_article_enrichments').upsert({
      fund_id: this.fundId,
      collector_entry_id: article.upstreamId,
      collector_entry_ref: exploreEntryRef(article.upstreamId),
      content_hash: input.contentHash,
      canonical_url: article.url,
      title: article.title,
      source_ref: exploreSourceRef(article.source.externalFeedId),
      source_title: article.source.title,
      category_ref: article.source.category ? exploreCategoryRef(article.source.category.externalCategoryId) : null,
      published_at: article.publishedAt,
      changed_at: article.changedAt,
      processing_status: 'enriched',
      semantic_version: result.version,
      semantic_payload: result.value as never,
      semantic_provider: result.provider,
      semantic_model: result.model,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      failure_code: null,
      retry_count: 0,
      retry_after: null,
      processed_at: input.now.toISOString(),
      expires_at: expiresAt,
      updated_at: input.now.toISOString(),
    }, { onConflict: 'fund_id,collector_entry_id' }).select('*').single()
    if (error) throw error
    return semanticRecord(data as unknown as Row)
  }

  async saveSemanticFailure(input: {
    article: import('../contracts').FeedEntry
    contentHash: string
    version: string
    failureCode: string
    retryAfter: Date
    now: Date
  }): Promise<void> {
    const existing = await this.findSemanticForEntry(input.article.upstreamId)
    const { article } = input
    const { error } = await this.admin.from('explore_article_enrichments').upsert({
      fund_id: this.fundId,
      collector_entry_id: article.upstreamId,
      collector_entry_ref: exploreEntryRef(article.upstreamId),
      content_hash: input.contentHash,
      canonical_url: article.url,
      title: article.title,
      source_ref: exploreSourceRef(article.source.externalFeedId),
      source_title: article.source.title,
      category_ref: article.source.category ? exploreCategoryRef(article.source.category.externalCategoryId) : null,
      published_at: article.publishedAt,
      changed_at: article.changedAt,
      processing_status: 'failed',
      semantic_version: input.version,
      semantic_payload: null,
      semantic_provider: null,
      semantic_model: null,
      input_tokens: null,
      output_tokens: null,
      failure_code: input.failureCode,
      retry_count: Math.min((existing?.retryCount ?? 0) + 1, 10),
      retry_after: input.retryAfter.toISOString(),
      processed_at: input.now.toISOString(),
      expires_at: new Date(input.now.getTime() + RETENTION_MS).toISOString(),
      updated_at: input.now.toISOString(),
    }, { onConflict: 'fund_id,collector_entry_id' })
    if (error) throw error
  }

  async findClassificationForEnrichment(enrichmentId: string, version: string): Promise<StoredDealClassification | null> {
    const { data, error } = await this.admin.from('explore_article_deal_classifications')
      .select('*').eq('fund_id', this.fundId).eq('enrichment_id', enrichmentId).eq('classifier_version', version).maybeSingle()
    if (error) throw error
    return data ? classificationRecord(data as unknown as Row) : null
  }

  async findReusableClassification(contentHash: string, version: string, now: Date): Promise<StoredDealClassification | null> {
    const { data, error } = await this.admin.from('explore_article_deal_classifications')
      .select('*')
      .eq('fund_id', this.fundId)
      .eq('content_hash', contentHash)
      .eq('classifier_version', version)
      .eq('classification_status', 'classified')
      .gt('expires_at', now.toISOString())
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data ? classificationRecord(data as unknown as Row) : null
  }

  async saveClassificationSuccess(input: SaveClassificationSuccessInput): Promise<StoredDealClassification> {
    const { result } = input
    const { data, error } = await this.admin.from('explore_article_deal_classifications').upsert({
      fund_id: this.fundId,
      enrichment_id: input.enrichmentId,
      content_hash: input.contentHash,
      classification_status: 'classified',
      classifier_version: result.version,
      classification_payload: result.value as never,
      classifier_provider: result.provider,
      classifier_model: result.model,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      failure_code: null,
      retry_count: 0,
      retry_after: null,
      classified_at: input.now.toISOString(),
      expires_at: new Date(input.now.getTime() + RETENTION_MS).toISOString(),
      updated_at: input.now.toISOString(),
    }, { onConflict: 'fund_id,enrichment_id,classifier_version' }).select('*').single()
    if (error) throw error
    return classificationRecord(data as unknown as Row)
  }

  async saveClassificationFailure(input: {
    enrichmentId: string
    contentHash: string
    version: string
    failureCode: string
    retryAfter: Date
    now: Date
  }): Promise<void> {
    const existing = await this.findClassificationForEnrichment(input.enrichmentId, input.version)
    const { error } = await this.admin.from('explore_article_deal_classifications').upsert({
      fund_id: this.fundId,
      enrichment_id: input.enrichmentId,
      content_hash: input.contentHash,
      classification_status: 'failed',
      classifier_version: input.version,
      classification_payload: null,
      classifier_provider: null,
      classifier_model: null,
      input_tokens: null,
      output_tokens: null,
      failure_code: input.failureCode,
      retry_count: Math.min((existing?.retryCount ?? 0) + 1, 10),
      retry_after: input.retryAfter.toISOString(),
      classified_at: input.now.toISOString(),
      expires_at: new Date(input.now.getTime() + RETENTION_MS).toISOString(),
      updated_at: input.now.toISOString(),
    }, { onConflict: 'fund_id,enrichment_id,classifier_version' })
    if (error) throw error
  }
}

function semanticRecord(row: Row): StoredSemanticEnrichment {
  return Object.freeze({
    id: String(row.id),
    collectorEntryId: Number(row.collector_entry_id),
    contentHash: String(row.content_hash),
    semanticVersion: String(row.semantic_version),
    status: row.processing_status as StoredSemanticEnrichment['status'],
    payload: row.semantic_payload ?? null,
    provider: provider(row.semantic_provider),
    model: typeof row.semantic_model === 'string' ? row.semantic_model : null,
    inputTokens: numberOrNull(row.input_tokens),
    outputTokens: numberOrNull(row.output_tokens),
    retryCount: Number(row.retry_count),
    retryAfter: typeof row.retry_after === 'string' ? row.retry_after : null,
    expiresAt: String(row.expires_at),
  })
}

function classificationRecord(row: Row): StoredDealClassification {
  return Object.freeze({
    id: String(row.id),
    enrichmentId: String(row.enrichment_id),
    contentHash: String(row.content_hash),
    classifierVersion: String(row.classifier_version),
    status: row.classification_status as StoredDealClassification['status'],
    payload: row.classification_payload ?? null,
    provider: provider(row.classifier_provider),
    model: typeof row.classifier_model === 'string' ? row.classifier_model : null,
    inputTokens: numberOrNull(row.input_tokens),
    outputTokens: numberOrNull(row.output_tokens),
    retryCount: Number(row.retry_count),
    retryAfter: typeof row.retry_after === 'string' ? row.retry_after : null,
    expiresAt: String(row.expires_at),
  })
}

function provider(value: unknown): StoredSemanticEnrichment['provider'] {
  return value === 'anthropic' || value === 'openai' || value === 'gemini' || value === 'openrouter' ? value : null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
