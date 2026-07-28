import { test, expect } from './support/observed-test'
import type { Locator, Page } from '@playwright/test'
import { SEARCH_ADAPTER_DESCRIPTORS } from '../../lib/search/adapter-contracts'
import { signInToTenant } from './support/auth'
import { readE2EFixtureState } from './support/fixture-state'
import { deleteLocalManagedMinifluxUser } from './support/miniflux'

interface SearchSource {
  readonly id: string
  readonly status: string
  readonly resultCount: number
  readonly message?: string
}

interface SearchHit {
  readonly id: string
  readonly title: string
  readonly url?: string
  readonly primaryOrigin: string
  readonly origins: readonly string[]
  readonly sources: readonly { readonly id: string; readonly label: string }[]
}

interface SearchPayload {
  readonly success: boolean
  readonly data: {
    readonly sources: readonly SearchSource[]
    readonly results: readonly SearchHit[]
    readonly partial: boolean
  }
}

const REPRESENTATIVE_QUERY: Readonly<Record<string, string>> = Object.freeze({
  feeds: 'cardiovascular stent',
  web: 'cardiovascular stent',
  pubmed: 'cardiovascular stent',
  clinical_trials: 'cardiovascular disease',
  fda: 'stent',
})

async function selectOnly(checkboxes: Locator, selectedIndex: number): Promise<void> {
  for (let index = 0; index < await checkboxes.count(); index += 1) {
    const checkbox = checkboxes.nth(index)
    if (index === selectedIndex) {
      if (!(await checkbox.isChecked())) await checkbox.check()
    } else if (await checkbox.isChecked()) {
      await checkbox.uncheck()
    }
  }
}

async function submitSearch(page: Page, origin: string, query: string): Promise<SearchPayload> {
  await page.getByRole('textbox', { name: 'Search query' }).fill(query)
  const responsePromise = page.waitForResponse(response => (
    response.url() === `${origin}/api/search` && response.request().method() === 'POST'
  ))
  await page.getByRole('button', { name: /^search$/i }).click()
  const response = await responsePromise
  expect(response.status()).toBe(200)
  const payload = await response.json() as SearchPayload
  expect(payload.success).toBe(true)
  return payload
}

