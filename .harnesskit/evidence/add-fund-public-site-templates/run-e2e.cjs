const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { chromium } = require('/home/ubuntu/.npm/_npx/9833c18b2d85bc59/node_modules/playwright')

const evidenceDir = __dirname
const results = []
const diagnostics = { consoleErrors: [], pageErrors: [], unexpectedResponses: [], expectedResponses: [] }
const created = { users: [], funds: [] }
let browser
let admin

function record(name, status, details = '') {
  results.push({ name, status, details })
  console.log(`${status === 'passed' ? 'PASS' : 'FAIL'} ${name}${details ? ` — ${details}` : ''}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function procEnv(pid) {
  const raw = fs.readFileSync(`/proc/${pid}/environ`)
  return Object.fromEntries(raw.toString().split('\0').filter(Boolean).map(value => {
    const separator = value.indexOf('=')
    return [value.slice(0, separator), value.slice(separator + 1)]
  }))
}

function attachDiagnostics(page, label) {
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.consoleErrors.push({ label, url: page.url(), text: message.text() })
  })
  page.on('pageerror', error => diagnostics.pageErrors.push({ label, url: page.url(), text: error.message }))
  page.on('response', response => {
    if (response.status() < 400) return
    const item = { label, status: response.status(), url: response.url() }
    if (response.url().includes('/settings/public-site') && response.status() === 404 && label === 'cross-host') {
      diagnostics.expectedResponses.push(item)
    } else if (!/favicon|icon\?/.test(response.url())) {
      diagnostics.unexpectedResponses.push(item)
    }
  })
}

async function newContext(label, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, locale: 'en-US' })
  await context.route('**/*', route => {
    let hostname = ''
    try { hostname = new URL(route.request().url()).hostname } catch {}
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.localhost')) {
      return route.continue()
    }
    return route.abort('blockedbyclient')
  })
  const page = await context.newPage()
  attachDiagnostics(page, label)
  return { context, page }
}

async function login(page, origin, email, password) {
  await page.goto(`${origin}/auth?next=${encodeURIComponent('/settings')}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  const tokenResponsePromise = page.waitForResponse(response => response.url().includes('/auth/v1/token'), { timeout: 15000 }).catch(() => null)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const tokenResponse = await tokenResponsePromise
  if (!tokenResponse) throw new Error(`login did not issue a password-token request from ${page.url()}`)
  if (!tokenResponse.ok()) throw new Error(`password-token request failed with ${tokenResponse.status()}: ${(await tokenResponse.text()).slice(0, 300)}`)
  await page.waitForURL(url => url.origin === origin && url.pathname === '/settings', { timeout: 30000 }).catch(async error => {
    const alert = await page.getByRole('alert').allTextContents().catch(() => [])
    throw new Error(`${error.message}; current=${page.url()}; alerts=${JSON.stringify(alert)}`)
  })
  await page.waitForLoadState('networkidle')
}

async function openPublicEditor(page, origin) {
  await page.goto(`${origin}/settings`, { waitUntil: 'domcontentloaded' })
  const link = page.locator('a[href="/settings/public-site"]').first()
  await link.waitFor({ state: 'visible', timeout: 20000 })
  await link.click()
  await page.waitForURL(`${origin}/settings/public-site`, { timeout: 20000 })
  await page.getByRole('heading', { name: 'Public site', exact: true }).waitFor({ timeout: 30000 })
  await page.getByRole('radio').first().waitFor({ timeout: 30000 })
}

function field(page, name) {
  return page.locator('label').filter({ hasText: name }).first().locator('..').locator('input, textarea').first()
}

async function save(page) {
  const responsePromise = page.waitForResponse(response =>
    response.url().endsWith('/api/settings/public-site') && response.request().method() === 'PATCH',
    { timeout: 20000 },
  )
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  const response = await responsePromise
  if (!response.ok()) throw new Error(`save draft failed with ${response.status()}: ${(await response.text()).slice(0, 500)}`)
  await page.getByRole('status').filter({ hasText: 'Draft saved.' }).waitFor({ timeout: 20000 })
}

async function setTemplateAndSave(page, name) {
  await page.getByRole('radio', { name: new RegExp(name, 'i') }).click()
  await save(page)
}

async function confirmAction(page, buttonName, dialogTitle) {
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: dialogTitle }).waitFor({ timeout: 10000 })
  await dialog.getByRole('button', { name: buttonName, exact: true }).click()
}

