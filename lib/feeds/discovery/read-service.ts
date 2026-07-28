import type { SupabaseClient } from '@supabase/supabase-js'

import type { DiscoveryItem, DiscoveryKind, DiscoveryPage } from './contracts'
import { parseDiscoveryItem, parseDiscoveryPage } from './contracts'
import {
  DiscoveryRuntimeStore,
  type DiscoveryReadState,
  type StoredDiscoveryRow,
} from './runtime-store'
import type { DiscoveryRefreshStatus } from './contracts'

const STALE_AFTER_MS = 6 * 60 * 60 * 1_000
const MAX_EXISTING_DEALS = 2_000

interface DiscoveryReader {
  readState(): Promise<DiscoveryReadState>
  readStatus?(state: DiscoveryReadState, isStale: boolean): Promise<DiscoveryRefreshStatus>
  readItems(input: {
    generationId: string
    kind: DiscoveryKind
    limit: number
    offset: number
  }): Promise<{ rows: readonly StoredDiscoveryRow[]; total: number }>
}

interface ExistingDeal {
  readonly id: string
  readonly company_domain: string | null
  readonly company_name: string | null
}

export class DiscoveryReadService {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly reader?: DiscoveryReader,
    private readonly clock: { now(): Date } = { now: () => new Date() },
  ) {}

  async list(input: {
    fundId: string
    kind: DiscoveryKind
    limit: number
    offset: number
  }): Promise<DiscoveryPage> {
    const reader = this.reader ?? new DiscoveryRuntimeStore(input.fundId, this.admin as never)
    const state = await reader.readState()
    const isStale = staleState(state, this.clock.now())
    const refresh = reader.readStatus
      ? await reader.readStatus(state, isStale)
      : fallbackRefreshStatus(state, isStale)
    if (!state.activeGenerationId) {
      return parseDiscoveryPage({
        items: [],
        generationId: null,
        generatedAt: state.generatedAt,
        isStale,
        refresh,
        total: 0,
        limit: input.limit,
        offset: input.offset,
      })
    }

    const result = await reader.readItems({
      generationId: state.activeGenerationId,
      kind: input.kind,
      limit: input.limit,
      offset: input.offset,
    })
    const existingDeals = input.kind === 'deal_signal'
      ? await this.listExistingDeals(input.fundId)
      : []
    const items = result.rows.map(row => mapDiscoveryRow(row, existingDeals))

    return parseDiscoveryPage({
      items,
      generationId: state.activeGenerationId,
      generatedAt: state.generatedAt,
      isStale,
      refresh,
      total: result.total,
      limit: input.limit,
      offset: input.offset,
    })
  }

  private async listExistingDeals(fundId: string): Promise<readonly ExistingDeal[]> {
    const { data, error } = await this.admin
      .from('inbound_deals')
      .select('id, company_domain, company_name')
      .eq('fund_id', fundId)
      .neq('status', 'passed')
      .limit(MAX_EXISTING_DEALS)
    if (error) throw error
    return Object.freeze(data ?? [])
  }
}

function fallbackRefreshStatus(state: DiscoveryReadState, isStale: boolean): DiscoveryRefreshStatus {
  if (state.lastErrorCode !== null) {
    return Object.freeze({ state: 'degraded', reason: 'refresh_failed', retryable: true, lastAttemptAt: state.lastAttemptAt })
  }
  if (!state.activeGenerationId) {
    return Object.freeze({ state: 'degraded', reason: 'provider_not_configured', retryable: true, lastAttemptAt: state.lastAttemptAt })
  }
  if (isStale) {
    return Object.freeze({ state: 'stale', reason: 'results_stale', retryable: true, lastAttemptAt: state.lastAttemptAt })
  }
  return Object.freeze({ state: 'ready', reason: null, retryable: false, lastAttemptAt: state.lastAttemptAt })
}

export function mapDiscoveryRow(
  row: StoredDiscoveryRow,
  existingDeals: readonly ExistingDeal[] = [],
): DiscoveryItem {
  const sources = Array.isArray(row.sourceEntryRefs) ? row.sourceEntryRefs : []
  const metadata = asObject(row.metadata)
  if (row.kind === 'trending') {
    return parseDiscoveryItem({
      kind: row.kind,
      id: row.id,
      label: row.title,
      summary: row.summary,
      score: row.score,
      metrics: metadata.metrics,
      sources,
      generatedAt: row.generatedAt,
    })
  }

  const companyName = typeof metadata.companyName === 'string' ? metadata.companyName : row.title
  const companyDomain = typeof metadata.companyDomain === 'string' ? metadata.companyDomain : null
  return parseDiscoveryItem({
    kind: row.kind,
    id: row.id,
    companyName,
    companyDomain,
    stage: metadata.stage,
    amount: metadata.amount,
    eventDate: metadata.eventDate,
    confidence: metadata.confidence,
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    sources,
    generatedAt: row.generatedAt,
    existingDealId: matchExistingDeal(existingDeals, companyDomain, companyName),
  })
}

function matchExistingDeal(
  deals: readonly ExistingDeal[],
  domain: string | null,
  name: string,
): string | null {
  const normalizedDomain = domain?.toLocaleLowerCase('en-US').replace(/^www\./, '') ?? null
  const normalizedName = normalizeCompanyName(name)
  const match = deals.find(deal => {
    const dealDomain = deal.company_domain?.toLocaleLowerCase('en-US').replace(/^www\./, '') ?? null
    if (normalizedDomain && dealDomain) return normalizedDomain === dealDomain
    return normalizeCompanyName(deal.company_name ?? '') === normalizedName
  })
  return match?.id ?? null
}

function normalizeCompanyName(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[\s\-_.(),，。·'"\[\]{}]+/g, '')
}

function staleState(state: DiscoveryReadState, now: Date): boolean {
  if (!state.generatedAt) return true
  const generatedAt = Date.parse(state.generatedAt)
  return !Number.isFinite(generatedAt)
    || now.getTime() - generatedAt > STALE_AFTER_MS
    || (state.lastErrorCode !== null && state.lastAttemptAt !== state.generatedAt)
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}
