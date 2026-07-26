import { createHash, randomUUID } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'
import type { FeedEntry } from '../contracts'
import { createPublicExploreCollector, type CollectorIncrementalPage } from './collector'
import { DEAL_CLASSIFIER_VERSION, SEMANTIC_VERSION } from './config'
import { parseRefreshSummary, type RefreshSummary } from './contracts'
import { DealSignalClassifier, shouldClassifyDealSignal } from './deal-signal'
import { materializeDiscovery, type MaterializationClassification, type MaterializationEnrichment, type PublishItem } from './materialize'
import { DiscoveryRuntimeStore, type DiscoveryLease } from './runtime-store'
import { SemanticTagger } from './semantic-tagger'
import { DiscoveryStore } from './store'
import { SupabaseDiscoveryRepository } from './supabase-repository'
import { resolveDiscoveryAIProvider } from './provider'

const MAX_ARTICLES_PER_RUN = 100
const MAX_AI_TOKENS_PER_RUN = 500_000
// Reserve 30 seconds inside the 270-second worker HTTP budget for materializing,
// publishing, cleanup, and finalizing the persisted background attempt.
const MAX_RUN_MS = 240_000
const LEASE_SECONDS = 5 * 60
const INITIAL_CHANGED_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1_000
const RESULT_RETENTION_MS = 48 * 60 * 60 * 1_000

type ProcessState = 'created' | 'reused' | 'deferred' | 'failed' | 'skipped'

interface RefreshRuntime {
  claim(input: { leaseId: string; leaseSeconds: number; semanticVersion: string; classifierVersion: string }): Promise<DiscoveryLease | null>
  finish(input: { leaseId: string; entryWatermark: number; changedWatermark: string | null; changedEntryId: number; changedScanCutoff: string | null; errorCode: string | null }): Promise<boolean>
  loadMaterialization(now: Date, semanticVersion?: string, classifierVersion?: string): Promise<{
    enrichments: readonly MaterializationEnrichment[]
    classifications: readonly MaterializationClassification[]
    complete?: boolean
  }>
  publish(input: {
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
  }): Promise<number>
  cleanupExpired(now: Date, activeGenerationId: string | null): Promise<number>
}

interface RefreshCollector {
  listIncremental(input: {
    limit: number
    afterEntryId?: number
    changedAfter?: Date
  }): Promise<CollectorIncrementalPage>
}

interface RefreshLogger {
  info(event: string, fields: Readonly<Record<string, number | string | boolean>>): void
  warn(event: string, fields: Readonly<Record<string, number | string | boolean>>): void
}

interface RefreshDependencies {
  runtime: RefreshRuntime
  collector: RefreshCollector
  processEntry(entry: FeedEntry, now: Date, deadline: Date): Promise<{ semantic: ProcessState; classification: ProcessState; tokens: number }>
  materialize(input: {
    enrichments: readonly MaterializationEnrichment[]
    classifications: readonly MaterializationClassification[]
    now: Date
  }): readonly PublishItem[]
  clock: { now(): Date }
  randomUUID(): string
  logger: RefreshLogger
  semanticVersion?: string
  classifierVersion?: string
}

export type DiscoveryRefreshOutcome = Readonly<{
  state: 'skipped' | 'published' | 'partial' | 'failed'
  summary: RefreshSummary
}>

export class DiscoveryRefreshService {
  constructor(private readonly deps: RefreshDependencies) {}

