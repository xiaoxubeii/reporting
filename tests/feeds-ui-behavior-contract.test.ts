import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const followSources = readFileSync(
  new URL('../components/feeds/follow-sources.tsx', import.meta.url),
  'utf8',
)
const todayFeed = readFileSync(
  new URL('../components/feeds/today-feed.tsx', import.meta.url),
  'utf8',
)
const feedReaderSheet = readFileSync(
  new URL('../components/feeds/feed-reader-sheet.tsx', import.meta.url),
  'utf8',
)
const exploreFeed = readFileSync(
  new URL('../components/feeds/explore-feed.tsx', import.meta.url),
  'utf8',
)
const exploreReaderSheet = readFileSync(
  new URL('../components/feeds/explore-reader-sheet.tsx', import.meta.url),
  'utf8',
)
const todayViewTabs = readFileSync(
  new URL('../components/feeds/today-view-tabs.tsx', import.meta.url),
  'utf8',
)
const sharedSheet = readFileSync(
  new URL('../components/ui/sheet.tsx', import.meta.url),
  'utf8',
)

describe('Feeds recovery and pagination UI contract', () => {
  it('does not expose Miniflux connection metadata in the sources UI', () => {
    expect(followSources).not.toMatch(/Connected as/)
    expect(followSources).not.toMatch(/>\s*Disconnect\s*</)
  })

  it('reloads the Miniflux catalog after unfollow instead of retaining stale topics', () => {
    expect(followSources).toMatch(/async function loadCatalog/)
    expect(followSources).toMatch(/async function unfollow[\s\S]*await loadCatalog\(\)/)
  })

  it('resets the filtered Today page after membership-changing mutations', () => {
    expect(todayFeed).toMatch(/async function resetFilteredPage[\s\S]*await load\(0,\s*false\)/)
    expect(todayFeed).toMatch(/markVisibleRead[\s\S]*await resetFilteredPage\(\)/)
  })

  it('does not ask automatically managed users to paste or disconnect API tokens', () => {
    expect(followSources).toMatch(/connection\?\.managed[\s\S]*managed automatically/i)
    expect(followSources).toMatch(/!connection\.managed[\s\S]*Personal API token/)
    expect(followSources).not.toMatch(/!connection\.managed[\s\S]*Disconnect/)
  })

  it('uses the same fixed page-title size without a header separator', () => {
    expect(todayFeed).toMatch(/<h1 className="text-2xl font-semibold tracking-tight">Today<\/h1>/)
    expect(followSources).toMatch(/<h1 className="text-2xl font-semibold tracking-tight">Follow sources<\/h1>/)
    expect(todayFeed).toMatch(/<header className="[^"]*pb-2[^"]*">/)
    expect(todayFeed).not.toMatch(/<header className="[^"]*border-b[^"]*">/)
    expect(todayFeed).toMatch(/<div className="mt-4 flex flex-col gap-3/)
    expect(followSources).toMatch(/<header className="pb-2">/)
    expect(followSources).toMatch(/<form onSubmit=\{discover\} className="mt-4">/)
  })

  it('does not mount the shared close button while the article reader is loading', () => {
    expect(sharedSheet).toMatch(/showCloseButton\?: boolean/)
    expect(sharedSheet).toMatch(/showCloseButton && \(/)
    expect(feedReaderSheet).toMatch(/showCloseButton=\{false\}/)
    expect(feedReaderSheet).toMatch(/<SheetClose asChild>/)
    expect(feedReaderSheet).toMatch(/aria-label="Close article reader"/)
  })

  it('groups Today entries by their Miniflux category instead of recency buckets', () => {
    expect(todayFeed).toMatch(/groupFeedEntriesByCategory\(visible\)/)
    expect(todayFeed).toMatch(/<section key=\{group\.key\}/)
    expect(todayFeed).toMatch(/\{group\.label\}<\/h2>/)
    expect(todayFeed).not.toMatch(/groupByRecency/)
  })

  it('provides URL-backed Me and Explore sibling views inside Today', () => {
    expect(todayFeed).toMatch(/searchParams\.get\('view'\) === 'explore'/)
    expect(todayViewTabs).toMatch(/>Me</)
    expect(todayViewTabs).toMatch(/>Explore</)
    expect(todayFeed).toMatch(/<ExploreFeed/)
    expect(todayFeed).toMatch(/<PersonalTodayFeed/)
  })

  it('keeps Explore browsing read-only while following only a source personally', () => {
    expect(exploreFeed).toMatch(/\/api\/feeds\/explore\/categories/)
    expect(exploreFeed).toMatch(/\/api\/feeds\/explore\/entries/)
    expect(exploreFeed).toMatch(/\/api\/feeds\/explore\/following/)
    expect(exploreFeed).toMatch(/\/api\/feeds\/explore\/sources\//)
    expect(exploreFeed).toMatch(/\/follow/)
    expect(exploreFeed).not.toMatch(/\/api\/feeds\/[^'"`]*\/state/)
    expect(exploreFeed).not.toMatch(/Mark all as read/)
    expect(exploreFeed).not.toMatch(/Save for later/)
    expect(exploreReaderSheet).not.toMatch(/method:\s*'PATCH'/)
    expect(exploreReaderSheet).not.toMatch(/updateState/)
    expect(exploreReaderSheet).not.toMatch(/isRead|isSaved/)
  })

  it('groups the all-category Explore view by curated Miniflux category', () => {
    expect(exploreFeed).toMatch(/groupExploreEntriesByCategory/)
    expect(exploreFeed).toMatch(/Latest in \{group\.label\}/)
    expect(exploreFeed).toMatch(/explore-category:/)
  })

  it('ignores stale Explore requests and offers detail retry recovery', () => {
    expect(exploreFeed).toMatch(/requestGeneration = useRef\(0\)/)
    expect(exploreFeed).toMatch(/generation !== requestGeneration\.current/)
    expect(exploreReaderSheet).toMatch(/>Retry</)
  })
})
