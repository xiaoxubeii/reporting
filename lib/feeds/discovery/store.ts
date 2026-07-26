import type { FeedEntry } from '../contracts'
import { DEAL_CLASSIFIER_VERSION, SEMANTIC_VERSION, type DiscoveryAIProviderType } from './config'
import {
  parseDealSignalClassification,
  parseSemanticEnrichment,
  type DealSignalClassification,
  type SemanticEnrichment,
} from './contracts'
import type { DealClassifierResult } from './deal-signal'
import { DiscoveryAIError, type SemanticTagResult } from './semantic-tagger'

export type StoredSemanticStatus = 'pending' | 'enriched' | 'skipped' | 'failed'
export type StoredClassificationStatus = 'pending' | 'classified' | 'skipped' | 'failed'

export interface StoredSemanticEnrichment {
  readonly id: string
  readonly collectorEntryId: number
  readonly contentHash: string
  readonly semanticVersion: string
  readonly status: StoredSemanticStatus
  readonly payload: unknown | null
  readonly provider: DiscoveryAIProviderType | null
  readonly model: string | null
  readonly inputTokens: number | null
  readonly outputTokens: number | null
  readonly retryCount: number
  readonly retryAfter: string | null
  readonly expiresAt: string
}

export interface StoredDealClassification {
  readonly id: string
  readonly enrichmentId: string
  readonly contentHash: string
  readonly classifierVersion: string
  readonly status: StoredClassificationStatus
  readonly payload: unknown | null
  readonly provider: DiscoveryAIProviderType | null
  readonly model: string | null
  readonly inputTokens: number | null
  readonly outputTokens: number | null
  readonly retryCount: number
  readonly retryAfter: string | null
  readonly expiresAt: string
}

export interface SaveSemanticSuccessInput {
  readonly article: FeedEntry
  readonly contentHash: string
  readonly result: SemanticTagResult
  readonly now: Date
  readonly copiedFrom?: StoredSemanticEnrichment
}

export interface SaveClassificationSuccessInput {
  readonly enrichmentId: string
  readonly contentHash: string
  readonly result: DealClassifierResult
  readonly now: Date
  readonly copiedFrom?: StoredDealClassification
}

export interface DiscoveryRepository {
  findSemanticForEntry(entryId: number): Promise<StoredSemanticEnrichment | null>
  findReusableSemantic(contentHash: string, version: string, now: Date): Promise<StoredSemanticEnrichment | null>
  saveSemanticSuccess(input: SaveSemanticSuccessInput): Promise<StoredSemanticEnrichment>
  saveSemanticFailure(input: {
    readonly article: FeedEntry
    readonly contentHash: string
    readonly version: string
    readonly failureCode: string
    readonly retryAfter: Date
    readonly now: Date
  }): Promise<void>
  findClassificationForEnrichment(enrichmentId: string, version: string): Promise<StoredDealClassification | null>
  findReusableClassification(contentHash: string, version: string, now: Date): Promise<StoredDealClassification | null>
  saveClassificationSuccess(input: SaveClassificationSuccessInput): Promise<StoredDealClassification>
  saveClassificationFailure(input: {
    readonly enrichmentId: string
    readonly contentHash: string
    readonly version: string
    readonly failureCode: string
    readonly retryAfter: Date
    readonly now: Date
  }): Promise<void>
}

type Resolution<TRecord, TValue> =
  | Readonly<{ state: 'reused' | 'created'; record: TRecord; value: TValue }>
  | Readonly<{ state: 'deferred' | 'failed'; record: null; value: null }>

export class DiscoveryStore {
  constructor(
    private readonly repository: DiscoveryRepository,
    private readonly versions = { semantic: SEMANTIC_VERSION, classifier: DEAL_CLASSIFIER_VERSION },
  ) {}

  async resolveSemantic(input: {
    readonly article: FeedEntry
    readonly contentHash: string
    readonly now: Date
    readonly compute: () => Promise<SemanticTagResult>
  }): Promise<Resolution<StoredSemanticEnrichment, SemanticEnrichment>> {
    const sourceText = sourceTextFor(input.article)
    const exact = await this.repository.findSemanticForEntry(input.article.upstreamId)
    if (isDeferredSemantic(exact, input.contentHash, this.versions.semantic, input.now)) return deferred()
    const exactValue = validSemantic(exact, input.contentHash, this.versions.semantic, sourceText, input.now)
    if (exact && exactValue) return reused(exact, exactValue)

    const reusable = await this.repository.findReusableSemantic(input.contentHash, this.versions.semantic, input.now)
    const reusableValue = validSemantic(reusable, input.contentHash, this.versions.semantic, sourceText, input.now)
    if (reusable && reusableValue && reusable.provider && reusable.model) {
      const result = storedSemanticResult(reusable, reusableValue, this.versions.semantic)
      const record = await this.repository.saveSemanticSuccess({ ...input, result, copiedFrom: reusable })
      return reused(record, reusableValue)
    }

    try {
      const result = await input.compute()
      const record = await this.repository.saveSemanticSuccess({ ...input, result })
      return created(record, result.value)
    } catch (error) {
      await this.repository.saveSemanticFailure({
        article: input.article,
        contentHash: input.contentHash,
        version: this.versions.semantic,
        failureCode: failureCode(error),
        retryAfter: new Date(input.now.getTime() + 60 * 60 * 1_000),
        now: input.now,
      })
      return failed()
    }
  }

