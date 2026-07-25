import type { FeedSourceResult, FeedTopicResult } from './api'

export interface FollowingSourceGroup {
  key: string
  label: string
  sources: FeedSourceResult[]
}

export function filterFollowingSources(
  sources: FeedSourceResult[],
  query: string,
): FeedSourceResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return sources

  return sources.filter(source => [
    source.name,
    source.description,
    source.siteUrl,
    ...source.topics,
    ...source.endpoints.flatMap(endpoint => [endpoint.title, endpoint.feedUrl, endpoint.format]),
  ]
    .filter(Boolean)
    .some(field => String(field).toLocaleLowerCase().includes(normalizedQuery)))
}

export function groupFollowingSources(
  sources: FeedSourceResult[],
  topics: FeedTopicResult[],
  uncategorizedLabel: string,
): FollowingSourceGroup[] {
  const topicByName = new Map(topics.map(topic => [topic.name, topic]))
  const sourcesByCategory = new Map<string, FeedSourceResult[]>()
  const uncategorized: FeedSourceResult[] = []

  for (const source of sources) {
    const categoryName = source.topics[0]?.trim()
    if (!categoryName) {
      uncategorized.push(source)
      continue
    }
    sourcesByCategory.set(categoryName, [
      ...(sourcesByCategory.get(categoryName) ?? []),
      source,
    ])
  }

  const knownGroups = topics.flatMap(topic => {
    const groupedSources = sourcesByCategory.get(topic.name)
    return groupedSources?.length
      ? [{ key: `category:${topic.id}`, label: topic.name, sources: groupedSources }]
      : []
  })
  const unknownGroups = Array.from(sourcesByCategory.entries())
    .filter(([name]) => !topicByName.has(name))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, groupedSources]) => ({
      key: `category-name:${name}`,
      label: name,
      sources: groupedSources,
    }))

  return [
    ...knownGroups,
    ...unknownGroups,
    ...(uncategorized.length
      ? [{ key: 'category:uncategorized', label: uncategorizedLabel, sources: uncategorized }]
      : []),
  ]
}
