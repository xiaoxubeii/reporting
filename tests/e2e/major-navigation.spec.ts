import { test, expect, retryNetworkChangedOnce } from './support/observed-test'
import { signInToTenant } from './support/auth'
import { readE2EFixtureState } from './support/fixture-state'

const ENABLED_PRIMARY_ROUTES = [
  '/review',
  '/pending-actions',
  '/emails',
  '/deals',
  '/feeds',
  '/feeds/sources',
  '/search',
  '/diligence',
  '/diligence/inbox',
  '/diligence/analytics',
  '/experts',
  '/dashboard',
  '/import',
  '/investments',
  '/requests',
  '/interactions',
  '/letters',
  '/notes',
  '/compliance',
  '/lps',
  '/lp-portal',
  '/lps/preview',
  '/lp-activity',
  '/usage',
  '/settings/personal',
] as const

test('every enabled primary GP page renders without a route or runtime failure', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const origin = await signInToTenant(page, baseURL, primary)

  for (const route of ENABLED_PRIMARY_ROUTES) {
    await test.step(route, async () => {
      const response = await retryNetworkChangedOnce(() => (
        page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' })
      ))
      expect(response?.status(), `${route} document response`).toBe(200)
      await expect(page).toHaveURL(`${origin}${route}`)
      await expect(page.locator('main').first()).toBeVisible()
      await expect(page.locator('body')).not.toContainText('This page could not be found')
      await expect(page.locator('body')).not.toContainText('Internal Server Error')
    })
  }
})