  async resolveClassification(input: {
    readonly enrichment: StoredSemanticEnrichment
    readonly sourceText: string
    readonly now: Date
    readonly compute: () => Promise<DealClassifierResult>
  }): Promise<Resolution<StoredDealClassification, DealSignalClassification>> {
    const exact = await this.repository.findClassificationForEnrichment(input.enrichment.id, this.versions.classifier)
    if (isDeferredClassification(exact, input.enrichment.contentHash, this.versions.classifier, input.now)) return deferred()
    const exactValue = validClassification(exact, input.enrichment.contentHash, this.versions.classifier, input.sourceText, input.now)
    if (exact && exactValue) return reused(exact, exactValue)

    const reusable = await this.repository.findReusableClassification(
      input.enrichment.contentHash,
      this.versions.classifier,
      input.now,
    )
    const reusableValue = validClassification(
      reusable,
      input.enrichment.contentHash,
      this.versions.classifier,
      input.sourceText,
      input.now,
    )
    if (reusable && reusableValue && reusable.provider && reusable.model) {
      const result = storedClassificationResult(reusable, reusableValue, this.versions.classifier)
      const record = await this.repository.saveClassificationSuccess({
        enrichmentId: input.enrichment.id,
        contentHash: input.enrichment.contentHash,
        result,
        now: input.now,
        copiedFrom: reusable,
      })
      return reused(record, reusableValue)
    }

    try {
      const result = await input.compute()
      const record = await this.repository.saveClassificationSuccess({
        enrichmentId: input.enrichment.id,
        contentHash: input.enrichment.contentHash,
        result,
        now: input.now,
      })
      return created(record, result.value)
    } catch (error) {
      await this.repository.saveClassificationFailure({
        enrichmentId: input.enrichment.id,
        contentHash: input.enrichment.contentHash,
        version: this.versions.classifier,
        failureCode: failureCode(error),
        retryAfter: new Date(input.now.getTime() + 60 * 60 * 1_000),
        now: input.now,
      })
      return failed()
    }
  }
}

function validSemantic(
  record: StoredSemanticEnrichment | null,
  hash: string,
  version: string,
  sourceText: string,
  now: Date,
): SemanticEnrichment | null {
  if (!record || record.status !== 'enriched' || record.contentHash !== hash || record.semanticVersion !== version) return null
  if (Date.parse(record.expiresAt) <= now.getTime() || record.payload === null) return null
  try { return parseSemanticEnrichment(record.payload, sourceText) } catch { return null }
}

function validClassification(
  record: StoredDealClassification | null,
  hash: string,
  version: string,
  sourceText: string,
  now: Date,
): DealSignalClassification | null {
  if (!record || record.status !== 'classified' || record.contentHash !== hash || record.classifierVersion !== version) return null
  if (Date.parse(record.expiresAt) <= now.getTime() || record.payload === null) return null
  try { return parseDealSignalClassification(record.payload, sourceText) } catch { return null }
}

function isDeferredSemantic(record: StoredSemanticEnrichment | null, hash: string, version: string, now: Date): boolean {
  return record?.status === 'failed' && record.contentHash === hash && record.semanticVersion === version && Date.parse(record.retryAfter ?? '') > now.getTime()
}

function isDeferredClassification(record: StoredDealClassification | null, hash: string, version: string, now: Date): boolean {
  return record?.status === 'failed' && record.contentHash === hash && record.classifierVersion === version && Date.parse(record.retryAfter ?? '') > now.getTime()
}

function storedSemanticResult(record: StoredSemanticEnrichment, value: SemanticEnrichment, version: string): SemanticTagResult {
  return {
    value,
    provider: record.provider!,
    model: record.model!,
    version,
    usage: { inputTokens: record.inputTokens ?? 0, outputTokens: record.outputTokens ?? 0 },
    attemptCount: 0,
  }
}

function storedClassificationResult(record: StoredDealClassification, value: DealSignalClassification, version: string): DealClassifierResult {
  return {
    value,
    provider: record.provider!,
    model: record.model!,
    version,
    usage: { inputTokens: record.inputTokens ?? 0, outputTokens: record.outputTokens ?? 0 },
    attemptCount: 0,
  }
}

function sourceTextFor(article: FeedEntry): string {
  return [article.title, article.summary, article.contentText].join('\n').slice(0, 20_000)
}

function failureCode(error: unknown): string {
  return error instanceof DiscoveryAIError ? error.code : 'provider_unavailable'
}

function reused<TRecord, TValue>(record: TRecord, value: TValue): Resolution<TRecord, TValue> {
  return Object.freeze({ state: 'reused', record, value })
}
function created<TRecord, TValue>(record: TRecord, value: TValue): Resolution<TRecord, TValue> {
  return Object.freeze({ state: 'created', record, value })
}
function deferred<TRecord, TValue>(): Resolution<TRecord, TValue> {
  return Object.freeze({ state: 'deferred', record: null, value: null })
}
function failed<TRecord, TValue>(): Resolution<TRecord, TValue> {
  return Object.freeze({ state: 'failed', record: null, value: null })
}
