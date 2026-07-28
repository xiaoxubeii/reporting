import { test, expect } from '../support/observed-test'

test('platform entrypoint remains usable at mobile viewport', async ({ page, browserFailures }) => {
  void browserFailures
  await page.goto('/')
  await expect(page.locator('main')).toBeVisible()
  await expect(page.locator('body')).not.toHaveText(/^\s*$/)
})
