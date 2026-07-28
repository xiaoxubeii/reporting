import { test, expect } from '../support/observed-test'
import { signInToTenant } from '../support/auth'
import { readE2EFixtureState } from '../support/fixture-state'

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  await expect.poll(() => page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))).toEqual(expect.objectContaining({
    clientWidth: expect.any(Number),
    scrollWidth: expect.any(Number),
  }))
  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))
  const offenders = overflow > 1
    ? await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map(element => {
        const rect = element.getBoundingClientRect()
        return { tag: element.tagName, text: element.innerText?.slice(0, 80), left: rect.left, right: rect.right, width: rect.width }
      })
      .filter(rect => rect.right > document.documentElement.clientWidth + 1 || rect.left < -1)
      .sort((left, right) => right.right - left.right)
      .slice(0, 10))
    : []
  expect(overflow, JSON.stringify(offenders)).toBeLessThanOrEqual(1)
}

test('authenticated mobile navigation closes, restores focus, localizes, and does not overflow', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const origin = await signInToTenant(page, baseURL, primary)
  const menuButton = page.getByRole('button', { name: 'Open menu' })

  await expect(menuButton).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await menuButton.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(menuButton).toBeFocused()

  await menuButton.click()
  await page.getByRole('dialog').getByRole('link', { name: 'Deals', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/deals`)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Deals', exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: 'Open menu' }).click()
  const language = page.getByRole('combobox', { name: /Language:/ })
  await language.click()
  await page.getByRole('option', { name: '简体中文' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByRole('dialog', { name: '应用导航' })).toBeVisible()
  await page.getByRole('button', { name: '关闭菜单' }).click()
  await expect(page.getByRole('button', { name: '打开菜单' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})
