import { test, expect } from './support/observed-test'
import type { Page } from '@playwright/test'
import { signInToTenant } from './support/auth'
import { readE2EFixtureState } from './support/fixture-state'

async function ensurePersonalFeedsConnection(page: Page): Promise<void> {
  const status = await page.evaluate(async () => {
    const current = await fetch('/api/feeds/connection')
    const currentBody = await current.json() as { data?: { connected?: boolean } }
    if (current.ok && currentBody.data?.connected) return current.status
    const provisioned = await fetch('/api/feeds/connection', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    return provisioned.status
  })
  expect(status).toBe(200)
}

test('a user provisions feeds, follows a curated source into a new folder, and opens discovery views', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const origin = await signInToTenant(page, baseURL, primary)
  const folderName = `E2E ${primary.suffix.slice(-8)}`

  await page.goto(`${origin}/feeds/sources`)
  await expect(page.getByRole('heading', { name: 'Follow sources' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Explore sources' })).toHaveAttribute('aria-current', 'page')

  const provision = await page.evaluate(async () => {
    const response = await fetch('/api/feeds/connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    return { status: response.status, body: await response.json() }
  })
  expect(provision.status).toBe(200)
  expect(provision.body).toMatchObject({ success: true, data: { connected: true } })
  await page.reload()

  const catalog = page.locator('section[aria-labelledby="explore-sources-heading"]')
  const firstCategory = catalog.getByRole('button').first()
  await expect(firstCategory).toBeVisible()
  await firstCategory.click()

  const sourceSheet = page.getByRole('dialog')
  await expect(sourceSheet).toBeVisible()
  const sourceName = (await sourceSheet.getByRole('heading', { level: 3 }).first().innerText()).trim()
  expect(sourceName).not.toBe('')
  const followButton = sourceSheet.getByRole('button', { name: 'Follow', exact: true }).first()
  await expect(followButton).toBeEnabled()
  await followButton.click()
  await page.getByRole('button', { name: 'New Folder' }).click()
  await page.getByRole('textbox', { name: 'New Folder' }).fill(folderName)
  const followResponse = page.waitForResponse(response => (
    /\/api\/feeds\/explore\/sources\/[^/]+\/follow$/.test(new URL(response.url()).pathname)
    && response.request().method() === 'POST'
  ))
  await page.getByRole('button', { name: 'Create and follow' }).click()
  const followed = await followResponse
  expect(followed.status()).toBe(201)
  const followedBody = await followed.json()
  const subscriptionId = followedBody.data?.subscription?.id
  expect(subscriptionId).toEqual(expect.any(Number))
  await expect(sourceSheet.getByRole('button', { name: 'Following', exact: true }).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sourceSheet).toBeHidden()

  const followPath = new URL(followed.url()).pathname
  const duplicateFollow = await page.evaluate(async ({ path, topic }) => {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    })
    return { status: response.status, body: await response.json() }
  }, { path: followPath, topic: folderName })
  expect(duplicateFollow.status).toBe(201)
  expect(duplicateFollow.body.data?.subscription?.id).toBe(subscriptionId)

  await page.goto(`${origin}/feeds`)
  await expect(page.getByRole('link', { name: 'Me', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch('/api/feeds/entries?limit=30&offset=0&filter=all')
    const body = await response.json()
    return body.data?.items?.length ?? 0
  }), { timeout: 45_000, intervals: [1_000, 2_000, 5_000] }).toBeGreaterThan(0)

  const firstEntry = await page.evaluate(async () => {
    const response = await fetch('/api/feeds/entries?limit=30&offset=0&filter=all')
    const body = await response.json()
    return body.data.items[0] as { title: string; upstreamId: number }
  })
  await page.getByRole('button', { name: 'All', exact: true }).click()
  const articleTitle = page.getByRole('button', { name: firstEntry.title, exact: true }).first()
  await expect(articleTitle).toBeVisible()
  const article = articleTitle.locator('xpath=ancestor::article')
  const saveResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname === `/api/feeds/entries/${firstEntry.upstreamId}/state`
    && response.request().method() === 'PATCH'
  ))
  await article.getByRole('button', { name: 'Save for later' }).click()
  expect((await saveResponse).status()).toBe(200)

  const readResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname === `/api/feeds/entries/${firstEntry.upstreamId}/state`
    && response.request().method() === 'PATCH'
  ))
  await articleTitle.click()
  expect((await readResponse).status()).toBe(200)
  const reader = page.getByRole('dialog').filter({ hasText: firstEntry.title })
  await expect(reader).toBeVisible()
  await expect(reader.getByRole('button', { name: 'Mark unread' })).toBeVisible()
  const unreadResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname === `/api/feeds/entries/${firstEntry.upstreamId}/state`
    && response.request().method() === 'PATCH'
  ))
  await reader.getByRole('button', { name: 'Mark unread' }).click()
  expect((await unreadResponse).status()).toBe(200)
  await expect(reader.getByRole('button', { name: 'Mark read' })).toBeVisible()
  await reader.getByRole('button', { name: 'Close article reader' }).click()

  await page.getByRole('button', { name: 'Saved', exact: true }).click()
  await expect(page.getByRole('button', { name: firstEntry.title, exact: true }).first()).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Saved', exact: true }).click()
  const savedTitle = page.getByRole('button', { name: firstEntry.title, exact: true }).first()
  await expect(savedTitle).toBeVisible()

  await savedTitle.click()
  const reopenedReader = page.getByRole('dialog').filter({ hasText: firstEntry.title })
  await expect(reopenedReader).toBeVisible()
  await reopenedReader.getByRole('button', { name: 'Create Deal from article' }).click()
  const dealDialog = page.getByRole('dialog', { name: 'New deal' })
  const feedDealName = `Feed Deal ${primary.suffix.slice(-8)}`
  await dealDialog.getByLabel('Company name *').fill(feedDealName)
  await dealDialog.getByLabel('Founder name *').fill('Feed Founder')
  await dealDialog.getByLabel('Founder email *').fill(`feed-${primary.suffix}@example.invalid`)
  await dealDialog.getByRole('button', { name: 'Create deal' }).click()
  await page.waitForURL(url => url.origin === origin && /^\/deals\/[^/]+$/.test(url.pathname))
  await expect(page.getByRole('heading').filter({ hasText: feedDealName })).toBeVisible()

  await page.goto(`${origin}/feeds`)
  await page.getByRole('button', { name: 'Saved', exact: true }).click()
  const persistedSavedTitle = page.getByRole('button', { name: firstEntry.title, exact: true }).first()
  await expect(persistedSavedTitle).toBeVisible()

  const savedArticle = persistedSavedTitle.locator('xpath=ancestor::article')
  const removeSavedResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname === `/api/feeds/entries/${firstEntry.upstreamId}/state`
    && response.request().method() === 'PATCH'
  ))
  await savedArticle.getByRole('button', { name: 'Remove from saved' }).click()
  expect((await removeSavedResponse).status()).toBe(200)
  await expect(persistedSavedTitle).toHaveCount(0)

  await page.goto(`${origin}/feeds/sources?view=following`)
  await page.getByRole('link', { name: 'Following', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/feeds/sources?view=following`)
  await expect(page.getByText(folderName, { exact: true })).toBeVisible()
  const escapedSourceName = sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const manageSource = page.getByRole('button', { name: new RegExp(`^Manage ${escapedSourceName}`) }).first()
  await expect(manageSource).toBeVisible()
  await manageSource.click()
  const unfollowResponse = page.waitForResponse(response => (
    /\/api\/feeds\/subscriptions\/[^/]+$/.test(new URL(response.url()).pathname)
    && response.request().method() === 'DELETE'
  ))
  await page.getByRole('button', { name: new RegExp(`^Unfollow ${escapedSourceName}`) }).click()
  expect((await unfollowResponse).status()).toBe(200)
  await expect(page.getByText(`${sourceName} unfollowed`, { exact: true })).toBeAttached()
  await expect(manageSource).toHaveCount(0)

  await page.goto(`${origin}/feeds/sources`)
  await page.locator('section[aria-labelledby="explore-sources-heading"]').getByRole('button').first().click()
  const restoredSheet = page.getByRole('dialog')
  await expect(restoredSheet.getByRole('heading', { name: sourceName, exact: true })).toBeVisible()
  const restoredFollow = restoredSheet.getByRole('button', { name: 'Follow', exact: true }).first()
  await expect(restoredFollow).toBeEnabled()
  await restoredFollow.click()
  await page.getByRole('button', { name: folderName, exact: true }).click()
  await expect(restoredSheet.getByRole('button', { name: 'Following', exact: true }).first()).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto(`${origin}/feeds`)
  await page.getByRole('link', { name: 'Explore', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/feeds?view=explore`)
  for (const tab of ['Latest', 'Trending', 'Deal Signals']) {
    await expect(page.getByRole('link', { name: tab, exact: true })).toBeVisible()
  }
  await page.getByRole('link', { name: 'Trending', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/feeds?view=explore&exploreView=trending`)
  await expect(page.getByText('No topics are trending yet').or(page.locator('main article').first())).toBeVisible()
  await page.getByRole('link', { name: 'Deal Signals', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/feeds?view=explore&exploreView=deal_signal`)
  await expect(page.getByText('No open Deal Signals right now').or(page.locator('main article').first())).toBeVisible()
})

