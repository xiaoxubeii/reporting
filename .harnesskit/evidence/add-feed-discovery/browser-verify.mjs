import assert from 'node:assert/strict'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from '/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs'

const appUrl = 'http://localhost:3210'
const evidenceDir = path.resolve('.harnesskit/evidence/add-feed-discovery')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const cookieName = process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME

assert.ok(supabaseUrl && anonKey && serviceKey && cookieName, 'Browser verification environment is incomplete')

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const verifier = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'test@example.com' })
assert.ifError(link.error)
assert.ok(link.data.properties.hashed_token, 'Magic-link hash is missing')
const verified = await verifier.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: 'magiclink',
})
assert.ifError(verified.error)
assert.ok(verified.data.session, 'Browser verification session is missing')

const serializedCookies = []
const serverClient = createServerClient(supabaseUrl, anonKey, {
  cookieOptions: { name: cookieName, path: '/', sameSite: 'lax', secure: false },
  cookies: {
    getAll: () => [],
    setAll: values => serializedCookies.push(...values),
  },
})
const setSession = await serverClient.auth.setSession({
  access_token: verified.data.session.access_token,
  refresh_token: verified.data.session.refresh_token,
})
assert.ifError(setSession.error)

const expires = Math.floor(Date.now() / 1000) + 3600
const storageState = {
  cookies: serializedCookies.filter(cookie => cookie.value).map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: 'localhost',
    path: '/',
    expires,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  })),
  origins: [],
}

const source = {
  entryId: 101,
  title: 'Clinical AI copilots move into specialty workflows',
  url: 'https://news.example/clinical-ai',
  sourceTitle: 'HealthTech Wire',
  publishedAt: '2026-07-25T17:00:00.000Z',
}
const article = {
  id: 'explore-entry-1',
  title: 'Acme Health opens its clinical automation platform',
  summary: 'Acme Health helps specialty teams automate clinical operations.',
  contentText: 'Acme Health announced a new workflow platform for specialty clinics.',
  imageUrl: null,
  publishedAt: '2026-07-25T17:00:00.000Z',
  originalUrl: 'https://news.example/acme-health',
  author: 'HealthTech Wire',
  readingTimeMinutes: 3,
  source: { id: 'source-1', title: 'HealthTech Wire', siteUrl: 'https://news.example' },
  category: { id: 'category-1', title: 'Digital Health' },
}

