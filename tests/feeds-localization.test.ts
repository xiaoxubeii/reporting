import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { feedErrorMessageKey, FeedsApiError } from '../components/feeds/api'
import { LOCALIZED_PAGE_FILES, namespaceForPage } from '../i18n/ui-surface-inventory'

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const CLIENT_SURFACES = [
  'components/feeds/today-feed.tsx',
  'components/feeds/explore-feed.tsx',
  'components/feeds/follow-sources.tsx',
  'components/feeds/explore-source-catalog.tsx',
  'components/feeds/feed-reader-sheet.tsx',
  'components/feeds/explore-reader-sheet.tsx',
  'components/feeds/state-panel.tsx',
  'components/feeds/today-view-tabs.tsx',
] as const

describe('Feeds localization', () => {
  it('provides matching English and Simplified Chinese Feeds catalogs', () => {
    const english = JSON.parse(source('messages/en.json'))
    const chinese = JSON.parse(source('messages/zh-CN.json'))

    expect(english.Feeds).toBeDefined()
    expect(chinese.Feeds).toBeDefined()
    expect(flattenKeys(english.Feeds)).toEqual(flattenKeys(chinese.Feeds))
  })

  it('localizes every Follow category-menu action', () => {
    const english = JSON.parse(source('messages/en.json')).Feeds.sources.categoryMenu
    const chinese = JSON.parse(source('messages/zh-CN.json')).Feeds.sources.categoryMenu

    expect(english).toMatchObject({
      title: 'Choose a category',
      uncategorized: 'Uncategorized',
      searchCategories: 'Search folders',
      newCategory: 'New Folder',
      createAndFollow: 'Create and follow',
    })
    expect(chinese).toMatchObject({
      title: '选择分类',
      uncategorized: '未分类',
      searchCategories: '搜索文件夹',
      newCategory: '新建文件夹',
      createAndFollow: '创建并关注',
    })
  })

  it('localizes the curated source discovery and personal management views', () => {
    const english = JSON.parse(source('messages/en.json')).Feeds.sources
    const chinese = JSON.parse(source('messages/zh-CN.json')).Feeds.sources

    expect(english).toMatchObject({
      views: { explore: 'Explore sources', following: 'Following' },
      exploreHeading: 'Explore',
      featured: 'Featured',
      categorySheet: { label: 'Curated category' },
    })
    expect(chinese).toMatchObject({
      views: { explore: '探索来源', following: '已关注' },
      exploreHeading: '探索',
      featured: '精选来源',
      categorySheet: { label: '精选分类' },
    })
  })

  it('localizes Today and Follow sources metadata', () => {
    const todayPage = source('app/(app)/feeds/page.tsx')
    const sourcesPage = source('app/(app)/feeds/sources/page.tsx')

    expect(todayPage).toContain("getTranslations('Feeds.metadata')")
    expect(sourcesPage).toContain("getTranslations('Feeds.metadata')")
    expect(todayPage).not.toContain("title: 'Today · Feeds'")
    expect(sourcesPage).not.toContain("title: 'Follow sources · Feeds'")
  })

  it('registers both visual pages under the Feeds namespace', () => {
    const pages = [
      'app/(app)/feeds/page.tsx',
      'app/(app)/feeds/sources/page.tsx',
    ] as const

    for (const page of pages) {
      expect(LOCALIZED_PAGE_FILES).toContain(page)
      expect(namespaceForPage(page)).toBe('Feeds')
    }
  })

  it.each(CLIENT_SURFACES)('binds %s to the Feeds catalog', path => {
    expect(source(path)).toMatch(/useTranslations\('Feeds(?:\.[^']+)?'\)/)
  })

  it('does not retain the primary English page headings as product literals', () => {
    expect(source('components/feeds/today-feed.tsx')).not.toMatch(/>Today</)
    expect(source('components/feeds/explore-feed.tsx')).not.toMatch(/>Today</)
    expect(source('components/feeds/follow-sources.tsx')).not.toMatch(/>Follow sources</)
    expect(source('components/feeds/follow-sources.tsx')).not.toContain('topic.description')
  })

  it('maps API error codes to localizable message keys', () => {
    expect(feedErrorMessageKey(new FeedsApiError({ code: 'authentication', message: 'English detail' }, 409))).toBe('authentication')
    expect(feedErrorMessageKey(new FeedsApiError({ code: 'rate_limited', message: 'English detail' }, 429))).toBe('rateLimited')
    expect(feedErrorMessageKey(new FeedsApiError({ code: 'unexpected', message: 'English detail' }, 500))).toBe('requestFailed')
    expect(feedErrorMessageKey(new Error('Network failure'))).toBe('requestFailed')
  })

  it.each([
    'components/feeds/today-feed.tsx',
    'components/feeds/explore-feed.tsx',
    'components/feeds/follow-sources.tsx',
    'components/feeds/explore-source-catalog.tsx',
    'components/feeds/feed-reader-sheet.tsx',
    'components/feeds/explore-reader-sheet.tsx',
  ])('clears localized transient state when the locale changes in %s', path => {
    const component = source(path)
    expect(component).toContain('useLocale()')
    expect(component).toMatch(/useEffect\(\(\) => \{[\s\S]*?\}, \[locale\]\)/)
  })
})

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort()
}
