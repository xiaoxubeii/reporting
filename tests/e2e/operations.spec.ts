import { test, expect } from './support/observed-test'
import { signInToTenant } from './support/auth'
import { readE2EFixtureState } from './support/fixture-state'

test('admin operational pages load their data and personal identity can be updated', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const origin = await signInToTenant(page, baseURL, primary)

  const pendingResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/pending-actions'
    && response.request().method() === 'GET'
  ))
  await page.goto(`${origin}/pending-actions`)
  expect((await pendingResponse).status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Pending Actions' })).toBeVisible()
  await expect(page.getByText('Nothing pending. Drafts you stage in the Analyst show up here.')).toBeVisible()

  const usageResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/usage'
    && response.request().method() === 'GET'
  ))
  await page.goto(`${origin}/usage`)
  expect((await usageResponse).status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'AI Usage' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Daily Breakdown' })).toBeVisible()

  const settingsResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/settings/personal'
    && response.request().method() === 'GET'
  ))
  await page.goto(`${origin}/settings/personal`)
  expect((await settingsResponse).status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Personal settings' })).toBeVisible()
  await expect(page.locator('#mailbox').getByText(primary.fundName, { exact: true })).toBeVisible()

  const fullName = `E2E Admin ${primary.suffix.slice(-8)}`
  await page.getByLabel('Real name').fill(fullName)
  const updateResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/settings/personal'
    && response.request().method() === 'PATCH'
  ))
  await page.getByRole('button', { name: 'Save name' }).click()
  expect((await updateResponse).status()).toBe(200)
  await expect(page.getByText('Your real name was saved.')).toBeVisible()
  await expect(page.getByLabel('Real name')).toHaveValue(fullName)
})
