import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const followSources = readFileSync(
  new URL('../components/feeds/follow-sources.tsx', import.meta.url),
  'utf8',
)
const exploreSourceCatalog = readFileSync(
  new URL('../components/feeds/explore-source-catalog.tsx', import.meta.url),
  'utf8',
)
const followCategoryPopover = readFileSync(
  new URL('../components/feeds/follow-category-popover.tsx', import.meta.url),
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

  it('chooses a Miniflux category from an anchored Follow menu instead of a permanent field', () => {
    expect(followCategoryPopover).toMatch(/export function FollowCategoryPopover/)
    expect(followCategoryPopover).toMatch(/<Popover[\s\S]*<PopoverTrigger asChild>[\s\S]*<PopoverContent/)
    expect(followCategoryPopover).toMatch(/t\('categoryMenu\.uncategorized'\)/)
    expect(followCategoryPopover).toMatch(/t\('categoryMenu\.newCategory'\)/)
    expect(followCategoryPopover).toMatch(/maxLength=\{100\}/)
    expect(followCategoryPopover).toMatch(/if \(!nextOpen && pending\) return/)
    expect(followCategoryPopover).toContain('max-h-[var(--radix-popover-content-available-height)]')
    expect(followSources).toContain('following={feed.isFollowing}')
    expect(followSources).toContain('following={endpoint.isFollowing}')
    expect(followCategoryPopover).toContain('aria-disabled={!onFollowingClick || pending || undefined}')
    expect(followCategoryPopover).not.toContain('disabled={!onFollowingClick}')
    expect(followSources).not.toContain('id="source-topic"')
    expect(followSources).not.toContain("t('discovery.topicLabel')")
  })

  it('matches the application control system for category selection', () => {
    expect(followCategoryPopover).toMatch(/PopoverArrow/)
    expect(followCategoryPopover).toContain("t('categoryMenu.searchCategories')")
    expect(followCategoryPopover).toMatch(/filteredCategories/)
    expect(followCategoryPopover).toContain('w-[min(20rem,calc(100vw-2rem))]')
    expect(followCategoryPopover).toContain('max-h-[var(--radix-popover-content-available-height)]')
  })

  it('treats a committed follow as success even when the catalog refresh needs recovery', () => {
    expect(followSources).toMatch(/await feedsRequest\('\/api\/feeds\/subscriptions'[\s\S]*?catch \(value\)[\s\S]*?return false/)
    expect(followSources).toMatch(/setAnnouncement\(t\('announcements\.followed'[\s\S]*?try \{[\s\S]*?await loadCatalog\(\)[\s\S]*?setLoadError/)
  })

  it('resets the filtered Today page after membership-changing mutations', () => {
    expect(todayFeed).toMatch(/async function resetFilteredPage[\s\S]*await load\(0,\s*false\)/)
    expect(todayFeed).toMatch(/markVisibleRead[\s\S]*await resetFilteredPage\(\)/)
  })

  it('does not ask automatically managed users to paste or disconnect API tokens', () => {
    expect(followSources).toMatch(/connection\?\.managed[\s\S]*states\.accountNotReady\.description/)
    expect(followSources).toMatch(/!connection\.managed[\s\S]*connect\.tokenLabel/)
    expect(followSources).not.toMatch(/!connection\.managed[\s\S]*Disconnect/)
  })

  it('uses the same fixed page-title size without a header separator', () => {
    expect(todayFeed).toMatch(/<h1 className="text-2xl font-semibold tracking-tight">\{t\('title'\)\}<\/h1>/)
    expect(followSources).toMatch(/<h1 className="text-2xl font-semibold tracking-tight">\{t\('title'\)\}<\/h1>/)
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
    expect(feedReaderSheet).toMatch(/aria-label=\{t\('close'\)\}/)
  })

  it('groups Today entries by their Miniflux category instead of recency buckets', () => {
    expect(todayFeed).toMatch(/groupFeedEntriesByCategory\(visible\)/)
    expect(todayFeed).toMatch(/<section key=\{group\.key\}/)
    expect(todayFeed).toMatch(/group\.categoryId === null \? t\('uncategorized'\) : group\.label/)
    expect(todayFeed).not.toMatch(/groupByRecency/)
  })

  it('provides URL-backed Me and Explore sibling views inside Today', () => {
    expect(todayFeed).toMatch(/searchParams\.get\('view'\) === 'explore'/)
    expect(todayViewTabs).toMatch(/\{t\('me'\)\}/)
    expect(todayViewTabs).toMatch(/\{t\('explore'\)\}/)
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
    expect(exploreReaderSheet).not.toMatch(/method:\s*'PATCH'/)
    expect(exploreReaderSheet).not.toMatch(/updateState/)
    expect(exploreReaderSheet).not.toMatch(/isRead|isSaved/)
  })

  it('separates curated source discovery from personal Following with URL-backed state', () => {
    expect(followSources).toMatch(/searchParams\.get\('view'\) === 'following'/)
    expect(followSources).toMatch(/view=following/)
    expect(followSources).toMatch(/<ExploreSourceCatalog/)
    expect(exploreSourceCatalog).toMatch(/\/api\/feeds\/explore\/categories/)
    expect(exploreSourceCatalog).toMatch(/\/api\/feeds\/explore\/sources/)
    expect(exploreSourceCatalog).toMatch(/\/api\/feeds\/explore\/following/)
    expect(exploreSourceCatalog).toMatch(/\/api\/feeds\/explore\/sources\/\$\{encodeURIComponent\(sourceId\)\}\/follow/)
    expect(exploreSourceCatalog).toMatch(/requestGeneration = useRef\(0\)/)
    expect(exploreSourceCatalog).toMatch(/searchParams\.get\('category'\)/)
    expect(exploreSourceCatalog).toMatch(/<Sheet/)
    expect(exploreSourceCatalog).not.toMatch(/Reddit|Newsletters|Google News|language/i)
  })

  it('groups Following only by personal Miniflux categories', () => {
    expect(followSources).toMatch(/groupFollowingSources\(filteredSources, topics/)
    expect(followSources).toMatch(/followingGroups\.map\(\(group, index\) =>/)
    expect(followSources).not.toContain("t('topics.title')")
    expect(followSources).not.toMatch(/TopicSourcesSheet|openTopic|topicSlug/)
  })

  it('uses the shared personal category picker for trusted curated Follow', () => {
    expect(followSources).toContain('personalCategories={categories}')
    expect(exploreSourceCatalog).toContain('<FollowCategoryPopover')
    expect(exploreSourceCatalog).toContain('body: JSON.stringify({ topic: category })')
    expect(exploreSourceCatalog).not.toMatch(/body: JSON\.stringify\(\{[^}]*feedUrl/)
    expect(exploreSourceCatalog).not.toContain('error={rowError[source.id]}')
  })

  it('uses safe generated ids for Following group labels', () => {
    expect(followSources).toContain('const followingGroupIdPrefix = useId()')
    expect(followSources).toContain('aria-labelledby={headingId}')
    expect(followSources).not.toContain('aria-labelledby={`${group.key}-heading`}')
  })

  it('keeps curated catalog loading independent from the personal connection', () => {
    expect(exploreSourceCatalog).toMatch(/catalogError/)
    expect(exploreSourceCatalog).toMatch(/followingError/)
    expect(exploreSourceCatalog).toMatch(/async function loadCatalog\(\)[\s\S]*\/api\/feeds\/explore\/categories/)
    expect(exploreSourceCatalog).toMatch(/async function loadFollowingState\(\)[\s\S]*\/api\/feeds\/explore\/following/)
    expect(exploreSourceCatalog).not.toMatch(/Promise\.allSettled/)
    expect(exploreSourceCatalog).not.toMatch(/if \(!connection\?\.connected\) return null/)
  })

  it('keeps connection and catalog load failures retryable in the Explore view', () => {
    expect(followSources).toContain('personalConnectionError={loadError && !connection ? loadError : null}')
    expect(followSources).toContain('personalConnectionLoading={loading}')
    expect(followSources).toMatch(/onRetryConnection=\{\(\) => void load\(\)\}/)
    expect(exploreSourceCatalog).toMatch(/personalConnectionError \?\? \(personalConnected \? followingError/)
    expect(exploreSourceCatalog).toMatch(/personalConnectionError\s*\? onRetryConnection/)
    expect(exploreSourceCatalog).toMatch(/setCatalogReloadKey\(current => current \+ 1\)/)
    expect(exploreSourceCatalog).toMatch(/actionLabel=\{t\('retry'\)\}/)
  })

  it('distinguishes a disconnected account from a retryable Follow-state failure', () => {
    expect(exploreSourceCatalog).toContain('personalConnectionError ?? (personalConnected ? followingError : null)')
    expect(exploreSourceCatalog).toContain("followStatusError ?? t('catalog.followUnavailable')")
    expect(exploreSourceCatalog).toMatch(/setFollowingRefreshKey\(current => current \+ 1\)/)
    expect(exploreSourceCatalog).toContain("t('catalog.retryFollowing')")
  })

  it('matches the supplied Explore category typography without count or helper copy', () => {
    expect(exploreSourceCatalog).toContain('text-sm font-normal leading-normal tracking-normal')
    expect(exploreSourceCatalog).toContain('truncate text-sm font-medium text-muted-foreground')
    expect(exploreSourceCatalog).not.toContain("t('sourceCount', { count: category.sourceCount })")
    expect(exploreSourceCatalog).not.toContain("t('sourceCount', { count: sources.length })")
    expect(exploreSourceCatalog).not.toContain("t('sourceCount', { count: selectedCategory.sourceCount })")
    expect(followSources).not.toContain("t('discovery.help')")
  })

  it('uses four compact category columns at desktop widths', () => {
    expect(exploreSourceCatalog).toContain('sm:grid-cols-2 lg:grid-cols-4')
    expect(exploreSourceCatalog).not.toContain('lg:grid-cols-3')
  })

  it('uses compact category card height and vertical spacing', () => {
    expect(exploreSourceCatalog).toContain('min-h-36 rounded-xl')
    expect(exploreSourceCatalog).toContain('mt-8 flex items-center gap-3')
    expect(exploreSourceCatalog).not.toContain('min-h-44 rounded-xl')
    expect(exploreSourceCatalog).not.toContain('mt-12 flex items-center gap-3')
  })

  it('groups the all-category Explore view by curated Miniflux category', () => {
    expect(exploreFeed).toMatch(/groupExploreEntriesByCategory/)
    expect(exploreFeed).toMatch(/t\('latestIn', \{ category: group\.key === 'explore-category:uncategorized'/)
    expect(exploreFeed).toMatch(/explore-category:/)
  })

  it('ignores stale Explore requests and offers detail retry recovery', () => {
    expect(exploreFeed).toMatch(/requestGeneration = useRef\(0\)/)
    expect(exploreFeed).toMatch(/generation !== requestGeneration\.current/)
    expect(exploreReaderSheet).toMatch(/\{t\('retry'\)\}/)
  })
})
