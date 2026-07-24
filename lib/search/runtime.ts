import type { AccessContext } from '@/lib/access/effective'
import { FeedService } from '@/lib/feeds/service'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SearchAdapter } from './adapter-contracts'
import { AdapterRegistry } from './adapter-registry'
import { MinifluxFeedSearchAdapter } from './adapters/feed'
import { SearxngWebSearchAdapter } from './adapters/web'
import { resolveSearchFeedStatus } from './page-access'
import { checkSearxngAvailability, configuredSearxngUrl } from './searxng/config'
import type { SearchSourcePolicy } from './source-policy'
import { ClinicalTrialsApiAdapter } from './specialized/adapters/clinical-trials'
import { Fda510kApiAdapter } from './specialized/adapters/fda-510k'
import { MassDeviceWebsiteAdapter } from './specialized/adapters/massdevice'
import { PubMedApiAdapter } from './specialized/adapters/pubmed'
import { TctmdWebsiteAdapter } from './specialized/adapters/tctmd'

export interface SearchRuntime {
  readonly registry: AdapterRegistry
  readonly runnableAdapterIds: ReadonlySet<string>
}

export async function createSearchRuntime(input: {
  readonly admin: SupabaseClient
  readonly access: AccessContext
  readonly userId: string
  readonly policy: SearchSourcePolicy
}): Promise<SearchRuntime> {
  const feedService = new FeedService(input.admin)
  const [feedStatus, searxngUrl] = await Promise.all([
    resolveSearchFeedStatus(input.access, input.userId, feedService),
    availableSearxngUrl(input.policy.web),
  ])
  const registry = new AdapterRegistry([
    ...(feedStatus?.connected ? [new MinifluxFeedSearchAdapter(feedService)] : []),
    ...specializedAdapters(input.policy),
    ...(searxngUrl ? [new SearxngWebSearchAdapter(searxngUrl)] : []),
  ])
  return Object.freeze({ registry, runnableAdapterIds: registry.ids() })
}

function specializedAdapters(policy: SearchSourcePolicy): readonly SearchAdapter[] {
  const adapters: readonly SearchAdapter[] = [
    ...(policy.specialized.pubmed ? [new PubMedApiAdapter()] : []),
    ...(policy.specialized.clinical_trials ? [new ClinicalTrialsApiAdapter()] : []),
    ...(policy.specialized.fda ? [new Fda510kApiAdapter()] : []),
    ...(policy.specialized.tctmd ? [new TctmdWebsiteAdapter()] : []),
    ...(policy.specialized.massdevice ? [new MassDeviceWebsiteAdapter()] : []),
  ]
  return Object.freeze(adapters.filter(adapter => adapter.descriptor.liveTransportAvailable))
}

async function availableSearxngUrl(enabled: boolean): Promise<string | null> {
  if (!enabled) return null
  try {
    const baseUrl = configuredSearxngUrl()
    if (!baseUrl) return null
    return await checkSearxngAvailability(baseUrl) ? baseUrl : null
  } catch {
    return null
  }
}
