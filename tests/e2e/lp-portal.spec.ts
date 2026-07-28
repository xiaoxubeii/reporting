import { test, expect } from './support/observed-test'
import { gotoAfterTimeZoneBootstrap, signInToTenant, tenantOrigin } from './support/auth'
import { readE2EFixtureState, readE2ELpFixtureState } from './support/fixture-state'

test('Fund A LP traverses the real portal while Fund B and GP-only access fail closed', async ({ page, context, browser, baseURL, browserFailureAllowances }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const secondary = await readE2EFixtureState('E2E_SECONDARY_FIXTURE_STATE')
  const lp = await readE2ELpFixtureState()
  const primaryOrigin = tenantOrigin(baseURL, primary)
  const secondaryOrigin = tenantOrigin(baseURL, secondary)

  expect(lp.fundId).toBe(primary.fundId)
  expect(lp.fundSlug).toBe(primary.fundSlug)

  await gotoAfterTimeZoneBootstrap(page, `${primaryOrigin}/auth`)
  await page.locator('#email').fill(lp.email)
  await page.locator('#password').fill(lp.password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(`${primaryOrigin}/portal/overview`)

  await expect(page.getByText(primary.fundName, { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: `Welcome, ${lp.marker}` })).toBeVisible()
  await expect(page.getByText('No performance figures have been shared with you yet.')).toBeVisible()

  await page.getByRole('link', { name: 'Library' }).click()
  await page.waitForURL(`${primaryOrigin}/portal/snapshots`)
  await expect(page.getByRole('heading', { name: 'Your documents' })).toBeVisible()
  await expect(page.getByText('Capital Statement', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.waitForURL(`${primaryOrigin}/portal/settings`)
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByText('No one else has access to your account.')).toBeVisible()

  const messageMarker = `LP portal question ${lp.suffix}`
  await page.getByRole('link', { name: 'Contact' }).click()
  await page.waitForURL(`${primaryOrigin}/portal/contact`)
  await page.getByPlaceholder('e.g. Question about my Q4 statement').fill(messageMarker)
  await page.getByPlaceholder('Write your message…').fill(`${messageMarker} body`)
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Message sent', { exact: true })).toBeVisible()

  const lpCookies = await context.cookies(primaryOrigin)
  await context.addCookies(lpCookies.map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: new URL(secondaryOrigin).hostname,
    path: '/',
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  })))

  for (const pathname of ['/portal/overview', '/api/portal/overview', '/favicon.ico']) {
    browserFailureAllowances.allow({ kind: 'console', pathname, status: 404 })
  }

  const crossPage = await page.goto(`${secondaryOrigin}/portal/overview`)
  expect(crossPage?.status()).toBe(404)
  await expect(page.getByText(lp.marker, { exact: false })).toHaveCount(0)
  const crossApi = await page.evaluate(async () => {
    const response = await fetch('/api/portal/overview')
    return { status: response.status, body: await response.text() }
  })
  expect(crossApi.status).toBe(404)
  expect(crossApi.body).not.toContain(lp.marker)
  expect(crossApi.body).not.toContain(primary.fundName)

  const gpContext = await browser.newContext()
  try {
    const gpPage = await gpContext.newPage()
    await signInToTenant(gpPage, baseURL, primary)

    const persistedMessage = await gpPage.evaluate(async marker => {
      const response = await fetch('/api/lps/messages')
      return { status: response.status, body: await response.text(), marker }
    }, messageMarker)
    expect(persistedMessage.status).toBe(200)
    expect(persistedMessage.body).toContain(messageMarker)

    const gpPortalApi = await gpPage.evaluate(async () => {
      const response = await fetch('/api/portal/overview')
      return { status: response.status, body: await response.text() }
    })
    expect(gpPortalApi.status).toBe(404)
    expect(gpPortalApi.body).not.toContain(lp.marker)

    await gpPage.goto(`${primaryOrigin}/portal/overview`)
    await expect(gpPage).toHaveURL(`${primaryOrigin}/`)
    await expect(gpPage.getByText(lp.marker, { exact: false })).toHaveCount(0)
  } finally {
    await gpContext.close()
  }
})
