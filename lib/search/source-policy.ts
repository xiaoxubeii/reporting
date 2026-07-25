import type { SupabaseClient } from '@supabase/supabase-js'
import {
  SPECIALIZED_SOURCE_IDS,
  type SpecializedSourceId,
} from './contracts'

export interface SearchSourcePolicy {
  readonly web: boolean
  readonly specialized: Readonly<Record<SpecializedSourceId, boolean>>
}

export const SEARCH_RATE_LIMIT = Object.freeze({ limit: 10, windowSeconds: 60 })
export const SEARCH_UPSTREAM_TIMEOUT_MS = 8_000

export const DEFAULT_SEARCH_SOURCE_POLICY: SearchSourcePolicy = freezePolicy({
  web: true,
  specialized: {
    pubmed: true,
    clinical_trials: true,
    fda: true,
    // These direct website transports require an operator-reviewed permission and
    // reachable endpoint before a fund may enable them.
    tctmd: false,
    massdevice: false,
  },
})

export const DISABLED_SEARCH_SOURCE_POLICY: SearchSourcePolicy = freezePolicy({
  web: false,
  specialized: {
    pubmed: false,
    clinical_trials: false,
    fda: false,
    tctmd: false,
    massdevice: false,
  },
})

export function parseSearchSourcePolicy(value: unknown): SearchSourcePolicy {
  const input = record(value)
  const specialized = record(input?.specialized)
  if (
    !input
    || !specialized
    || !hasOnlyKeys(input, ['web', 'specialized'])
    || !hasOnlyKeys(specialized, SPECIALIZED_SOURCE_IDS)
    || typeof input.web !== 'boolean'
    || SPECIALIZED_SOURCE_IDS.some(id => typeof specialized[id] !== 'boolean')
  ) {
    return DISABLED_SEARCH_SOURCE_POLICY
  }

  return freezePolicy({
    web: input.web,
    specialized: Object.fromEntries(SPECIALIZED_SOURCE_IDS.map(id => [
      id,
      specialized[id],
    ])) as Record<SpecializedSourceId, boolean>,
  })
}

export async function loadSearchSourcePolicy(
  admin: SupabaseClient,
  fundId: string,
): Promise<SearchSourcePolicy> {
  try {
    const { data, error } = await admin
      .from('fund_settings')
      .select('search_source_config')
      .eq('fund_id', fundId)
      .maybeSingle()
    if (error || !data) return DISABLED_SEARCH_SOURCE_POLICY
    return parseSearchSourcePolicy((data as { search_source_config?: unknown }).search_source_config)
  } catch {
    // A deployment without the migration fails closed instead of silently enabling upstreams.
    return DISABLED_SEARCH_SOURCE_POLICY
  }
}

function freezePolicy(value: {
  readonly web: boolean
  readonly specialized: Record<SpecializedSourceId, boolean>
}): SearchSourcePolicy {
  const specialized = Object.freeze({ ...value.specialized })
  return Object.freeze({ web: value.web, specialized })
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && keys.every(key => expected.includes(key))
}
