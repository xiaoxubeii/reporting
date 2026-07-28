export const DISCOVERY_KINDS = ['trending', 'deal_signal'] as const
export type DiscoveryKind = (typeof DISCOVERY_KINDS)[number]

const ENTITY_KINDS = ['company', 'person', 'investor', 'product', 'organization'] as const
const CONCEPT_KINDS = ['industry', 'technology', 'theme'] as const
const EVENT_TYPES = ['funding', 'product_launch', 'partnership', 'acquisition', 'regulatory', 'hiring', 'other'] as const
const EVENT_STATUSES = ['active', 'completed', 'closed', 'unknown'] as const
const SIGNAL_TYPES = ['active_raise', 'completed_financing', 'fund_launch', 'momentum', 'acquisition', 'noise'] as const
const OPPORTUNITY_STATUSES = ['open', 'closed', 'unknown', 'not_applicable'] as const

type JsonObject = Record<string, unknown>
type EntityKind = (typeof ENTITY_KINDS)[number]
type ConceptKind = (typeof CONCEPT_KINDS)[number]
type EventType = (typeof EVENT_TYPES)[number]
type EventStatus = (typeof EVENT_STATUSES)[number]
export type DealSignalType = (typeof SIGNAL_TYPES)[number]
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number]

export interface SemanticEntity {
  readonly kind: EntityKind
  readonly name: string
  readonly normalizedName: string
  readonly domain: string | null
}

export interface SemanticConcept {
  readonly kind: ConceptKind
  readonly name: string
  readonly normalizedName: string
}

export interface SemanticEvent {
  readonly type: EventType
  readonly status: EventStatus
  readonly companyName: string | null
  readonly stage: string | null
  readonly amount: string | null
  readonly eventDate: string | null
  readonly evidence: readonly string[]
}

export interface SemanticEnrichment {
  readonly entities: readonly SemanticEntity[]
  readonly concepts: readonly SemanticConcept[]
  readonly events: readonly SemanticEvent[]
  readonly confidence: number
}

export interface DealSignalClassification {
  readonly companyName: string
  readonly companyDomain: string | null
  readonly signalType: DealSignalType
  readonly opportunityStatus: OpportunityStatus
  readonly stage: string | null
  readonly amount: string | null
  readonly eventDate: string | null
  readonly confidence: number
  readonly evidence: readonly string[]
}

export interface DiscoverySourceRef {
  readonly entryId: number
  readonly title: string
  readonly url: string
  readonly sourceTitle: string
  readonly publishedAt: string | null
}

export interface TrendingMetrics {
  readonly articleCount: number
  readonly sourceCount: number
  readonly priorArticleCount: number
  readonly growth: number
  readonly freshness: number
  readonly currentWindowHours: 24
  readonly baselineWindowDays: 7
}

export interface TrendingItem {
  readonly kind: 'trending'
  readonly id: string
  readonly label: string
  readonly summary: string
  readonly score: number
  readonly metrics: TrendingMetrics
  readonly sources: readonly DiscoverySourceRef[]
  readonly generatedAt: string
}

export interface DealSignalItem {
  readonly kind: 'deal_signal'
  readonly id: string
  readonly companyName: string
  readonly companyDomain: string | null
  readonly stage: string | null
  readonly amount: string | null
  readonly eventDate: string | null
  readonly confidence: number
  readonly evidence: readonly string[]
  readonly sources: readonly DiscoverySourceRef[]
  readonly generatedAt: string
  readonly existingDealId: string | null
}

export type DiscoveryItem = TrendingItem | DealSignalItem

export type DiscoveryRefreshState = 'ready' | 'queued' | 'running' | 'stale' | 'degraded'
export type DiscoveryRefreshReason = 'provider_not_configured' | 'refresh_failed' | 'results_stale' | null

export interface DiscoveryRefreshStatus {
  readonly state: DiscoveryRefreshState
  readonly reason: DiscoveryRefreshReason
  readonly retryable: boolean
  readonly lastAttemptAt: string | null
}

export interface RefreshSummary {
  readonly scanned: number
  readonly reused: number
  readonly enriched: number
  readonly classified: number
  readonly published: number
  readonly skipped: number
  readonly failed: number
  readonly expired: number
}

export interface DiscoveryPage<T extends DiscoveryItem = DiscoveryItem> {
  readonly items: readonly T[]
  readonly generationId: string | null
  readonly generatedAt: string | null
  readonly isStale: boolean
  readonly refresh: DiscoveryRefreshStatus
  readonly total: number
  readonly limit: number
  readonly offset: number
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as JsonObject
}

function asArray(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error(`${label} must be an array with at most ${max} items`)
  }
  return value
}

function asString(value: unknown, label: string, max: number, nullable = false): string | null {
  if (nullable && (value === null || value === undefined || value === '')) return null
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.length > max || CONTROL_CHARACTERS.test(value)) {
    throw new Error(`${label} is outside its allowed bounds`)
  }
  return normalized
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`Unsupported ${label}`)
  }
  return value as T
}

function asConfidence(value: unknown, label = 'confidence'): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1`)
  }
  return value
}

function asBoundedNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} is outside its allowed bounds`)
  }
  return value
}

