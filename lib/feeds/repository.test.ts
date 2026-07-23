import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const service = readFileSync(new URL('./service.ts', import.meta.url), 'utf8')

describe('Miniflux-only persistence boundary', () => {
  it('does not access mirrored source, subscription, entry, or state tables', () => {
    const repositoryImport = /from ['"]\.\/repository['"]|from ['"]@\/lib\/feeds\/repository['"]/
    expect(service).not.toMatch(repositoryImport)
    expect(service).not.toMatch(/FeedRepository|feed_sources|feed_endpoints|feed_subscriptions|feed_item_states/)
    expect(service).not.toMatch(/getStates|updateItemState|listActiveSubscriptionFeedIds|assertEntryAuthorized|withState/)
  })
})
