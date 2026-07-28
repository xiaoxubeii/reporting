import { test, expect } from './support/observed-test'
import { signInToTenant } from './support/auth'
import { readE2EFixtureState } from './support/fixture-state'
import { deleteLocalManagedMinifluxUser } from './support/miniflux'

test('a revoked managed Miniflux identity fails visibly and can be reprovisioned through the UI', async ({ page, baseURL, browserFailureAllowances }) => {
  test.setTimeout(120_000)
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const origin = await signInToTenant(page, baseURL, primary)

  browserFailureAllowances.allow({
    kind: 'response',
    pathname: '/api/feeds/entries',
    status: 502,
  })
  browserFailureAllowances.allow({
    kind: 'console',
    pathname: '/api/feeds/entries',
    status: 502,
  })

  const provisioned = await page.evaluate(async () => {
    const response = await fetch('/api/feeds/connection', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    return response.status
  })
  expect(provisioned).toBe(200)
  await deleteLocalManagedMinifluxUser(primary.userId)

  await page.goto(`${origin}/feeds`)
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Connect Miniflux to start reading' })).toBeVisible()
  await expect(page.getByText('The feed connection needs to be reconnected.')).toBeVisible()

  await page.goto(`${origin}/feeds/sources?view=following`)
  await expect(page.getByRole('heading', { name: 'Feed account is not ready' })).toBeVisible()
  const recoveryResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/feeds/connection'
    && response.request().method() === 'POST'
  ))
  await page.getByRole('button', { name: 'Retry provisioning' }).click()
  expect((await recoveryResponse).status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Feed account is not ready' })).toHaveCount(0)
  await expect(page.getByText('Personal Miniflux account is ready')).toBeAttached()

  await page.goto(`${origin}/feeds`)
  await expect(page.getByRole('heading', { name: 'No sources followed yet' })).toBeVisible()
})