let discoveryState = 'normal'
const consoleErrors = []
const pageErrors = []
const failedRequests = []
const httpErrors = []
const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
})

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, storageState })
  await context.route('**/api/feeds/explore/discovery**', async route => {
    const kind = new URL(route.request().url()).searchParams.get('kind')
    if (discoveryState === 'error') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'upstream', message: 'fixture unavailable', retryable: true } }) })
      return
    }
    const items = discoveryState === 'empty' ? [] : kind === 'deal_signal' ? [{
      kind: 'deal_signal',
      id: '00000000-0000-4000-8000-000000000002',
      companyName: 'Acme Health',
      companyDomain: 'acme.health',
      stage: 'Seed',
      amount: '$4M',
      eventDate: '2026-07-25',
      confidence: 0.91,
      evidence: ['<script>window.__feedDiscoveryXss = true</script> The company is actively raising a $4M seed round.'],
      sources: [source],
      generatedAt: '2026-07-25T18:00:00.000Z',
      existingDealId: null,
    }] : [{
      kind: 'trending',
      id: '00000000-0000-4000-8000-000000000001',
      label: 'AI-native clinical workflows',
      summary: 'Five recent articles from three independent sources show accelerating activity.',
      score: 84,
      metrics: { articleCount: 5, sourceCount: 3, priorArticleCount: 2, growth: 1.5, freshness: 0.91, currentWindowHours: 24, baselineWindowDays: 7 },
      sources: [source],
      generatedAt: '2026-07-25T18:00:00.000Z',
    }]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { items, generationId: '00000000-0000-4000-8000-000000000010', generatedAt: '2026-07-25T18:00:00.000Z', isStale: kind === 'trending', total: items.length, limit: 20, offset: 0 } }),
    })
  })
  await context.route('**/api/feeds/explore/categories', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { categories: [{ id: 'category-1', title: 'Digital Health', sourceCount: 1, featuredSource: article.source }] } }) }))
  await context.route('**/api/feeds/explore/following', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { sourceIds: [] } }) }))
  await context.route('**/api/feeds/explore/entries/explore-entry-1', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { entry: article } }) }))
  await context.route('**/api/feeds/explore/entries?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { items: [article], total: 1, nextOffset: null } }) }))
  await context.route('**/api/deals/manual', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deal_id: 'browser-proof-deal' }) }))
  await context.route('**/api/accounting/vehicle-index', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))

  const page = await context.newPage()
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`))
  page.on('response', response => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`) })

  await page.goto(`${appUrl}/feeds?view=explore&exploreView=trending`)
  await page.getByText('AI-native clinical workflows').waitFor()
  await page.getByRole('status').getByText(/last known good/i).waitFor()
  assert.equal(await page.getByText('5', { exact: true }).count(), 1)
  assert.equal(await page.getByText('3', { exact: true }).count(), 1)
  await page.screenshot({ path: path.join(evidenceDir, 'trending-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: /view sources/i }).click()
  await page.getByRole('dialog').getByText(source.title).waitFor()
  await page.keyboard.press('Escape')

  await page.goto(`${appUrl}/feeds?view=explore&exploreView=deal_signal`)
  await page.getByText('Acme Health').waitFor()
  assert.equal(await page.evaluate(() => window.__feedDiscoveryXss), undefined)
  await page.screenshot({ path: path.join(evidenceDir, 'deal-signals-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: /create deal/i }).click()
  const dealDialog = page.getByRole('dialog', { name: /new deal/i })
  await dealDialog.waitFor()
  assert.equal(await dealDialog.getByLabel(/company name/i).inputValue(), 'Acme Health')
  assert.equal(await dealDialog.getByLabel(/company url/i).inputValue(), 'https://acme.health/')
  assert.match(await dealDialog.getByLabel(/pitch.*description/i).inputValue(), /actively raising/)
  await dealDialog.getByLabel(/founder name/i).fill('Browser Proof Founder')
  await dealDialog.getByLabel(/founder email/i).fill('proof@example.com')
  await page.screenshot({ path: path.join(evidenceDir, 'deal-signal-prefill.png'), fullPage: true })
  await dealDialog.getByRole('button', { name: /create deal/i }).click()
  await page.waitForURL('**/deals/browser-proof-deal')

  await page.goto(`${appUrl}/feeds?view=explore`)
  await page.getByRole('button', { name: article.title }).click()
  await page.getByRole('heading', { name: article.title, level: 1 }).waitFor()
  await page.getByRole('button', { name: /create deal/i }).click()
  const articleDialog = page.getByRole('dialog', { name: /new deal/i })
  await articleDialog.waitFor()
  assert.equal(await articleDialog.getByLabel(/company name/i).inputValue(), '')
  const articlePitch = await articleDialog.getByLabel(/pitch.*description/i).inputValue()
  assert.match(articlePitch, /Source title: Acme Health opens its clinical automation platform/)
  assert.match(articlePitch, /Source link: https:\/\/news\.example\/acme-health/)
  await page.screenshot({ path: path.join(evidenceDir, 'article-prefill-desktop.png'), fullPage: true })
  await page.keyboard.press('Escape')

  discoveryState = 'empty'
  await page.goto(`${appUrl}/feeds?view=explore&exploreView=trending&proof=empty`)
  await page.getByRole('heading', { name: /no topics are trending yet/i }).waitFor()
  discoveryState = 'error'
  await page.goto(`${appUrl}/feeds?view=explore&exploreView=trending&proof=error`)
  await page.getByRole('heading', { name: /could not be loaded/i }).waitFor()

  discoveryState = 'normal'
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${appUrl}/feeds?view=explore&exploreView=deal_signal&proof=mobile`)
  await page.getByText('Acme Health').waitFor()
  await page.screenshot({ path: path.join(evidenceDir, 'deal-signals-mobile.png'), fullPage: true })

  const unexpectedFailedRequests = failedRequests.filter(request =>
    !request.includes('https://va.vercel-scripts.com/')
      && !(request.includes('http://localhost:3210/') && request.includes('net::ERR_ABORTED')),
  )
  const unexpectedHttpErrors = httpErrors.filter(response =>
    !response.includes('/api/feeds/explore/discovery?kind=trending')
      && !response.includes('/deals/browser-proof-deal'),
  )
  const unexpectedConsoleErrors = consoleErrors.filter(message =>
    !message.includes('https://va.vercel-scripts.com/')
      && !message.includes('Failed to load resource:')
      && !message.includes('[i18n] ENVIRONMENT_FALLBACK'),
  )
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(unexpectedFailedRequests, [])
  assert.deepEqual(unexpectedHttpErrors, [])
  assert.deepEqual(unexpectedConsoleErrors, [])
  console.log(JSON.stringify({
    authenticated: true,
    flows: ['trending', 'deal_signal', 'signal_prefill_submit', 'article_prefill', 'empty', 'error', 'mobile'],
    screenshots: ['trending-desktop.png', 'deal-signals-desktop.png', 'deal-signal-prefill.png', 'article-prefill-desktop.png', 'deal-signals-mobile.png'],
    unexpectedConsoleErrors: unexpectedConsoleErrors.length,
    pageErrors: pageErrors.length,
    unexpectedFailedRequests: unexpectedFailedRequests.length,
    unexpectedHttpErrors: unexpectedHttpErrors.length,
  }))
} finally {
  await browser.close()
  await admin.auth.admin.signOut(verified.data.session.access_token, 'global')
}