async function ensurePersonalFeedsConnection(page: Page): Promise<void> {
  const status = await page.evaluate(async () => {
    const current = await fetch('/api/feeds/connection')
    const currentBody = await current.json() as { data?: { connected?: boolean } }
    if (current.ok && currentBody.data?.connected) return current.status
    const provisioned = await fetch('/api/feeds/connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    return provisioned.status
  })
  expect(status).toBe(200)
}

test('Search dynamically executes every configured live adapter with safe provenance and empty-state handling', async ({ page, baseURL, browserFailureAllowances }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const origin = await signInToTenant(page, baseURL, primary)

  await ensurePersonalFeedsConnection(page)

  await page.goto(`${origin}/search`)
  await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible()
  const disabledCategories = page.locator('aside input[type="checkbox"]:disabled')
  await expect(disabledCategories).toHaveCount(1)
  await expect(page.getByText('No source in this category is currently available.')).toBeVisible()

  const enabledCategories = page.locator('aside input[type="checkbox"]:enabled')
  expect(await enabledCategories.count()).toBeGreaterThan(0)
  const expectedLiveAdapters = SEARCH_ADAPTER_DESCRIPTORS
    .filter(descriptor => descriptor.liveTransportAvailable)
    .map(descriptor => descriptor.id)
    .sort()
  const observedAdapters = new Set<string>()
  let feedsCategoryIndex: number | null = null

  for (let index = 0; index < await enabledCategories.count(); index += 1) {
    await selectOnly(enabledCategories, index)
    let payload = await submitSearch(page, origin, 'cardiovascular stent')
    expect(payload.data.sources.length).toBeGreaterThan(0)

    const emptyExternalSource = payload.data.sources.find(source => source.id !== 'feeds' && source.status === 'empty')
    if (emptyExternalSource) {
      const representativeQuery = REPRESENTATIVE_QUERY[emptyExternalSource.id]
      expect(representativeQuery, `Missing representative query for ${emptyExternalSource.id}`).toEqual(expect.any(String))
      payload = await submitSearch(page, origin, representativeQuery)
    }

    for (const source of payload.data.sources) {
      observedAdapters.add(source.id)
      expect(expectedLiveAdapters).toContain(source.id)
      expect(['ok', 'empty', 'unavailable', 'timeout', 'rate_limited', 'invalid_response', 'failed']).toContain(source.status)
      if (source.id === 'feeds') {
        feedsCategoryIndex = index
        expect(source.status).toBe('empty')
        expect(source.resultCount).toBe(0)
      } else {
        expect(source.status, `${source.id} representative query status`).toBe('ok')
        expect(source.resultCount, `${source.id} representative query result count`).toBeGreaterThan(0)
      }
    }

    for (const hit of payload.data.results) {
      expect(hit.id).toEqual(expect.any(String))
      expect(hit.title.trim().length).toBeGreaterThan(0)
      expect(hit.sources.length).toBeGreaterThan(0)
      expect(hit.origins).toContain(hit.primaryOrigin)
      if (hit.url) {
        const url = new URL(hit.url)
        expect(['http:', 'https:']).toContain(url.protocol)
        expect(url.username).toBe('')
        expect(url.password).toBe('')
      }
    }

    if (payload.data.results.length > 0) {
      await expect(page.locator('main article').first()).toBeVisible()
      const renderedLinks = page.locator('main article a[target="_blank"]')
      expect(await renderedLinks.count()).toBeGreaterThan(0)
      for (let linkIndex = 0; linkIndex < await renderedLinks.count(); linkIndex += 1) {
        await expect(renderedLinks.nth(linkIndex)).toHaveAttribute('rel', 'noopener noreferrer')
      }
    }

    if (payload.data.partial) {
      await expect(page.getByText('Some sources could not be searched. Available results are shown below.')).toBeVisible()
    }
  }

  expect(Array.from(observedAdapters).sort()).toEqual(expectedLiveAdapters)
  expect(feedsCategoryIndex).not.toBeNull()

  await selectOnly(enabledCategories, feedsCategoryIndex!)
  const emptyPayload = await submitSearch(page, origin, `no-result-${primary.suffix}`)
  expect(emptyPayload.data).toMatchObject({ partial: false, results: [] })
  expect(emptyPayload.data.sources).toEqual([
    expect.objectContaining({ id: 'feeds', status: 'empty', resultCount: 0 }),
  ])
  await expect(page.getByText('No results matched this search.')).toBeVisible()

  const unknownCategory = await page.evaluate(async () => {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'cardiovascular', categoryIds: ['not-a-real-category'] }),
    })
    return { status: response.status, body: await response.text() }
  })
  browserFailureAllowances.allow({ kind: 'console', pathname: '/api/search', status: 400 })
  expect(unknownCategory.status).toBe(400)
  expect(unknownCategory.body).not.toContain(primary.fundName)

  const crossOrigin = await page.request.post(`${origin}/api/search`, {
    headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' },
    data: { query: 'cardiovascular', categoryIds: ['internet'] },
  })
  expect(crossOrigin.status()).toBe(403)
  expect(await crossOrigin.text()).not.toContain(primary.fundName)
})

test('Search preserves successful Web results when the real personal Feeds dependency loses authentication', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const origin = await signInToTenant(page, baseURL, primary)

  await ensurePersonalFeedsConnection(page)
  await deleteLocalManagedMinifluxUser(primary.userId)

  await page.goto(`${origin}/search`)
  const payload = await submitSearch(page, origin, 'cardiovascular stent')
  expect(payload.data.partial).toBe(true)
  expect(payload.data.sources).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'feeds', status: 'unavailable', resultCount: 0 }),
    expect.objectContaining({ id: 'web', status: 'ok' }),
  ]))
  expect(payload.data.results.length).toBeGreaterThan(0)
  await expect(page.getByText('Some sources could not be searched. Available results are shown below.')).toBeVisible()
  const feedFailure = payload.data.sources.find(source => source.id === 'feeds')
  expect(feedFailure?.message).toEqual(expect.any(String))
  await expect(page.getByRole('listitem').filter({ hasText: feedFailure!.message! })).toBeVisible()
})
