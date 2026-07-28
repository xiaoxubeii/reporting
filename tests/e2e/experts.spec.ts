import { test, expect } from './support/observed-test'
import { signInToTenant } from './support/auth'
import { readE2EFixtureState } from './support/fixture-state'

test('Fund admin creates and updates a reusable expert directory record', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const origin = await signInToTenant(page, baseURL, primary)
  const expertName = `Dr. E2E ${primary.suffix.slice(-8)}`
  const updatedTitle = 'Chief Clinical Advisor'

  await page.goto(`${origin}/experts`)
  await expect(page.getByRole('heading', { name: 'Expert Directory' })).toBeVisible()
  await page.getByRole('tab', { name: 'Fund Experts' }).click()
  await page.getByRole('button', { name: 'Add expert manually' }).click()

  const createForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save as fund expert' }) })
  await createForm.getByLabel('Name').fill(expertName)
  await createForm.getByLabel('Work email').fill(`expert-${primary.suffix}@example.invalid`)
  await createForm.getByLabel('Title / role').fill('Cardiology Advisor')
  await createForm.getByLabel('Organization').fill('E2E Clinical Institute')
  await createForm.getByLabel('Specialty and experience').fill('Cardiovascular diagnostics, clinical evidence review, and hospital workflow validation.')
  const createResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/experts'
    && response.request().method() === 'POST'
  ))
  await createForm.getByRole('button', { name: 'Save as fund expert' }).click()
  expect((await createResponse).status()).toBe(201)

  const expertCard = page.locator('article').filter({ has: page.getByRole('heading', { name: expertName }) })
  await expect(expertCard).toContainText('Fund confirmed · Manual')
  await expertCard.getByRole('button', { name: 'Manage' }).click()
  const editForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save changes' }) })
  await editForm.getByLabel('Title / role').fill(updatedTitle)
  const updateResponse = page.waitForResponse(response => (
    /\/api\/experts\/[^/]+$/.test(new URL(response.url()).pathname)
    && response.request().method() === 'PATCH'
  ))
  await editForm.getByRole('button', { name: 'Save changes' }).click()
  expect((await updateResponse).status()).toBe(200)
  await expect(page.locator('article').filter({ hasText: expertName })).toContainText(updatedTitle)
})