async function changeLocale(page, currentLabel, optionName, expectedTitle) {
  const responsePromise = page.waitForResponse(response =>
    response.url().endsWith('/api/locale') && response.request().method() === 'POST',
    { timeout: 20000 },
  )
  await page.getByRole('combobox', { name: currentLabel, exact: true }).click()
  await page.getByRole('option', { name: optionName, exact: true }).click()
  const response = await responsePromise
  if (!response.ok()) throw new Error(`locale UI request failed with ${response.status()}: ${(await response.text()).slice(0, 500)}`)
  await page.getByRole('heading', { name: expectedTitle, exact: true }).waitFor({ timeout: 20000 })
}

async function configureFund(page, titles, finalTemplate) {
  const radios = page.getByRole('radio')
  assert(await radios.count() === 3, 'expected exactly 3 template radios')
  const names = await radios.allTextContents()
  assert(names.some(value => /Focus/.test(value)) && names.some(value => /Institutional/.test(value)) && names.some(value => /Minimal/.test(value)), 'template names missing')
  await field(page, 'Headline').fill(titles.en)
  await page.getByRole('button', { name: '简体中文', exact: true }).click()
  await field(page, 'Headline').fill(titles.zh)
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await save(page)
  for (const name of ['Institutional', 'Minimal']) {
    await setTemplateAndSave(page, name)
    assert(await field(page, 'Headline').inputValue() === titles.en, `content changed after ${name} template switch`)
  }
  if (finalTemplate !== 'Minimal') await setTemplateAndSave(page, finalTemplate)
}