function asCounter(value: unknown, label: string): number {
  const parsed = asBoundedNumber(value, label, 0, 1_000_000)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} must be a non-negative integer`)
  return parsed
}

function asIsoDate(value: unknown, label: string, nullable = true): string | null {
  if (nullable && (value === null || value === undefined || value === '')) return null
  const text = asString(value, label, 40)
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO date`)
  return new Date(text).toISOString()
}

function normalizeEvidenceText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim()
}

function parseEvidence(value: unknown, sourceText: string, label: string, max = 4): readonly string[] {
  const source = normalizeEvidenceText(sourceText)
  const evidence = asArray(value, label, max).map((item, index) => {
    const excerpt = asString(item, `${label}[${index}]`, 500)
    if (!excerpt || !source.includes(normalizeEvidenceText(excerpt))) {
      throw new Error(`${label}[${index}] evidence is not grounded in source text`)
    }
    return excerpt
  })
  return deepFreeze(evidence)
}

function parseDomain(value: unknown, label: string): string | null {
  const domain = asString(value, label, 253, true)
  if (!domain) return null
  const normalized = domain.toLocaleLowerCase('en-US').replace(/\.$/, '')
  if (!HOSTNAME.test(normalized) || normalized === 'localhost') {
    throw new Error(`${label} must be a safe public hostname without scheme, credentials, port, or IP`)
  }
  return normalized
}

function parseUuid(value: unknown, label: string, nullable = false): string | null {
  if (nullable && (value === null || value === undefined)) return null
  const parsed = asString(value, label, 36)
  if (!parsed || !UUID.test(parsed)) throw new Error(`${label} must be a UUID`)
  return parsed.toLocaleLowerCase('en-US')
}

function parseSource(value: unknown, index: number): DiscoverySourceRef {
  const source = asObject(value, `sources[${index}]`)
  const entryId = asCounter(source.entryId, `sources[${index}].entryId`)
  if (entryId === 0) throw new Error(`sources[${index}].entryId must be positive`)
  const url = asString(source.url, `sources[${index}].url`, 2048)
  if (!url) throw new Error(`sources[${index}].url is required`)
  const parsedUrl = new URL(url)
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
    throw new Error(`sources[${index}].url must be safe HTTP(S)`)
  }
  return {
    entryId,
    title: asString(source.title, `sources[${index}].title`, 1000)!,
    url: parsedUrl.toString(),
    sourceTitle: asString(source.sourceTitle, `sources[${index}].sourceTitle`, 500)!,
    publishedAt: asIsoDate(source.publishedAt, `sources[${index}].publishedAt`),
  }
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

export function parseSemanticEnrichment(value: unknown, sourceText: string): SemanticEnrichment {
  const input = asObject(value, 'semantic enrichment')
  const entities = asArray(input.entities, 'entities', 24).map((raw, index): SemanticEntity => {
    const entity = asObject(raw, `entities[${index}]`)
    return {
      kind: asEnum(entity.kind, ENTITY_KINDS, 'entity kind'),
      name: asString(entity.name, `entities[${index}].name`, 200)!,
      normalizedName: asString(entity.normalizedName, `entities[${index}].normalizedName`, 200)!.toLocaleLowerCase('en-US'),
      domain: parseDomain(entity.domain, `entities[${index}].domain`),
    }
  })
  const concepts = asArray(input.concepts, 'concepts', 24).map((raw, index): SemanticConcept => {
    const concept = asObject(raw, `concepts[${index}]`)
    return {
      kind: asEnum(concept.kind, CONCEPT_KINDS, 'concept kind'),
      name: asString(concept.name, `concepts[${index}].name`, 200)!,
      normalizedName: asString(concept.normalizedName, `concepts[${index}].normalizedName`, 200)!.toLocaleLowerCase('en-US'),
    }
  })
  const events = asArray(input.events, 'events', 16).map((raw, index): SemanticEvent => {
    const event = asObject(raw, `events[${index}]`)
    return {
      type: asEnum(event.type, EVENT_TYPES, 'event type'),
      status: asEnum(event.status, EVENT_STATUSES, 'event status'),
      companyName: asString(event.companyName, `events[${index}].companyName`, 200, true),
      stage: asString(event.stage, `events[${index}].stage`, 100, true),
      amount: asString(event.amount, `events[${index}].amount`, 100, true),
      eventDate: asIsoDate(event.eventDate, `events[${index}].eventDate`),
      evidence: parseEvidence(event.evidence, sourceText, `events[${index}].evidence`),
    }
  })
  return deepFreeze({ entities, concepts, events, confidence: asConfidence(input.confidence) }) as SemanticEnrichment
}

