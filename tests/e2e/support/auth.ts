import type { Page } from '@playwright/test'
import type { E2ETenantUserState } from './fixture-state'

export function tenantOrigin(baseURL: string, state: E2ETenantUserState): string {
  const url = new URL(baseURL)
  url.hostname = `${state.fundSlug}.localhost`
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  return url.origin
}

export async function signInToTenant(
  page: Page,
  baseURL: string,
  state: E2ETenantUserState,
): Promise<string> {
  const origin = tenantOrigin(baseURL, state)
  await page.goto(`${origin}/auth`)
  await page.locator('#email').fill(state.email)
  await page.locator('#password').fill(state.password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(url => url.origin === origin && url.pathname === '/dashboard')
  return origin
}
