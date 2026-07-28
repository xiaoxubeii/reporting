import type { APIResponse, Page } from '@playwright/test'

import { test, expect } from './support/observed-test'
import { tenantOrigin } from './support/auth'
import { readE2EFixtureState, type E2EFixtureState } from './support/fixture-state'

const JSON_HEADERS = Object.freeze({ 'Content-Type': 'application/json' })
const MALICIOUS_ORIGIN_HEADERS = Object.freeze({
  ...JSON_HEADERS,
  Origin: 'https://evil.example',
  'Sec-Fetch-Site': 'cross-site',
})

function fundMarkers(...fixtures: readonly E2EFixtureState[]): readonly string[] {
  return fixtures.flatMap(fixture => [
    fixture.fundId,
    fixture.fundName,
    fixture.fundSlug,
    fixture.suffix,
  ])
}

async function responseTextWithoutMarkers(
  response: APIResponse,
  expectedStatus: number,
  markers: readonly string[],
): Promise<string> {
  expect(response.status()).toBe(expectedStatus)
  const body = await response.text()
  for (const marker of markers) expect(body).not.toContain(marker)
  return body
}

function sameOriginJsonHeaders(origin: string): Readonly<Record<string, string>> {
  return Object.freeze({
    ...JSON_HEADERS,
    Origin: origin,
    'Sec-Fetch-Site': 'same-origin',
  })
}

function expectUnauthorizedEnvelope(body: string): void {
  const parsed = JSON.parse(body) as { error?: unknown }
  const message = typeof parsed.error === 'string'
    ? parsed.error
    : parsed.error && typeof parsed.error === 'object'
      ? (parsed.error as { message?: unknown }).message
      : null
  expect(message).toEqual(expect.any(String))
  expect(message).toMatch(/unauthorized|authentication is required/i)
}

async function signInWithoutEnteringApp(
  page: Page,
  baseURL: string,
  fixture: E2EFixtureState,
): Promise<string> {
  const origin = tenantOrigin(baseURL, fixture)
  await page.goto(`${origin}/auth?next=${encodeURIComponent('/auth')}`)
  await page.locator('#email').fill(fixture.email)
  await page.locator('#password').fill(fixture.password)
  const authResponsePromise = page.waitForResponse(response => (
    response.url().includes('/_supabase/auth/v1/token')
      && response.request().method() === 'POST'
  ))
  await page.getByRole('button', { name: /^sign in$/i }).click()
  expect((await authResponsePromise).status()).toBe(200)
  await page.waitForURL(url => url.origin === origin && url.pathname === '/auth' && url.search === '')
  return origin
}

test('anonymous callers receive 401 from the primary protected API surfaces without Fund disclosure', async ({ request, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const [primary, secondary] = await Promise.all([
    readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE'),
    readE2EFixtureState('E2E_SECONDARY_FIXTURE_STATE'),
  ])
  const origin = tenantOrigin(baseURL, primary)
  const markers = fundMarkers(primary, secondary)
  const protectedGetRoutes = [
    '/api/companies',
    '/api/deals',
    '/api/diligence',
    '/api/emails',
    '/api/experts',
    '/api/feeds/connection',
    '/api/lps/investors',
    '/api/settings',
    '/api/settings/notifications',
    '/api/accounting/status',
  ] as const

  for (const route of protectedGetRoutes) {
    await test.step(`GET ${route}`, async () => {
      const response = await request.get(`${origin}${route}`)
      const body = await responseTextWithoutMarkers(response, 401, markers)
      expect(response.headers()['content-type']).toContain('application/json')
      expectUnauthorizedEnvelope(body)
    })
  }

  await test.step('POST /api/search', async () => {
    const response = await request.post(`${origin}/api/search`, {
      headers: sameOriginJsonHeaders(origin),
      data: JSON.stringify({ query: 'cardiovascular evidence', categoryIds: ['internet'] }),
    })
    const body = await responseTextWithoutMarkers(response, 401, markers)
    expect(JSON.parse(body)).toMatchObject({
      success: false,
      data: null,
      error: { code: 'unauthorized', retryable: false },
    })
  })
})

test('authenticated mutation APIs reject hostile origins and malformed request bodies before changing state', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const [primary, secondary] = await Promise.all([
    readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE'),
    readE2EFixtureState('E2E_SECONDARY_FIXTURE_STATE'),
  ])
  const origin = await signInWithoutEnteringApp(page, baseURL, primary)
  const markers = fundMarkers(primary, secondary)

  const hostileSearch = await page.request.post(`${origin}/api/search`, {
    headers: MALICIOUS_ORIGIN_HEADERS,
    data: JSON.stringify({ query: 'cardiovascular evidence', categoryIds: ['internet'] }),
  })
  const hostileSearchBody = await responseTextWithoutMarkers(hostileSearch, 403, markers)
  expect(JSON.parse(hostileSearchBody)).toMatchObject({
    success: false,
    data: null,
    error: { code: 'forbidden', retryable: false },
  })

  const hostilePublicSiteWrite = await page.request.patch(`${origin}/api/settings/public-site`, {
    headers: MALICIOUS_ORIGIN_HEADERS,
    data: JSON.stringify({}),
  })
  const hostilePublicSiteBody = await responseTextWithoutMarkers(hostilePublicSiteWrite, 403, markers)
  expect(JSON.parse(hostilePublicSiteBody)).toEqual({ error: 'Cross-origin changes are not allowed.' })

  const malformedCases = [
    {
      label: 'wrong Content-Type',
      headers: { ...sameOriginJsonHeaders(origin), 'Content-Type': 'text/plain' },
      body: '{}',
      expectedStatus: 415,
    },
    {
      label: 'malformed JSON',
      headers: sameOriginJsonHeaders(origin),
      body: '{"query":',
      expectedStatus: 400,
    },
    {
      label: 'invalid schema',
      headers: sameOriginJsonHeaders(origin),
      body: JSON.stringify({ query: '', categoryIds: [] }),
      expectedStatus: 400,
    },
  ] as const

  for (const malformed of malformedCases) {
    await test.step(malformed.label, async () => {
      const response = await page.request.post(`${origin}/api/search`, {
        headers: malformed.headers,
        data: malformed.body,
      })
      const body = await responseTextWithoutMarkers(response, malformed.expectedStatus, markers)
      expect(JSON.parse(body)).toMatchObject({
        success: false,
        data: null,
        error: { code: 'invalid_request', retryable: false },
      })
    })
  }

  const invalidBearer = await page.request.post(`${origin}/api/search`, {
    headers: { ...JSON_HEADERS, Authorization: 'Bearer invalid.token.value' },
    data: JSON.stringify({ query: 'cardiovascular evidence', toolCallId: 'e2e-invalid-token' }),
  })
  const invalidBearerBody = await responseTextWithoutMarkers(invalidBearer, 404, markers)
  expect(JSON.parse(invalidBearerBody)).toEqual({ error: 'Not found' })

  const platformOrigin = new URL(baseURL).origin
  const invalidBackgroundBearer = await page.request.post(`${platformOrigin}/api/search`, {
    headers: { ...JSON_HEADERS, Authorization: 'Bearer invalid.token.value' },
    data: JSON.stringify({ query: 'cardiovascular evidence', toolCallId: 'e2e-invalid-token' }),
  })
  const invalidBackgroundBearerBody = await responseTextWithoutMarkers(invalidBackgroundBearer, 401, markers)
  expect(JSON.parse(invalidBackgroundBearerBody)).toMatchObject({
    success: false,
    data: null,
    error: { code: 'unauthorized', message: 'Authentication is required.', retryable: false },
  })
})

