import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/types/database'
import type {
  MaterializationClassification,
  MaterializationEnrichment,
  PublishItem,
} from './materialize'
import { validateDiscoveryFundId } from './config'

type Admin = ReturnType<typeof createAdminClient>
const MATERIALIZATION_PAGE_SIZE = 1_000
const MAX_MATERIALIZATION_ROWS = 50_000
const CLASSIFICATION_ID_BATCH_SIZE = 100

export interface DiscoveryLease {
  readonly id: string
  readonly expiresAt: string
  readonly entryWatermark: number
  readonly changedWatermark: string | null
  readonly changedEntryId: number
  readonly changedScanCutoff: string | null
  readonly activeGenerationId: string | null
}

export interface DiscoveryReadState {
  readonly activeGenerationId: string | null
  readonly generatedAt: string | null
  readonly lastAttemptAt: string | null
  readonly lastErrorCode: string | null
}

export interface StoredDiscoveryRow {
  readonly id: string
  readonly kind: 'trending' | 'deal_signal'
  readonly title: string
  readonly summary: string
  readonly score: number
  readonly sourceEntryRefs: unknown
  readonly evidence: unknown
  readonly metadata: unknown
  readonly generatedAt: string
}

export class DiscoveryRuntimeStore {
  private readonly fundId: string

  constructor(fundId: string, private readonly admin: Admin = createAdminClient()) {
    this.fundId = validateDiscoveryFundId(fundId)
  }

