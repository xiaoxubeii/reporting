import { test, expect } from './support/observed-test'
import type { Page } from '@playwright/test'
import { gotoAfterTimeZoneBootstrap, seedE2ETimeZone, signInToTenant, tenantOrigin } from './support/auth'
import { readE2EFixtureState, readE2EOnboardingFixtureState } from './support/fixture-state'

async function createMarkerDeal(page: Page, marker: string): Promise<string> {
  const result = await page.evaluate(async markerValue => {
    const form = new FormData()
    form.set('company_name', markerValue)
    form.set('founder_name', `Founder ${markerValue}`)
    form.set('founder_email', `${markerValue.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@example.invalid`)
    form.set('pitch', `${markerValue} is a uniquely tagged E2E isolation company.`)
    const response = await fetch('/api/deals/manual', { method: 'POST', body: form })
    return { status: response.status, body: await response.json() }
  }, marker)
  expect(result.status).toBe(200)
  expect(result.body.deal_id).toEqual(expect.any(String))
  return result.body.deal_id as string
}

test('a new account creates its Fund through onboarding and can re-enter the canonical workspace', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const onboarding = await readE2EOnboardingFixtureState()
  const platformOrigin = new URL(baseURL).origin
  const tenantUrl = new URL(baseURL)
  tenantUrl.hostname = `${onboarding.fundSlug}.localhost`
  const tenantOrigin = tenantUrl.origin

  await gotoAfterTimeZoneBootstrap(page, `${platformOrigin}/auth`)
  await page.locator('#email').fill(onboarding.email)
  await page.locator('#password').fill(onboarding.password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(url => url.origin === platformOrigin && url.pathname === '/onboarding')

  await expect(page.getByRole('heading', { name: 'Fund identity' })).toBeVisible()
  await page.locator('#fund-name').fill(onboarding.fundName)
  await page.locator('#fund-slug').fill(onboarding.fundSlug)
  await expect(page.getByText(`${onboarding.fundSlug}.localhost`, { exact: true })).toBeVisible()
  await seedE2ETimeZone(page, tenantOrigin)
  await page.getByRole('button', { name: 'Create Fund workspace' }).click()
  await page.waitForURL(url => url.origin === tenantOrigin && ['/auth', '/funds/setup'].includes(url.pathname))

  if (new URL(page.url()).pathname === '/auth') {
    await page.locator('#email').fill(onboarding.email)
    await page.locator('#password').fill(onboarding.password)
    await page.getByRole('button', { name: /^sign in$/i }).click()
  }
  await page.waitForURL(url => url.origin === tenantOrigin && url.pathname === '/funds/setup')
  await expect(page.getByText(onboarding.fundName, { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Setup checklist' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL(url => url.origin === tenantOrigin && url.pathname === '/auth')
  await page.locator('#email').fill(onboarding.email)
  await page.locator('#password').fill(onboarding.password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(url => url.origin === tenantOrigin && url.pathname === '/dashboard')
  await expect(page.getByText(onboarding.fundName, { exact: true }).first()).toBeVisible()
})

test('Fund owner signs in on the canonical tenant and reaches the dashboard', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')

  const origin = await signInToTenant(page, baseURL, primary)

  await expect(page).toHaveURL(`${origin}/dashboard`)
  await expect(page.getByText(primary.fundName, { exact: true }).first()).toBeVisible()
  await expect(page.locator('main')).toBeVisible()
})

test('a copied Fund A session is denied on Fund B pages and APIs', async ({ page, context, baseURL, browserFailureAllowances }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const secondary = await readE2EFixtureState('E2E_SECONDARY_FIXTURE_STATE')
  const primaryOrigin = await signInToTenant(page, baseURL, primary)
  const secondaryOrigin = tenantOrigin(baseURL, secondary)
  const secondaryHost = new URL(secondaryOrigin).hostname

  const sessionCookies = await context.cookies(primaryOrigin)
  await context.addCookies(sessionCookies.map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: secondaryHost,
    path: '/',
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  })))

  for (const pathname of ['/dashboard', '/favicon.ico', '/api/settings']) {
    browserFailureAllowances.allow({ kind: 'console', pathname, status: 404 })
  }

  const pageResponse = await page.goto(`${secondaryOrigin}/dashboard`)
  expect(pageResponse?.status()).toBe(404)
  await expect(page.getByText(primary.fundName, { exact: true })).toHaveCount(0)
  await expect(page.getByText(secondary.fundName, { exact: true })).toHaveCount(0)

  const apiResult = await page.evaluate(async () => {
    const response = await fetch('/api/settings')
    return { status: response.status, body: await response.text() }
  })
  expect(apiResult.status).toBe(404)
  expect(apiResult.body).not.toContain(primary.fundName)
  expect(apiResult.body).not.toContain(secondary.fundName)
})

