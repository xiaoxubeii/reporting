import type { FeedEntry } from './contracts'

export type FeedEntryView = FeedEntry

export type FeedFilter = 'unread' | 'all' | 'saved'

export interface FeedEntryCategoryGroup {
  key: string
  categoryId: number | null
  label: string
  items: FeedEntryView[]
}

export function shouldResetFeedPagination(
  filter: FeedFilter,
  patch: { isRead?: boolean; isSaved?: boolean },
): boolean {
  if (filter === 'unread') return patch.isRead !== undefined
  if (filter === 'saved') return patch.isSaved !== undefined
  return false
}

export function mergeFeedEntryPages(
  current: readonly FeedEntryView[],
  incoming: readonly FeedEntryView[],
): FeedEntryView[] {
  const merged = new Map(current.map(item => [item.externalId, item]))
  for (const item of incoming) merged.set(item.externalId, item)
  return Array.from(merged.values())
}

export function groupFeedEntriesByCategory(
  entries: readonly FeedEntryView[],
): FeedEntryCategoryGroup[] {
  const order: string[] = []
  const groups = new Map<string, FeedEntryCategoryGroup>()

  for (const entry of entries) {
    const category = entry.source.category
    const key = category ? `category:${category.externalCategoryId}` : 'uncategorized'
    const existing = groups.get(key)
    if (existing) {
      groups.set(key, { ...existing, items: [...existing.items, entry] })
      continue
    }
    order.push(key)
    groups.set(key, {
      key,
      categoryId: category?.externalCategoryId ?? null,
      label: category?.title ?? 'Uncategorized',
      items: [entry],
    })
  }

  return order.flatMap(key => {
    const group = groups.get(key)
    return group ? [group] : []
  })
}

export function filterFeedEntries(
  entries: readonly FeedEntryView[],
  options: { filter: FeedFilter; query: string },
): FeedEntryView[] {
  const query = options.query.trim().toLocaleLowerCase()
  return entries.filter(entry => {
    if (options.filter === 'unread' && entry.isRead) return false
    if (options.filter === 'saved' && !entry.isSaved) return false
    if (!query) return true
    return [entry.title, entry.summary, entry.author, entry.source.title]
      .filter(Boolean)
      .some(value => String(value).toLocaleLowerCase().includes(query))
  })
}
