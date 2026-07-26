import { DEAL_SIGNAL_STRATEGY_VERSION } from './config'
import {
  parseDealSignalClassification,
  parseSemanticEnrichment,
  type DealSignalClassification,
  type SemanticEnrichment,
} from './contracts'
import { dedupeDealSignals, isPublishableDealSignal } from './deal-signal'
import { calculateTrending, type TrendingObservation, type TrendingTagKind } from './trending'

const MAX_SOURCE_REFERENCES = 100
const MAX_SOURCE_REFERENCES_BYTES = 60_000
const MAX_PUBLISH_ITEMS = 500
const MAX_PUBLISH_BYTES = 900_000
const JSON_ENCODER = new TextEncoder()

export interface MaterializationEnrichment {
  readonly id: string
  readonly entryId: number
  readonly entryRef: string
  readonly contentHash: string
  readonly title: string
  readonly url: string | null
  readonly sourceRef: string
  readonly sourceTitle: string
  readonly publishedAt: string
  readonly semanticPayload: unknown
}

export interface MaterializationClassification {
  readonly enrichmentId: string
  readonly contentHash: string
  readonly classificationPayload: unknown
}

export interface PublishItem {
  readonly kind: 'trending' | 'deal_signal'
  readonly result_key: string
  readonly title: string
  readonly summary: string
  readonly score: number
  readonly source_entry_refs: readonly Record<string, unknown>[]
  readonly evidence_json: readonly string[]
  readonly metadata_json: Readonly<Record<string, unknown>>
  readonly strategy_version: string
}

export function materializeDiscovery(input: {
  readonly enrichments: readonly MaterializationEnrichment[]
  readonly classifications: readonly MaterializationClassification[]
  readonly now: Date
}): readonly PublishItem[] {
  const parsed = input.enrichments.flatMap(row => {
    const semantic = parseStoredSemantic(row.semanticPayload)
    return semantic ? [{ row, semantic }] : []
  })
  const byId = new Map(parsed.map(item => [item.row.id, item]))
  const trending = calculateTrending(parsed.map(({ row, semantic }) => trendingObservation(row, semantic)), input.now)
  const trendingItems = trending.flatMap(candidate => {
    const sources = boundedSourceReferences(candidate.entryIds.flatMap(entryId => {
      const row = input.enrichments.find(item => item.entryId === entryId)
      return row?.url ? [sourceReference(row)] : []
    }))
    if (sources.length === 0) return []
    return [Object.freeze({
      kind: 'trending' as const,
      result_key: candidate.resultKey,
      title: candidate.label,
      summary: `${candidate.metrics.articleCount} articles from ${candidate.metrics.sourceCount} sources in the last 24 hours.`,
      score: candidate.score,
      source_entry_refs: sources,
      evidence_json: [],
      metadata_json: { metrics: candidate.metrics },
      strategy_version: candidate.strategyVersion,
    })]
  })

  const dealObservations = input.classifications.flatMap(classification => {
    const enriched = byId.get(classification.enrichmentId)
    if (!enriched || classification.contentHash !== enriched.row.contentHash) return []
    const value = parseStoredClassification(classification.classificationPayload)
    if (!value || !isPublishableDealSignal(value, enriched.row.publishedAt, input.now)) return []
    return [{
      entryId: enriched.row.entryId,
      sourceRef: enriched.row.sourceRef,
      publishedAt: enriched.row.publishedAt,
      classification: value,
    }]
  })
  const dealItems = dedupeDealSignals(dealObservations).flatMap(group => {
    const sources = boundedSourceReferences(group.entryIds.flatMap(entryId => {
      const row = input.enrichments.find(item => item.entryId === entryId)
      return row?.url ? [sourceReference(row)] : []
    }))
    if (sources.length === 0) return []
    return [Object.freeze({
      kind: 'deal_signal' as const,
      result_key: group.resultKey,
      title: `${group.classification.companyName} — open fundraising signal`,
      summary: group.evidence[0] ?? 'The source explicitly describes an open fundraising opportunity.',
      score: Math.round(group.classification.confidence * 10_000) / 100,
      source_entry_refs: sources,
      evidence_json: group.evidence.slice(0, 12),
      metadata_json: {
        companyName: group.classification.companyName,
        companyDomain: group.classification.companyDomain,
        stage: group.classification.stage,
        amount: group.classification.amount,
        eventDate: group.classification.eventDate,
        opportunityStatus: group.classification.opportunityStatus,
        confidence: group.classification.confidence,
      },
      strategy_version: DEAL_SIGNAL_STRATEGY_VERSION,
    })]
  })
  return boundPublishItems([...trendingItems, ...dealItems])
}

