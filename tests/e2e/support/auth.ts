import type { Page, Response } from '@playwright/test'
import { serializeTimeZoneCookie, TIME_ZONE_COOKIE_NAME } from '../../../i18n/time-zone'
import type { E2ETenantUserState } from './fixture-state'

const E2E_TIME_ZONE = 'UTC'

export function tenantOrigin(baseURL: string, state: E2ETenantUserState): string {
  const url = new URL(baseURL)
  url.hostname = `${state.fundSlug}.localhost`
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  return url.origin
}

export async function seedE2ETimeZone(page: Page, url: string): Promise<void> {
  // Playwright fixes the browser timezone to UTC. Seed the matching production
  // cookie before the first request so SSR and hydration agree immediately and
  // the intentional bootstrap reload cannot race with form interactions.
  await page.context().addCookies([{
    name: TIME_ZONE_COOKIE_NAME,
    value: serializeTimeZoneCookie('auto', E2E_TIME_ZONE),
    url,
    httpOnly: true,
    sameSite: 'Lax',
  }])
}

export async function gotoAfterTimeZoneBootstrap(page: Page, url: string): Promise<Response | null> {
  await seedE2ETimeZone(page, url)
  return page.goto(url)
}

export async function signInToTenant(
  page: Page,
  baseURL: string,
  state: E2ETenantUserState,
): Promise<string> {
  const origin = tenantOrigin(baseURL, state)
  await gotoAfterTimeZoneBootstrap(page, `${origin}/auth`)
  await page.locator('#email').fill(state.email)
  await page.locator('#password').fill(state.password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(url => url.origin === origin && url.pathname === '/dashboard')
  return origin
}