  async claim(input: {
    leaseId: string
    leaseSeconds: number
    semanticVersion: string
    classifierVersion: string
  }): Promise<DiscoveryLease | null> {
    const { data, error } = await this.admin.rpc('claim_explore_discovery_refresh', {
      p_fund_id: this.fundId,
      p_lease_id: input.leaseId,
      p_lease_seconds: input.leaseSeconds,
      p_semantic_version: input.semanticVersion,
      p_classifier_version: input.classifierVersion,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : null
    if (!row || row.acquired !== true) return null
    return Object.freeze({
      id: input.leaseId,
      expiresAt: String(row.lease_until),
      entryWatermark: Number(row.entry_watermark),
      changedWatermark: typeof row.changed_watermark === 'string' ? row.changed_watermark : null,
      changedEntryId: Number(row.changed_entry_id),
      changedScanCutoff: typeof row.changed_scan_cutoff === 'string' ? row.changed_scan_cutoff : null,
      activeGenerationId: typeof row.active_generation === 'string' ? row.active_generation : null,
    })
  }

  async finish(input: {
    leaseId: string
    entryWatermark: number
    changedWatermark: string | null
    changedEntryId: number
    changedScanCutoff: string | null
    errorCode: string | null
  }): Promise<boolean> {
    const { data, error } = await this.admin.rpc('finish_explore_discovery_refresh', {
      p_fund_id: this.fundId,
      p_lease_id: input.leaseId,
      p_watermark_entry_id: input.entryWatermark,
      p_watermark_changed_at: input.changedWatermark,
      p_watermark_changed_entry_id: input.changedEntryId,
      p_watermark_changed_scan_cutoff: input.changedScanCutoff,
      p_error_code: input.errorCode,
    })
    if (error) throw error
    return data === true
  }

  async loadMaterialization(now: Date, semanticVersion: string, classifierVersion: string): Promise<{
    enrichments: readonly MaterializationEnrichment[]
    classifications: readonly MaterializationClassification[]
    complete: boolean
  }> {
    const retentionStart = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1_000).toISOString()
    const enrichmentResult = await collectMaterializationRows(async (from, to) => {
      const { data, error } = await this.admin
        .from('explore_article_enrichments')
        .select('id, collector_entry_id, collector_entry_ref, content_hash, title, canonical_url, source_ref, source_title, published_at, changed_at, processing_status, semantic_version, semantic_payload')
        .eq('fund_id', this.fundId)
        .gte('published_at', retentionStart)
        .gt('expires_at', now.toISOString())
        .order('collector_entry_id', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
      if (error) throw error
      return data ?? []
    })
    if (!enrichmentResult.complete) return Object.freeze({ enrichments: [], classifications: [], complete: false })
    const relevantRows = latestContentRows(enrichmentResult.rows)
    const targetRows = relevantRows.filter(row => row.semantic_version === semanticVersion)
    const targetEntries = new Set(targetRows
      .filter(row => row.processing_status === 'enriched' && row.semantic_payload)
      .map(row => `${row.collector_entry_id}:${row.content_hash}`))
    const incompleteSemantic = relevantRows.some(row =>
      !targetEntries.has(`${row.collector_entry_id}:${row.content_hash}`),
    )
    const rows = targetRows.flatMap(row => {
      if (row.semantic_version !== semanticVersion || row.processing_status !== 'enriched' || !row.published_at || !row.semantic_payload) return []
      return [{
        id: row.id,
        entryId: row.collector_entry_id,
        entryRef: row.collector_entry_ref,
        contentHash: row.content_hash,
        title: row.title,
        url: row.canonical_url,
        sourceRef: row.source_ref,
        sourceTitle: row.source_title,
        publishedAt: row.published_at,
        semanticPayload: row.semantic_payload,
      }]
    })
    if (rows.length === 0) return Object.freeze({ enrichments: [], classifications: [], complete: !incompleteSemantic })
    const targetById = new Map(rows.map(row => [row.id, row.contentHash]))
    const classificationRows = [] as Array<{
      enrichmentId: string
      contentHash: string
      classificationPayload: Json
    }>
    const enrichmentIds = Array.from(targetById.keys())
    for (let offset = 0; offset < enrichmentIds.length; offset += CLASSIFICATION_ID_BATCH_SIZE) {
      const ids = enrichmentIds.slice(offset, offset + CLASSIFICATION_ID_BATCH_SIZE)
      const { data, error } = await this.admin
        .from('explore_article_deal_classifications')
        .select('enrichment_id, content_hash, classification_payload')
        .eq('fund_id', this.fundId)
        .eq('classification_status', 'classified')
        .eq('classifier_version', classifierVersion)
        .in('enrichment_id', ids)
        .gt('expires_at', now.toISOString())
      if (error) throw error
      for (const row of data ?? []) {
        if (!row.classification_payload || targetById.get(row.enrichment_id) !== row.content_hash) continue
        classificationRows.push({
          enrichmentId: row.enrichment_id,
          contentHash: row.content_hash,
          classificationPayload: row.classification_payload,
        })
      }
    }
    const classifiedContent = new Set(classificationRows.map(row => `${row.enrichmentId}:${row.contentHash}`))
    const incompleteClassification = rows.some(row =>
      semanticNeedsDealClassification(row.semanticPayload) && !classifiedContent.has(`${row.id}:${row.contentHash}`),
    )
    return Object.freeze({
      enrichments: Object.freeze(rows),
      classifications: Object.freeze(classificationRows),
      complete: !incompleteSemantic && !incompleteClassification,
    })
  }

  async publish(input: {
    leaseId: string
    generationId: string
    semanticVersion: string
    classifierVersion: string
    items: readonly PublishItem[]
    entryWatermark: number
    changedWatermark: string | null
    changedEntryId: number
    changedScanCutoff: string | null
    generatedAt: Date
    expiresAt: Date
  }): Promise<number> {
    const { data, error } = await this.admin.rpc('publish_explore_discovery_generation', {
      p_fund_id: this.fundId,
      p_lease_id: input.leaseId,
      p_generation_id: input.generationId,
      p_items: input.items as unknown as Json,
      p_semantic_version: input.semanticVersion,
      p_classifier_version: input.classifierVersion,
      p_watermark_entry_id: input.entryWatermark,
      p_watermark_changed_at: input.changedWatermark,
      p_watermark_changed_entry_id: input.changedEntryId,
      p_watermark_changed_scan_cutoff: input.changedScanCutoff,
      p_generated_at: input.generatedAt.toISOString(),
      p_expires_at: input.expiresAt.toISOString(),
    })
    if (error) throw error
    return Number(data ?? 0)
  }

  async cleanupExpired(now: Date, activeGenerationId: string | null): Promise<number> {
    const timestamp = now.toISOString()
    const [classifications, enrichments, items] = await Promise.all([
      this.admin.from('explore_article_deal_classifications').delete().eq('fund_id', this.fundId).lt('expires_at', timestamp).select('id'),
      this.admin.from('explore_article_enrichments').delete().eq('fund_id', this.fundId).lt('expires_at', timestamp).select('id'),
      activeGenerationId
        ? this.admin.from('explore_discovery_items').delete().eq('fund_id', this.fundId).lt('expires_at', timestamp).neq('generation_id', activeGenerationId).select('id')
        : this.admin.from('explore_discovery_items').delete().eq('fund_id', this.fundId).lt('expires_at', timestamp).select('id'),
    ])
    for (const result of [classifications, enrichments, items]) if (result.error) throw result.error
    return (classifications.data?.length ?? 0) + (enrichments.data?.length ?? 0) + (items.data?.length ?? 0)
  }

  async readState(): Promise<DiscoveryReadState> {
    const { data, error } = await this.admin.from('explore_discovery_refresh_state')
      .select('active_generation_id, last_success_at, last_attempt_at, last_error_code')
      .eq('fund_id', this.fundId)
      .eq('scope', 'public_explore')
      .maybeSingle()
    if (error) throw error
    if (!data) {
      return Object.freeze({
        activeGenerationId: null,
        generatedAt: null,
        lastAttemptAt: null,
        lastErrorCode: null,
      })
    }
    return Object.freeze({
      activeGenerationId: data.active_generation_id,
      generatedAt: data.last_success_at,
      lastAttemptAt: data.last_attempt_at,
      lastErrorCode: data.last_error_code,
    })
  }

  async readItems(input: {
    generationId: string
    kind: 'trending' | 'deal_signal'
    limit: number
    offset: number
  }): Promise<{ rows: readonly StoredDiscoveryRow[]; total: number }> {
    const { data, error, count } = await this.admin.from('explore_discovery_items')
      .select('id, kind, title, summary, score, source_entry_refs, evidence_json, metadata_json, generated_at', { count: 'exact' })
      .eq('fund_id', this.fundId)
      .eq('generation_id', input.generationId)
      .eq('kind', input.kind)
      .order('score', { ascending: false })
      .order('result_key', { ascending: true })
      .range(input.offset, input.offset + input.limit - 1)
    if (error) throw error
    return Object.freeze({
      rows: Object.freeze((data ?? []).map(row => Object.freeze({
        id: row.id,
        kind: row.kind as 'trending' | 'deal_signal',
        title: row.title,
        summary: row.summary,
        score: row.score,
        sourceEntryRefs: row.source_entry_refs,
        evidence: row.evidence_json,
        metadata: row.metadata_json,
        generatedAt: row.generated_at,
      }))),
      total: count ?? 0,
    })
  }
}

export async function collectMaterializationRows<T>(
  fetchPage: (from: number, to: number) => Promise<readonly T[]>,
  options: Readonly<{ pageSize?: number; maxRows?: number }> = {},
): Promise<Readonly<{ rows: readonly T[]; complete: boolean }>> {
  const pageSize = options.pageSize ?? MATERIALIZATION_PAGE_SIZE
  const maxRows = options.maxRows ?? MAX_MATERIALIZATION_ROWS
  if (!Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(maxRows) || maxRows < 1) {
    throw new Error('Invalid materialization pagination bounds')
  }

  const rows: T[] = []
  while (rows.length < maxRows) {
    const from = rows.length
    const to = Math.min(from + pageSize - 1, maxRows - 1)
    const page = await fetchPage(from, to)
    const requested = to - from + 1
    rows.push(...page.slice(0, requested))
    if (page.length < requested) return Object.freeze({ rows: Object.freeze(rows), complete: true })
  }

  const overflow = await fetchPage(maxRows, maxRows)
  return Object.freeze({ rows: Object.freeze(rows), complete: overflow.length === 0 })
}

function latestContentRows<T extends {
  collector_entry_id: number
  content_hash: string
  changed_at: string | null
}>(rows: readonly T[]): readonly T[] {
  const latestChangedAt = new Map<number, number>()
  for (const row of rows) {
    const parsed = Date.parse(row.changed_at ?? '')
    const timestamp = Number.isFinite(parsed) ? parsed : 0
    const previous = latestChangedAt.get(row.collector_entry_id) ?? Number.NEGATIVE_INFINITY
    if (timestamp > previous) latestChangedAt.set(row.collector_entry_id, timestamp)
  }
  return rows.filter(row => {
    const parsed = Date.parse(row.changed_at ?? '')
    const timestamp = Number.isFinite(parsed) ? parsed : 0
    return timestamp === latestChangedAt.get(row.collector_entry_id)
  })
}

function semanticNeedsDealClassification(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const events = (value as Record<string, unknown>).events
  return Array.isArray(events) && events.some(event => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return false
    const row = event as Record<string, unknown>
    return row.type === 'funding' && row.status === 'active'
  })
}