export function boundPublishItems(items: readonly PublishItem[]): readonly PublishItem[] {
  const queues = (['trending', 'deal_signal'] as const).map(kind => items
    .filter(item => item.kind === kind)
    .sort((left, right) => right.score - left.score
      || left.result_key.localeCompare(right.result_key)
      || left.strategy_version.localeCompare(right.strategy_version)),
  )
  const indexes = [0, 0]
  const selected: PublishItem[] = []
  let encodedBytes = 2
  let progressed = true

  while (selected.length < MAX_PUBLISH_ITEMS && progressed) {
    progressed = false
    for (let queueIndex = 0; queueIndex < queues.length; queueIndex += 1) {
      const queue = queues[queueIndex]
      while (indexes[queueIndex] < queue.length) {
        const item = queue[indexes[queueIndex]]
        indexes[queueIndex] += 1
        const itemBytes = JSON_ENCODER.encode(JSON.stringify(item)).byteLength
        const separatorBytes = selected.length === 0 ? 0 : 1
        if (encodedBytes + separatorBytes + itemBytes > MAX_PUBLISH_BYTES) continue
        selected.push(item)
        encodedBytes += separatorBytes + itemBytes
        progressed = true
        break
      }
      if (selected.length >= MAX_PUBLISH_ITEMS) break
    }
  }
  return Object.freeze(selected)
}

function trendingObservation(row: MaterializationEnrichment, semantic: SemanticEnrichment): TrendingObservation {
  const conceptTags = semantic.concepts.map(concept => ({
    kind: concept.kind as TrendingTagKind,
    label: concept.name,
    normalizedLabel: concept.normalizedName,
  }))
  const eventTags = semantic.events.flatMap(event => event.companyName ? [{
    kind: 'event' as const,
    label: `${event.companyName} ${event.type.replace(/_/g, ' ')}`,
    normalizedLabel: `${event.companyName} ${event.type}`,
  }] : [])
  return {
    entryId: row.entryId,
    contentHash: row.contentHash,
    sourceRef: row.sourceRef,
    publishedAt: row.publishedAt,
    tags: [...conceptTags, ...eventTags],
  }
}

function sourceReference(row: MaterializationEnrichment): Record<string, unknown> {
  return Object.freeze({
    entryId: row.entryId,
    entryRef: row.entryRef,
    title: row.title,
    url: row.url ?? '',
    sourceRef: row.sourceRef,
    sourceTitle: row.sourceTitle,
    publishedAt: row.publishedAt,
  })
}

function boundedSourceReferences(
  sources: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  const ordered = [...sources].sort((left, right) =>
    sourceTimestamp(right) - sourceTimestamp(left)
    || sourceEntryId(left) - sourceEntryId(right),
  )
  const selected: Record<string, unknown>[] = []
  for (const source of ordered) {
    if (selected.length >= MAX_SOURCE_REFERENCES) break
    const candidate = [...selected, source]
    if (JSON_ENCODER.encode(JSON.stringify(candidate)).byteLength > MAX_SOURCE_REFERENCES_BYTES) break
    selected.push(source)
  }
  return Object.freeze(selected)
}

function sourceTimestamp(source: Readonly<Record<string, unknown>>): number {
  const timestamp = typeof source.publishedAt === 'string' ? Date.parse(source.publishedAt) : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}

function sourceEntryId(source: Readonly<Record<string, unknown>>): number {
  return typeof source.entryId === 'number' && Number.isSafeInteger(source.entryId)
    ? source.entryId
    : Number.MAX_SAFE_INTEGER
}

function parseStoredSemantic(value: unknown): SemanticEnrichment | null {
  try { return parseSemanticEnrichment(value, storedEvidenceText(value)) } catch { return null }
}

function parseStoredClassification(value: unknown): DealSignalClassification | null {
  try { return parseDealSignalClassification(value, storedEvidenceText(value)) } catch { return null }
}

function storedEvidenceText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const object = value as Record<string, unknown>
  const direct = Array.isArray(object.evidence) ? object.evidence : []
  const events = Array.isArray(object.events) ? object.events : []
  const nested = events.flatMap(event => {
    if (!event || typeof event !== 'object') return []
    const evidence = (event as Record<string, unknown>).evidence
    return Array.isArray(evidence) ? evidence : []
  })
  return [...direct, ...nested].filter(item => typeof item === 'string').join('\n')
}
