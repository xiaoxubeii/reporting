import { createAdminClient } from '@/lib/supabase/admin'
import { test, expect } from './support/observed-test'
import { signInToTenant } from './support/auth'
import { readE2EMemberFixtureState } from './support/fixture-state'

async function submitManualDeal(origin: string, page: Parameters<typeof signInToTenant>[0], companyName: string) {
  return page.evaluate(async ({ targetOrigin, name }) => {
    const form = new FormData()
    form.set('company_name', name)
    form.set('founder_name', 'Role Matrix Founder')
    form.set('founder_email', 'role-matrix@example.invalid')
    form.set('pitch', 'A role-based access control E2E marker.')
    const response = await fetch(`${targetOrigin}/api/deals/manual`, { method: 'POST', body: form })
    return { status: response.status, body: await response.text() }
  }, { targetOrigin: origin, name: companyName })
}

test('member explicit write grant permits Deal creation but not administration', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const member = await readE2EMemberFixtureState('E2E_MEMBER_FIXTURE_STATE')
  const origin = await signInToTenant(page, baseURL, member)

  const response = await page.goto(`${origin}/deals`, { waitUntil: 'domcontentloaded' })
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('link', { name: /deals/i })).toBeVisible()

  const companyName = `Member Grant ${member.suffix}`
  const created = await submitManualDeal(origin, page, companyName)
  expect(created.status, created.body).toBe(200)

  const adminResponse = await page.request.get(`${origin}/api/settings/access`, { failOnStatusCode: false })
  expect(adminResponse.status()).toBe(403)
})

test('viewer may read Deals but cannot mutate them through a direct API request', async ({ page, baseURL, browserFailureAllowances }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const viewer = await readE2EMemberFixtureState('E2E_VIEWER_FIXTURE_STATE')
  const origin = await signInToTenant(page, baseURL, viewer)
  const response = await page.goto(`${origin}/deals`, { waitUntil: 'domcontentloaded' })
  expect(response?.status()).toBe(200)

  const companyName = `Viewer Denied ${viewer.suffix}`
  browserFailureAllowances.allow({ kind: 'console', pathname: '/api/deals/manual', status: 403 })
  const denied = await submitManualDeal(origin, page, companyName)
  expect(denied.status, denied.body).toBe(403)

  const admin = createAdminClient()
  const persisted = await admin.from('inbound_deals').select('id', { count: 'exact', head: true })
    .eq('fund_id', viewer.fundId)
    .eq('company_name', companyName)
  expect(persisted.error).toBeNull()
  expect(persisted.count).toBe(0)
})