  async run(): Promise<DiscoveryRefreshOutcome> {
    const startedAt = this.deps.clock.now()
    const leaseId = this.deps.randomUUID()
    const summary = emptySummary()
    let lease: DiscoveryLease | null = null
    let entryWatermark = 0
    let changedWatermark: string | null = null
    let changedEntryId = 0
    let changedScanCutoff: string | null = null
    try {
      lease = await this.deps.runtime.claim({
        leaseId,
        leaseSeconds: LEASE_SECONDS,
        semanticVersion: this.deps.semanticVersion ?? SEMANTIC_VERSION,
        classifierVersion: this.deps.classifierVersion ?? DEAL_CLASSIFIER_VERSION,
      })
      if (!lease) return outcome('skipped', summary)
      entryWatermark = lease.entryWatermark
      changedWatermark = lease.changedWatermark
      changedEntryId = lease.changedEntryId
      changedScanCutoff = lease.changedScanCutoff

      const newPage = await this.deps.collector.listIncremental({
        limit: MAX_ARTICLES_PER_RUN,
        afterEntryId: lease.entryWatermark,
      })
      const remaining = Math.max(0, MAX_ARTICLES_PER_RUN - newPage.items.length)
      const changedScanStartedAt = lease.changedScanCutoff
        ? new Date(lease.changedScanCutoff)
        : this.deps.clock.now()
      const changedPage = remaining > 0 && newPage.nextOffset === null
        ? await this.deps.collector.listIncremental({
          limit: remaining,
          afterEntryId: lease.changedEntryId,
          changedAfter: new Date(lease.changedWatermark ?? (startedAt.getTime() - INITIAL_CHANGED_LOOKBACK_MS)),
        })
        : emptyPage()
      const entries = uniqueEntries([...newPage.items, ...changedPage.items])
      const processedResults = new Map<number, {
        semantic: ProcessState
        classification: ProcessState
        tokens: number
      }>()
      let tokensUsed = 0
      let workLimited = false

      for (const entry of entries) {
        if (this.deps.clock.now().getTime() - startedAt.getTime() >= MAX_RUN_MS || tokensUsed >= MAX_AI_TOKENS_PER_RUN) {
          workLimited = true
          break
        }
        const result = await this.deps.processEntry(entry, startedAt, new Date(startedAt.getTime() + MAX_RUN_MS - 5_000))
        processedResults.set(entry.upstreamId, result)
        summary.scanned += 1
        tokensUsed += Math.max(0, result.tokens)
        countState(summary, result.semantic, 'enriched')
        countState(summary, result.classification, 'classified')
      }
      const hasRetryableEntries = Array.from(processedResults.values()).some(result => !isWatermarkSafe(result))
      entryWatermark = safeEntryWatermark(newPage.items, processedResults, lease.entryWatermark, newPage.scanCursor)

      const hitLimit = workLimited || newPage.nextOffset !== null || changedPage.nextOffset !== null
      if (hitLimit || hasRetryableEntries || summary.failed > 0) {
        const errorCode = hitLimit ? 'work_limit' : 'partial_failure'
        if (!hasRetryableEntries && !workLimited && changedPage.nextOffset !== null && changedPage.scanCursor !== null) {
          changedEntryId = changedPage.scanCursor
          changedScanCutoff = changedScanStartedAt.toISOString()
        }
        await this.deps.runtime.finish({ leaseId, entryWatermark, changedWatermark, changedEntryId, changedScanCutoff, errorCode })
        this.deps.logger.warn('feed_discovery_refresh_partial', { code: errorCode, scanned: summary.scanned, failed: summary.failed })
        return outcome('partial', summary)
      }
      changedWatermark = changedScanStartedAt.toISOString()
      changedEntryId = 0
      changedScanCutoff = null

      const materialization = await this.deps.runtime.loadMaterialization(
        startedAt,
        this.deps.semanticVersion ?? SEMANTIC_VERSION,
        this.deps.classifierVersion ?? DEAL_CLASSIFIER_VERSION,
      )
      if (materialization.complete === false) {
        await this.deps.runtime.finish({ leaseId, entryWatermark, changedWatermark, changedEntryId, changedScanCutoff, errorCode: 'version_backfill' })
        return outcome('partial', summary)
      }
      const items = this.deps.materialize({ ...materialization, now: startedAt })
      const generationId = this.deps.randomUUID()
      summary.published = await this.deps.runtime.publish({
        leaseId,
        generationId,
        semanticVersion: this.deps.semanticVersion ?? SEMANTIC_VERSION,
        classifierVersion: this.deps.classifierVersion ?? DEAL_CLASSIFIER_VERSION,
        items,
        entryWatermark,
        changedWatermark,
        changedEntryId,
        changedScanCutoff,
        generatedAt: startedAt,
        expiresAt: new Date(startedAt.getTime() + RESULT_RETENTION_MS),
      })
      summary.expired = await this.deps.runtime.cleanupExpired(startedAt, generationId)
      this.deps.logger.info('feed_discovery_refresh_published', {
        scanned: summary.scanned,
        published: summary.published,
        failed: summary.failed,
      })
      return outcome('published', summary)
    } catch {
      if (lease) {
        await this.deps.runtime.finish({
          leaseId,
          entryWatermark,
          changedWatermark,
          changedEntryId,
          changedScanCutoff,
          errorCode: 'refresh_failed',
        }).catch(() => false)
      }
      summary.failed += 1
      this.deps.logger.warn('feed_discovery_refresh_failed', { code: 'refresh_failed', scanned: summary.scanned })
      return outcome('failed', summary)
    }
  }
}