export function parseDealSignalClassification(value: unknown, sourceText: string): DealSignalClassification {
  const input = asObject(value, 'Deal Signal classification')
  return deepFreeze({
    companyName: asString(input.companyName, 'companyName', 200)!,
    companyDomain: parseDomain(input.companyDomain, 'companyDomain'),
    signalType: asEnum(input.signalType, SIGNAL_TYPES, 'signal type'),
    opportunityStatus: asEnum(input.opportunityStatus, OPPORTUNITY_STATUSES, 'opportunity status'),
    stage: asString(input.stage, 'stage', 100, true),
    amount: asString(input.amount, 'amount', 100, true),
    eventDate: asIsoDate(input.eventDate, 'eventDate'),
    confidence: asConfidence(input.confidence),
    evidence: parseEvidence(input.evidence, sourceText, 'evidence'),
  }) as DealSignalClassification
}

export function parseDiscoveryKind(value: unknown): DiscoveryKind {
  return asEnum(value, DISCOVERY_KINDS, 'discovery kind')
}

export function parseRefreshSummary(value: unknown): RefreshSummary {
  const input = asObject(value, 'refresh summary')
  const result = Object.fromEntries(
    ['scanned', 'reused', 'enriched', 'classified', 'published', 'skipped', 'failed', 'expired']
      .map((key) => [key, asCounter(input[key], key)]),
  ) as unknown as RefreshSummary
  return deepFreeze(result) as RefreshSummary
}

export function parseDiscoveryItem(value: unknown): DiscoveryItem {
  const input = asObject(value, 'discovery item')
  const kind = parseDiscoveryKind(input.kind)
  const common = {
    id: parseUuid(input.id, 'id')!,
    sources: asArray(input.sources, 'sources', 12).map(parseSource),
    generatedAt: asIsoDate(input.generatedAt, 'generatedAt', false)!,
  }
  if (kind === 'trending') {
    const metrics = asObject(input.metrics, 'metrics')
    return deepFreeze({
      kind,
      ...common,
      label: asString(input.label, 'label', 200)!,
      summary: asString(input.summary, 'summary', 4000, true) ?? '',
      score: asBoundedNumber(input.score, 'score', 0, 100),
      metrics: {
        articleCount: asCounter(metrics.articleCount, 'metrics.articleCount'),
        sourceCount: asCounter(metrics.sourceCount, 'metrics.sourceCount'),
        priorArticleCount: asCounter(metrics.priorArticleCount, 'metrics.priorArticleCount'),
        growth: asBoundedNumber(metrics.growth, 'metrics.growth', 0, 1_000_000),
        freshness: asBoundedNumber(metrics.freshness, 'metrics.freshness', 0, 1),
        currentWindowHours: asBoundedNumber(metrics.currentWindowHours, 'metrics.currentWindowHours', 24, 24) as 24,
        baselineWindowDays: asBoundedNumber(metrics.baselineWindowDays, 'metrics.baselineWindowDays', 7, 7) as 7,
      },
    }) as TrendingItem
  }
  return deepFreeze({
    kind,
    ...common,
    companyName: asString(input.companyName, 'companyName', 200)!,
    companyDomain: parseDomain(input.companyDomain, 'companyDomain'),
    stage: asString(input.stage, 'stage', 100, true),
    amount: asString(input.amount, 'amount', 100, true),
    eventDate: asIsoDate(input.eventDate, 'eventDate'),
    confidence: asConfidence(input.confidence),
    evidence: asArray(input.evidence, 'evidence', 12).map((item, index) => asString(item, `evidence[${index}]`, 500)!),
    existingDealId: parseUuid(input.existingDealId, 'existingDealId', true),
  }) as DealSignalItem
}

export function parseDiscoveryPage(value: unknown): DiscoveryPage {
  const input = asObject(value, 'discovery page')
  const refresh = asObject(input.refresh, 'refresh')
  const state = asEnum(refresh.state, ['ready', 'queued', 'running', 'stale', 'degraded'] as const, 'refresh state')
  const reason = refresh.reason === null
    ? null
    : asEnum(refresh.reason, ['provider_not_configured', 'refresh_failed', 'results_stale'] as const, 'refresh reason')
  if (typeof refresh.retryable !== 'boolean') throw new Error('refresh.retryable must be a boolean')
  return deepFreeze({
    items: asArray(input.items, 'items', 100).map(parseDiscoveryItem),
    generationId: parseUuid(input.generationId, 'generationId', true),
    generatedAt: asIsoDate(input.generatedAt, 'generatedAt'),
    isStale: input.isStale === true,
    refresh: {
      state,
      reason,
      retryable: refresh.retryable,
      lastAttemptAt: asIsoDate(refresh.lastAttemptAt, 'refresh.lastAttemptAt'),
    },
    total: asCounter(input.total, 'total'),
    limit: asCounter(input.limit, 'limit'),
    offset: asCounter(input.offset, 'offset'),
  }) as DiscoveryPage
}

export function parseDiscoveryPagination(input: URLSearchParams): { readonly limit: number; readonly offset: number } {
  const limitText = input.get('limit') ?? '20'
  const offsetText = input.get('offset') ?? '0'
  if (!/^\d+$/.test(limitText) || !/^\d+$/.test(offsetText)) {
    throw new Error('Discovery pagination must use non-negative integers')
  }
  const limit = Number(limitText)
  const offset = Number(offsetText)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset > 10_000) {
    throw new Error('Discovery pagination is outside allowed bounds')
  }
  return deepFreeze({ limit, offset })
}
