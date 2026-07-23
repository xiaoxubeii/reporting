import type { ExploreEntryResult } from '@/components/feeds/api'

export interface ExploreEntryGroup {
  key: string
  label: string
  items: ExploreEntryResult[]
}

export function mergeExploreEntryPages(
  current: ExploreEntryResult[],
  incoming: ExploreEntryResult[],
): ExploreEntryResult[] {
  const byId = new Map(current.map(item => [item.id, item]))
  for (const item of incoming) byId.set(item.id, item)
  return Array.from(byId.values())
}

export function groupExploreEntriesByCategory(entries: ExploreEntryResult[]): ExploreEntryGroup[] {
  const groups = new Map<string, ExploreEntryGroup>()
  for (const entry of entries) {
    const key = entry.category?.id ?? 'explore-category:uncategorized'
    const label = entry.category?.title ?? 'Uncategorized'
    const current = groups.get(key)
    groups.set(key, current
      ? { ...current, items: [...current.items, entry] }
      : { key, label, items: [entry] })
  }
  return Array.from(groups.values())
}