async function main() {
  const env = procEnv(process.env.TARGET_WEB_PID)
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  assert(supabaseUrl && serviceKey, 'web process lacks Supabase admin environment')
  const dbHost = new URL(supabaseUrl).hostname
  assert(['localhost', '127.0.0.1', '::1'].includes(dbHost), `refusing to mutate non-local Supabase host ${dbHost}`)
  const { createClient } = require('@supabase/supabase-js')
  admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`
  const fixtures = [
    { key: 'alpha', name: `E2E Alpha ${suffix}`, slug: `e2e-alpha-${suffix}`, email: `e2e-alpha-${suffix}@example.invalid`, password: `E2E-${crypto.randomUUID()}!`, titles: { en: `Alpha public ${suffix}`, zh: `阿尔法基金 ${suffix}` } },
    { key: 'beta', name: `E2E Beta ${suffix}`, slug: `e2e-beta-${suffix}`, email: `e2e-beta-${suffix}@example.invalid`, password: `E2E-${crypto.randomUUID()}!`, titles: { en: `Beta public ${suffix}`, zh: `贝塔基金 ${suffix}` } },
  ]
  for (const fixture of fixtures) {
    const user = await admin.auth.admin.createUser({ email: fixture.email, password: fixture.password, email_confirm: true })
    if (user.error || !user.data.user) throw new Error(`create ${fixture.key} user: ${user.error?.message}`)
    fixture.userId = user.data.user.id
    created.users.push(fixture.userId)
    const fund = await admin.from('funds').insert({ name: fixture.name, slug: fixture.slug, created_by: fixture.userId }).select('id,slug').single()
    if (fund.error || !fund.data) throw new Error(`create ${fixture.key} fund: ${fund.error?.message}`)
    fixture.fundId = fund.data.id
    created.funds.push(fixture.fundId)
    const membership = await admin.from('fund_members').upsert(
      { fund_id: fixture.fundId, user_id: fixture.userId, role: 'admin' },
      { onConflict: 'fund_id,user_id' },
    )
    if (membership.error) throw new Error(`create ${fixture.key} membership: ${membership.error.message}`)
    fixture.origin = `http://${fixture.slug}.localhost:5040`
  }
  const [alpha, beta] = fixtures
  browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] })

  const platform = await newContext('platform')
  await platform.page.goto('http://localhost:5040/', { waitUntil: 'networkidle' })
  assert(await platform.page.locator('[data-template]').count() === 0, 'platform root rendered a Fund template')
  assert(await platform.page.locator('h1').count() > 0, 'platform root lacks marketing heading')
  await platform.page.screenshot({ path: path.join(evidenceDir, '01-platform-root.png'), fullPage: true })
  record('platform root remains product marketing', 'passed')
  await platform.context.close()

  const anon = await newContext('anonymous')
  await anon.page.goto(`${alpha.origin}/`, { waitUntil: 'networkidle' })
  assert(await anon.page.locator('[data-public-site-state="private"]').count() === 1, 'alpha unpublished root not private')
  assert((await anon.page.textContent('body')).includes(alpha.name), 'alpha private root missing branding')
  await anon.page.screenshot({ path: path.join(evidenceDir, '02-alpha-private.png'), fullPage: true })
  await anon.page.goto(`${beta.origin}/`, { waitUntil: 'networkidle' })
  assert(await anon.page.locator('[data-public-site-state="private"]').count() === 1, 'beta unpublished root not private')
  record('unpublished Fund hosts show private state', 'passed')

  const alphaAdmin = await newContext('alpha-admin')
  await login(alphaAdmin.page, alpha.origin, alpha.email, alpha.password)
  await openPublicEditor(alphaAdmin.page, alpha.origin)
  await configureFund(alphaAdmin.page, alpha.titles, 'Focus')
  record('settings exposes exactly three templates and preserves shared content', 'passed')
  await alphaAdmin.page.getByRole('button', { name: 'Preview', exact: true }).click()
  const previewIframe = alphaAdmin.page.locator('iframe[title="Saved draft preview"]')
  const previewFrame = alphaAdmin.page.frameLocator('iframe[title="Saved draft preview"]')
  await previewFrame.locator('[data-template="focus"]').waitFor({ timeout: 20000 })
  assert((await previewFrame.locator('[data-template="focus"]').textContent()).includes(alpha.titles.en), 'focus preview lost English title')
  await alphaAdmin.page.screenshot({ path: path.join(evidenceDir, '03-alpha-focus-preview-desktop.png'), fullPage: true })
  const previewSection = alphaAdmin.page.locator('section').filter({ hasText: 'Saved draft preview' }).first()
  const deviceButtons = previewSection.locator('button[aria-pressed]')
  assert(await deviceButtons.count() === 2, 'desktop/mobile preview controls missing')
  await alphaAdmin.page.getByRole('button', { name: 'Mobile preview', exact: true }).click()
  await alphaAdmin.page.waitForFunction(() => {
    const iframe = document.querySelector('iframe[title="Saved draft preview"]')
    return iframe && iframe.getBoundingClientRect().width <= 392
  }, undefined, { timeout: 5000 })
  const box = await previewIframe.boundingBox()
  assert(box && box.width <= 392, `mobile preview width expected <=392, got ${box?.width}`)
  await alphaAdmin.page.screenshot({ path: path.join(evidenceDir, '04-alpha-focus-preview-mobile.png'), fullPage: true })
  record('saved draft preview works on desktop and mobile', 'passed', `mobile width ${Math.round(box.width)}px`)
  await alphaAdmin.page.getByRole('button', { name: 'Close preview', exact: true }).click()
  await confirmAction(alphaAdmin.page, 'Publish', 'Publish this Fund site?')
  await alphaAdmin.page.getByRole('status').filter({ hasText: /Version \d+ is live\./ }).waitFor({ timeout: 20000 })
  record('explicit publish completes', 'passed')

  await anon.page.goto(`${alpha.origin}/`, { waitUntil: 'networkidle' })
  assert(await anon.page.locator('[data-template="focus"]').count() === 1, 'live alpha is not focus template')
  assert((await anon.page.textContent('body')).includes(alpha.titles.en), 'live alpha missing published English title')
  await anon.page.screenshot({ path: path.join(evidenceDir, '05-alpha-live-en.png'), fullPage: true })
  record('published snapshot is live on alpha host', 'passed')
  await changeLocale(anon.page, 'Language: English', '简体中文', alpha.titles.zh)
  assert((await anon.page.textContent('body')).includes(alpha.titles.zh), 'live alpha missing Chinese title after locale preference')
  await anon.page.screenshot({ path: path.join(evidenceDir, '06-alpha-live-zh.png'), fullPage: true })
  record('public Fund language control switches published content', 'passed', 'English → 简体中文')
  await changeLocale(anon.page, '语言：简体中文', 'English', alpha.titles.en)

  const betaAdmin = await newContext('beta-admin')
  await login(betaAdmin.page, beta.origin, beta.email, beta.password)
  await openPublicEditor(betaAdmin.page, beta.origin)
  await configureFund(betaAdmin.page, beta.titles, 'Institutional')
  await confirmAction(betaAdmin.page, 'Publish', 'Publish this Fund site?')
  await betaAdmin.page.getByRole('status').filter({ hasText: /Version \d+ is live\./ }).waitFor({ timeout: 20000 })
  await anon.page.goto(`${beta.origin}/`, { waitUntil: 'networkidle' })
  const betaBody = await anon.page.textContent('body')
  assert(await anon.page.locator('[data-template="institutional"]').count() === 1, 'live beta is not institutional')
  assert(betaBody.includes(beta.titles.en), 'beta title missing')
  assert(!betaBody.includes(alpha.titles.en) && !betaBody.includes(alpha.titles.zh), 'alpha content leaked into beta')
  await anon.page.screenshot({ path: path.join(evidenceDir, '07-beta-live-isolated.png'), fullPage: true })
  await anon.page.goto(`${alpha.origin}/`, { waitUntil: 'networkidle' })
  const alphaBody = await anon.page.textContent('body')
  assert(alphaBody.includes(alpha.titles.en) && !alphaBody.includes(beta.titles.en), 'beta content leaked into alpha')
  record('two published Funds remain isolated', 'passed')

  const alphaCookies = await alphaAdmin.context.cookies(alpha.origin)
  const cross = await newContext('cross-host')
  await cross.context.addCookies(alphaCookies.map(cookie => ({ name: cookie.name, value: cookie.value, url: `${beta.origin}/`, httpOnly: cookie.httpOnly, secure: false, sameSite: cookie.sameSite, expires: cookie.expires })))
  const crossResponse = await cross.page.goto(`${beta.origin}/settings/public-site`, { waitUntil: 'domcontentloaded' })
  assert(crossResponse && crossResponse.status() === 404, `cross-Fund copied session expected 404, got ${crossResponse?.status()}`)
  await cross.page.screenshot({ path: path.join(evidenceDir, '08-cross-fund-session-denied.png'), fullPage: true })
  record('cross-Fund admin session is denied by Host/Fund binding', 'passed', '404')
  await cross.context.close()

  await alphaAdmin.page.goto(`${alpha.origin}/settings/public-site`, { waitUntil: 'networkidle' })
  await alphaAdmin.page.getByRole('heading', { name: 'Public site', exact: true }).waitFor()
  await confirmAction(alphaAdmin.page, 'Unpublish', 'Hide the public site?')
  await alphaAdmin.page.getByRole('status').filter({ hasText: 'The public site is now hidden' }).waitFor({ timeout: 20000 })
  await anon.page.goto(`${alpha.origin}/`, { waitUntil: 'networkidle' })
  assert(await anon.page.locator('[data-public-site-state="private"]').count() === 1, 'alpha still public after unpublish')
  assert(!(await anon.page.textContent('body')).includes(alpha.titles.en), 'published title remained visible after unpublish')
  await anon.page.screenshot({ path: path.join(evidenceDir, '09-alpha-unpublished.png'), fullPage: true })
  await alphaAdmin.page.reload({ waitUntil: 'networkidle' })
  assert(await field(alphaAdmin.page, 'Headline').inputValue() === alpha.titles.en, 'draft not preserved after unpublish')
  record('unpublish hides live site and preserves draft', 'passed')
  await Promise.all([alphaAdmin.context.close(), betaAdmin.context.close(), anon.context.close()])
}

;(async () => {
  let exitCode = 0
  try {
    await main()
  } catch (error) {
    exitCode = 1
    record('E2E execution', 'failed', error instanceof Error ? error.stack || error.message : String(error))
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (admin) {
      for (const fundId of [...created.funds].reverse()) {
        const result = await admin.from('funds').delete().eq('id', fundId)
        if (result.error) { exitCode = 1; record('fixture fund cleanup', 'failed', result.error.message) }
      }
      for (const userId of [...created.users].reverse()) {
        const result = await admin.auth.admin.deleteUser(userId)
        if (result.error) { exitCode = 1; record('fixture user cleanup', 'failed', result.error.message) }
      }
      if (created.funds.length || created.users.length) record('disposable fixture cleanup', 'passed', `${created.funds.length} Funds, ${created.users.length} users deleted`)
    }
    fs.writeFileSync(path.join(evidenceDir, 'e2e-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, diagnostics }, null, 2))
    console.log(`Evidence: ${evidenceDir}`)
    process.exitCode = exitCode
  }
})()
