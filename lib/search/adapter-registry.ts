import {
  getSearchAdapterDescriptor,
  type SearchAdapter,
} from './adapter-contracts'
import type { SearchAdapterId } from './contracts'

export class AdapterRegistry {
  private readonly adapters: ReadonlyMap<SearchAdapterId, SearchAdapter>

  constructor(adapters: readonly SearchAdapter[]) {
    const entries: Array<readonly [SearchAdapterId, SearchAdapter]> = []
    const seen = new Set<SearchAdapterId>()
    for (const adapter of adapters) {
      if (adapter.descriptor !== getSearchAdapterDescriptor(adapter.descriptor.id)) {
        throw new Error(`Search adapter ${adapter.descriptor.id} must use its canonical descriptor.`)
      }
      if (seen.has(adapter.descriptor.id)) throw new Error(`Duplicate search adapter: ${adapter.descriptor.id}`)
      seen.add(adapter.descriptor.id)
      entries.push(Object.freeze([adapter.descriptor.id, adapter] as const))
    }
    this.adapters = new Map(entries)
  }

  get(id: SearchAdapterId): SearchAdapter | undefined {
    return this.adapters.get(id)
  }

  has(id: string): id is SearchAdapterId {
    return this.adapters.has(id as SearchAdapterId)
  }

  ids(): ReadonlySet<string> {
    return new Set(this.adapters.keys())
  }
}
