import { test, expect } from './support/observed-test'
import { readE2EFixtureState } from './support/fixture-state'
import { tenantOrigin } from './support/auth'

test('platform and private Fund landing pages remain distinct and Fund scoped', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const secondary = await readE2EFixtureState('E2E_SECONDARY_FIXTURE_STATE')

  await page.goto(new URL(baseURL).origin)
  await expect(page.locator('main')).toBeVisible()
  await expect(page).toHaveTitle(/FundWorkspace|Reporting/i)
  await expect(page.getByText(primary.fundName, { exact: true })).toHaveCount(0)

  await page.goto(tenantOrigin(baseURL, primary))
  await expect(page.locator('main[data-public-site-state="private"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: primary.fundName })).toBeVisible()
  await expect(page.getByText('The public website has not been published yet. Members can sign in to the workspace.')).toBeVisible()
  await expect(page.getByText(secondary.fundName, { exact: true })).toHaveCount(0)

  await page.goto(tenantOrigin(baseURL, secondary))
  await expect(page.getByRole('heading', { name: secondary.fundName })).toBeVisible()
  await expect(page.getByText(primary.fundName, { exact: true })).toHaveCount(0)
})

test('authentication surfaces validate input, support keyboard login, and reject an external next target', async ({ page, baseURL, browserFailureAllowances }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const origin = tenantOrigin(baseURL, primary)

  await page.goto(`${origin}/auth?next=${encodeURIComponent('https://evil.example/collect')}`)
  await expect(page.getByRole('heading', { name: 'Sign in with your account' })).toBeVisible()
  await page.getByLabel('Email').fill(primary.email)
  await page.getByLabel('Password').fill('definitely-wrong-password')
  browserFailureAllowances.allow({
    kind: 'console',
    pathname: '/_supabase/auth/v1/token',
    status: 400,
  })
  await page.getByLabel('Password').press('Enter')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(url => url.origin === origin && url.pathname === '/auth')

  await page.getByLabel('Password').fill(primary.password)
  await page.getByLabel('Password').press('Enter')
  await page.waitForURL(url => url.origin === origin && url.pathname === '/dashboard')
  expect(new URL(page.url()).hostname).not.toBe('evil.example')

  await page.context().clearCookies()
  const authPages = [
    ['/auth/signup', 'Create an account'],
    ['/auth/forgot-password', 'Reset your password'],
    ['/auth/magic-link', 'Sign in with a one-time code'],
    ['/auth/reset-password', 'Set new password'],
  ] as const
  for (const [path, heading] of authPages) {
    await test.step(path, async () => {
      const response = await page.goto(`${origin}${path}`)
      expect(response?.status()).toBe(200)
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      await expect(page.locator('body')).not.toHaveText(/^\s*$/)
    })
  }

  await page.getByLabel('New password').fill('short')
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Password must be at least 8 characters.' })).toBeVisible()

  await page.goto(`${origin}/auth/forgot-password`)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Enter your email address.' })).toBeVisible()

  await page.goto(`${origin}/auth/magic-link?next=${encodeURIComponent('//evil.example')}`)
  await expect(page.getByRole('link', { name: 'Sign in with password' })).toHaveAttribute('href', '/auth')
})