test('invalid public tokens fail uniformly across Fund hosts without revealing tenant identity', async ({ request, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const [primary, secondary] = await Promise.all([
    readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE'),
    readE2EFixtureState('E2E_SECONDARY_FIXTURE_STATE'),
  ])
  const primaryOrigin = tenantOrigin(baseURL, primary)
  const secondaryOrigin = tenantOrigin(baseURL, secondary)
  const markers = fundMarkers(primary, secondary)
  const unknownToken = `${primary.suffix.replace(/[^A-Za-z0-9_-]/g, '_')}${'A'.repeat(43)}`.slice(0, 43)
  const testIp = `198.51.100.${(Number.parseInt(primary.suffix.slice(-2), 16) % 200) + 20}`
  const expectedExpertFailure = { error: 'This invitation is invalid or no longer available.' }

  const expertAttempts = [
    {
      label: 'malformed resolve token',
      origin: primaryOrigin,
      route: '/api/public/expert-response/resolve',
      headers: JSON_HEADERS,
      body: JSON.stringify({ token: 'invalid' }),
    },
    {
      label: 'unknown resolve token on primary Fund',
      origin: primaryOrigin,
      route: '/api/public/expert-response/resolve',
      headers: JSON_HEADERS,
      body: JSON.stringify({ token: unknownToken }),
    },
    {
      label: 'unknown resolve token on secondary Fund',
      origin: secondaryOrigin,
      route: '/api/public/expert-response/resolve',
      headers: JSON_HEADERS,
      body: JSON.stringify({ token: unknownToken }),
    },
    {
      label: 'unknown submit token',
      origin: primaryOrigin,
      route: '/api/public/expert-response/submit',
      headers: JSON_HEADERS,
      body: JSON.stringify({ token: unknownToken, response_markdown: 'No invitation exists.' }),
    },
    {
      label: 'wrong Content-Type',
      origin: primaryOrigin,
      route: '/api/public/expert-response/resolve',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ token: unknownToken }),
    },
    {
      label: 'malformed JSON',
      origin: primaryOrigin,
      route: '/api/public/expert-response/resolve',
      headers: JSON_HEADERS,
      body: '{"token":',
    },
  ] as const

  const expertFailureSignatures = new Set<string>()
  for (const attempt of expertAttempts) {
    await test.step(attempt.label, async () => {
      const response = await request.post(`${attempt.origin}${attempt.route}`, {
        headers: { ...attempt.headers, 'X-Real-IP': testIp },
        data: attempt.body,
      })
      const body = await responseTextWithoutMarkers(response, 404, markers)
      expect(JSON.parse(body)).toEqual(expectedExpertFailure)
      expect(response.headers()['cache-control']).toContain('no-store')
      expect(response.headers()['referrer-policy']).toContain('no-referrer')
      expertFailureSignatures.add(`${response.status()}:${body}`)
    })
  }
  expect(expertFailureSignatures.size).toBe(1)

})