test('personal Miniflux state is isolated between Funds and cannot mutate the curated collector', async ({ browser, baseURL, browserFailureAllowances }) => {
  test.setTimeout(120_000)
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const secondary = await readE2EFixtureState('E2E_SECONDARY_FIXTURE_STATE')
  const primaryContext = await browser.newContext()
  const secondaryContext = await browser.newContext()

  try {
    const primaryPage = await primaryContext.newPage()
    const secondaryPage = await secondaryContext.newPage()
    await signInToTenant(primaryPage, baseURL, primary)
    await signInToTenant(secondaryPage, baseURL, secondary)

    for (const target of [primaryPage, secondaryPage]) await ensurePersonalFeedsConnection(target)

    const collectorBefore = await primaryPage.evaluate(async () => {
      const [categoriesResponse, entriesResponse] = await Promise.all([
        fetch('/api/feeds/explore/categories'),
        fetch('/api/feeds/explore/entries?limit=5&offset=0'),
      ])
      const categories = await categoriesResponse.json()
      const entries = await entriesResponse.json()
      return {
        categoryIds: categories.data.categories.map((item: { id: string }) => item.id),
        entryIds: entries.data.items.map((item: { id: string }) => item.id),
        firstSourceId: entries.data.items[0]?.source?.id as string | undefined,
      }
    })
    expect(collectorBefore.firstSourceId).toEqual(expect.any(String))

    const followStatus = await primaryPage.evaluate(async ({ sourceId, topic }) => {
      const response = await fetch(`/api/feeds/explore/sources/${encodeURIComponent(sourceId)}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      })
      return response.status
    }, { sourceId: collectorBefore.firstSourceId!, topic: `Fund A ${primary.suffix.slice(-8)}` })
    expect(followStatus).toBe(201)

    await expect.poll(async () => primaryPage.evaluate(async () => {
      const response = await fetch('/api/feeds/entries?filter=all&limit=5&offset=0')
      const body = await response.json()
      return body.data?.items?.length ?? 0
    }), { timeout: 45_000, intervals: [1_000, 2_000, 5_000] }).toBeGreaterThan(0)

    const isolationState = await Promise.all([primaryPage, secondaryPage].map(target => target.evaluate(async () => {
      const [followingResponse, entriesResponse] = await Promise.all([
        fetch('/api/feeds/explore/following'),
        fetch('/api/feeds/entries?filter=all&limit=5&offset=0'),
      ])
      const following = await followingResponse.json()
      const entries = await entriesResponse.json()
      return { sourceIds: following.data.sourceIds as string[], entries: entries.data.items as Array<{ upstreamId: number; isSaved: boolean }> }
    })))
    expect(isolationState[0].sourceIds).toContain(collectorBefore.firstSourceId)
    expect(isolationState[0].entries.length).toBeGreaterThan(0)
    expect(isolationState[1]).toMatchObject({ sourceIds: [], entries: [] })

    const primaryEntry = isolationState[0].entries[0]
    browserFailureAllowances.allow({
      kind: 'console',
      pathname: `/api/feeds/entries/${primaryEntry.upstreamId}/state`,
      status: 404,
    })
    const deniedMutation = await secondaryPage.evaluate(async id => {
      const response = await fetch(`/api/feeds/entries/${id}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSaved: true }),
      })
      return { status: response.status, body: await response.text() }
    }, primaryEntry.upstreamId)
    expect(deniedMutation.status).toBe(404)
    expect(deniedMutation.body).not.toContain(primary.fundName)

    const primaryAfter = await primaryPage.evaluate(async id => {
      const response = await fetch(`/api/feeds/entries/${id}`)
      const body = await response.json()
      return { status: response.status, isSaved: body.data?.entry?.isSaved }
    }, primaryEntry.upstreamId)
    expect(primaryAfter).toEqual({ status: 200, isSaved: primaryEntry.isSaved })

    const collectorAfter = await secondaryPage.evaluate(async () => {
      const [categoriesResponse, entriesResponse] = await Promise.all([
        fetch('/api/feeds/explore/categories'),
        fetch('/api/feeds/explore/entries?limit=5&offset=0'),
      ])
      const categories = await categoriesResponse.json()
      const entries = await entriesResponse.json()
      return {
        categoryIds: categories.data.categories.map((item: { id: string }) => item.id),
        entryIds: entries.data.items.map((item: { id: string }) => item.id),
      }
    })
    expect(collectorAfter).toEqual({
      categoryIds: collectorBefore.categoryIds,
      entryIds: collectorBefore.entryIds,
    })
  } finally {
    await primaryContext.close()
    await secondaryContext.close()
  }
})
