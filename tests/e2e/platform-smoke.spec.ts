import { test, expect } from './support/observed-test'

test('platform entrypoint renders a meaningful public state', async ({ page, browserFailures }) => {
  void browserFailures
  await page.goto('/')
  await expect(page.locator('main')).toBeVisible()
  await expect(page.locator('body')).not.toHaveText(/^\s*$/)
  await expect(page).toHaveTitle(/FundWorkspace|Reporting/i)
})