export async function createDiscoveryRefreshService(fundId: string): Promise<DiscoveryRefreshService> {
  const admin = createAdminClient()
  const resolved = await resolveDiscoveryAIProvider(admin, fundId)
  const runtime = new DiscoveryRuntimeStore(resolved.fundId, admin)
  const collector = createPublicExploreCollector()
  const repository = new SupabaseDiscoveryRepository(resolved.fundId, admin)
  const store = new DiscoveryStore(repository, resolved.versions)
  const semanticTagger = new SemanticTagger({
    provider: resolved.provider,
    providerType: resolved.providerType,
    model: resolved.model,
    version: resolved.versions.semantic,
  })
  const classifier = new DealSignalClassifier({
    provider: resolved.provider,
    providerType: resolved.providerType,
    model: resolved.model,
    version: resolved.versions.classifier,
  })

  return new DiscoveryRefreshService({
    runtime,
    collector,
    clock: { now: () => new Date() },
    randomUUID,
    materialize: materializeDiscovery,
    logger: console,
    semanticVersion: resolved.versions.semantic,
    classifierVersion: resolved.versions.classifier,
    processEntry: async (entry, now, deadline) => {
      const contentHash = articleContentHash(entry)
      const semantic = await store.resolveSemantic({
        article: entry,
        contentHash,
        now,
        compute: () => semanticTagger.tag(entry, deadline),
      })
      if (!semantic.value || !semantic.record) {
        return { semantic: semantic.state, classification: 'skipped', tokens: 0 }
      }
      const semanticTokens = semantic.state === 'created'
        ? (semantic.record.inputTokens ?? 0) + (semantic.record.outputTokens ?? 0)
        : 0
      const sourceText = [entry.title, entry.summary, entry.contentText].join('\n').slice(0, 20_000)
      if (!shouldClassifyDealSignal(semantic.value, sourceText)) {
        return { semantic: semantic.state, classification: 'skipped', tokens: semanticTokens }
      }
      const classification = await store.resolveClassification({
        enrichment: semantic.record,
        sourceText,
        now,
        compute: () => classifier.classify(entry, deadline),
      })
      const classificationTokens = classification.state === 'created' && classification.record
        ? (classification.record.inputTokens ?? 0) + (classification.record.outputTokens ?? 0)
        : 0
      return { semantic: semantic.state, classification: classification.state, tokens: semanticTokens + classificationTokens }
    },
  })
}

export async function runFeedDiscoveryRefresh(fundId: string): Promise<DiscoveryRefreshOutcome> {
  try {
    return (await createDiscoveryRefreshService(fundId)).run()
  } catch {
    console.warn('feed_discovery_refresh_failed', { code: 'configuration_unavailable', scanned: 0 })
    const summary = emptySummary()
    summary.failed = 1
    return outcome('failed', summary)
  }
}

function articleContentHash(entry: FeedEntry): string {
  const normalized = [entry.title, entry.url ?? '', entry.contentText]
    .join('\n')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
  return createHash('sha256').update(normalized).digest('hex')
}

function uniqueEntries(entries: readonly FeedEntry[]): FeedEntry[] {
  const byId = new Map<number, FeedEntry>()
  for (const entry of entries) byId.set(entry.upstreamId, entry)
  return Array.from(byId.values()).sort((left, right) => left.upstreamId - right.upstreamId)
}

function safeEntryWatermark(
  entries: readonly FeedEntry[],
  results: ReadonlyMap<number, { semantic: ProcessState; classification: ProcessState }>,
  fallback: number,
  scanCursor: number | null,
): number {
  let watermark = fallback
  for (const entry of [...entries].sort((left, right) => left.upstreamId - right.upstreamId)) {
    const result = results.get(entry.upstreamId)
    if (!result || !isWatermarkSafe(result)) break
    watermark = Math.max(watermark, entry.upstreamId)
  }
  const allOwnedEntriesSafe = entries.every(entry => {
    const result = results.get(entry.upstreamId)
    return result !== undefined && isWatermarkSafe(result)
  })
  return allOwnedEntriesSafe && scanCursor !== null ? Math.max(watermark, scanCursor) : watermark
}

function isWatermarkSafe(result: { semantic: ProcessState; classification: ProcessState }): boolean {
  return !['failed', 'deferred'].includes(result.semantic)
    && !['failed', 'deferred'].includes(result.classification)
}

function emptyPage(): CollectorIncrementalPage {
  return Object.freeze({ items: [], total: 0, nextOffset: null, scanCursor: null })
}

function emptySummary(): Record<keyof RefreshSummary, number> {
  return { scanned: 0, reused: 0, enriched: 0, classified: 0, published: 0, skipped: 0, failed: 0, expired: 0 }
}

function countState(
  summary: Record<keyof RefreshSummary, number>,
  state: ProcessState,
  createdCounter: 'enriched' | 'classified',
): void {
  if (state === 'created') summary[createdCounter] += 1
  else if (state === 'reused') summary.reused += 1
  else if (state === 'failed') summary.failed += 1
  else summary.skipped += 1
}

function outcome(state: DiscoveryRefreshOutcome['state'], summary: Record<keyof RefreshSummary, number>): DiscoveryRefreshOutcome {
  return Object.freeze({ state, summary: parseRefreshSummary(summary) })
}