test('independent Fund sessions cannot read or mutate each other\'s Deal resources', async ({ browser, baseURL, browserFailureAllowances }) => {
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
    await expect(primaryPage.getByText(primary.fundName, { exact: true }).first()).toBeVisible()
    await expect(secondaryPage.getByText(secondary.fundName, { exact: true }).first()).toBeVisible()

    const primaryMarker = `Fund A ${primary.suffix}`
    const secondaryMarker = `Fund B ${secondary.suffix}`
    const primaryDealId = await createMarkerDeal(primaryPage, primaryMarker)
    const secondaryDealId = await createMarkerDeal(secondaryPage, secondaryMarker)

    for (const pathname of [
      `/api/deals/${secondaryDealId}`,
      `/deals/${secondaryDealId}`,
      `/submit/${primary.submissionToken}`,
    ]) {
      browserFailureAllowances.allow({ kind: 'console', pathname, status: 404 })
    }

    const ownPrimary = await primaryPage.evaluate(async id => {
      const response = await fetch(`/api/deals/${id}`)
      return { status: response.status, body: await response.json() }
    }, primaryDealId)
    const ownSecondary = await secondaryPage.evaluate(async id => {
      const response = await fetch(`/api/deals/${id}`)
      return { status: response.status, body: await response.json() }
    }, secondaryDealId)
    expect(ownPrimary.status).toBe(200)
    expect(ownPrimary.body.deal.company_name).toBe(primaryMarker)
    expect(ownSecondary.status).toBe(200)
    expect(ownSecondary.body.deal.company_name).toBe(secondaryMarker)

    const crossRead = await primaryPage.evaluate(async id => {
      const response = await fetch(`/api/deals/${id}`)
      return { status: response.status, body: await response.text() }
    }, secondaryDealId)
    expect(crossRead.status).toBe(404)
    expect(crossRead.body).not.toContain(secondaryMarker)

    const crossMutation = await primaryPage.evaluate(async id => {
      const response = await fetch(`/api/deals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'passed' }),
      })
      return { status: response.status, body: await response.text() }
    }, secondaryDealId)
    expect(crossMutation.status).toBe(404)
    expect(crossMutation.body).not.toContain(secondaryMarker)

    const secondaryAfter = await secondaryPage.evaluate(async id => {
      const response = await fetch(`/api/deals/${id}`)
      return { status: response.status, body: await response.json() }
    }, secondaryDealId)
    expect(secondaryAfter.status).toBe(200)
    expect(secondaryAfter.body.deal.company_name).toBe(secondaryMarker)
    expect(secondaryAfter.body.deal.status).not.toBe('passed')

    const crossPage = await primaryPage.goto(`${tenantOrigin(baseURL, primary)}/deals/${secondaryDealId}`)
    expect(crossPage?.status()).toBe(404)
    await expect(primaryPage.getByText(secondaryMarker, { exact: true })).toHaveCount(0)

    const ownTokenPage = await primaryPage.goto(`${tenantOrigin(baseURL, primary)}/submit/${primary.submissionToken}`)
    expect(ownTokenPage?.status()).toBe(200)
    await expect(primaryPage.getByRole('heading', { name: `Submit a pitch to ${primary.fundName}` })).toBeVisible()
    const crossTokenPage = await secondaryPage.goto(`${tenantOrigin(baseURL, secondary)}/submit/${primary.submissionToken}`)
    expect(crossTokenPage?.status()).toBe(404)
    await expect(secondaryPage.getByText(primary.fundName, { exact: true })).toHaveCount(0)
  } finally {
    await primaryContext.close()
    await secondaryContext.close()
  }
})
