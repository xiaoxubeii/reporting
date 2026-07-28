const assert = require('node:assert/strict')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')
const { createServerClient } = require('@supabase/ssr')
const puppeteer = require('puppeteer-core')

const dealId = process.env.RESEARCH_TEAM_QA_DEAL_ID
  || 'c321df20-ef87-4b9d-ad8e-c48f8e64a63a'
const tenantHost = process.env.RESEARCH_TEAM_QA_HOST
  || 'cci-7b2d62d758cf46848c317e4c43b9949e.localhost'
const targetUrl = `http://${tenantHost}:3010/diligence/${dealId}`
const evidenceDir = __dirname
const observedKnownShellResponses = new Set()

const localeCopy = {
  en: {
    research: 'Research',
    founderTab: 'Founders',
    teamTitle: 'Founders & Core Team',
    competitionTitle: 'Competitive landscape',
    preResearch: 'Run Research to generate and edit team dossiers.',
    add: 'Add team member',
    save: 'Save',
    cancel: 'Cancel',
    remove: 'Remove',
    removeConfirm: 'Remove profile',
  },
  'zh-CN': {
    research: '研究',
    founderTab: '创始人',
    teamTitle: '创始人与核心团队',
    competitionTitle: '竞争格局',
    preResearch: '请先运行研究，再生成或编辑团队档案。',
    add: '添加成员',
    save: '保存',
    cancel: '取消',
    remove: '移除',
    removeConfirm: '移除档案',
  },
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

async function createAuthCookies() {
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const cookieName = requiredEnv('NEXT_PUBLIC_SUPABASE_COOKIE_NAME')
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const link = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'test@example.com',
  })
  if (link.error || !link.data?.properties?.hashed_token) {
    throw link.error || new Error('Could not generate the QA sign-in token')
  }

  const auth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const verified = await auth.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties.hashed_token,
  })
  if (verified.error || !verified.data.session) {
    throw verified.error || new Error('Could not verify the QA sign-in token')
  }

  const emitted = []
  const server = createServerClient(supabaseUrl, anonKey, {
    cookieOptions: { name: cookieName, path: '/', sameSite: 'lax', secure: false },
    cookies: {
      getAll: () => emitted.map(({ name, value }) => ({ name, value })),
      setAll: cookies => emitted.splice(0, emitted.length, ...cookies),
    },
  })
  const session = await server.auth.setSession({
    access_token: verified.data.session.access_token,
    refresh_token: verified.data.session.refresh_token,
  })
  if (session.error) throw session.error
  assert.ok(emitted.length > 0, 'Supabase emitted no browser cookies')
  return { admin, emitted }
}

async function findVisibleButton(page, text, classFragment) {
  const buttons = await page.$$('button')
  for (const button of buttons) {
    const matches = await button.evaluate((element, expectedText, expectedClass) => {
      const rect = element.getBoundingClientRect()
      const className = typeof element.className === 'string' ? element.className : ''
      return element.textContent?.trim() === expectedText
        && (!expectedClass || className.includes(expectedClass))
        && rect.width > 0
        && rect.height > 0
    }, text, classFragment || '')
    if (matches) return button
  }
  throw new Error(`Visible button not found: ${text}`)
}

async function clickVisibleButton(page, text, classFragment) {
  const button = await findVisibleButton(page, text, classFragment)
  await button.evaluate(element => element.click())
}

async function setField(page, selector, value) {
  await page.waitForSelector(selector, { visible: true, timeout: 30_000 })
  await page.$eval(selector, (element, nextValue) => {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    if (!setter) throw new Error('Form field has no native value setter')
    setter.call(element, nextValue)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

async function waitForText(page, text) {
  await page.waitForFunction(
    expected => document.body.innerText.includes(expected),
    { timeout: 30_000 },
    text,
  )
}

async function openResearch(page, locale) {
  const copy = localeCopy[locale]
  await page.waitForFunction(
    label => Array.from(document.querySelectorAll('button')).some(element => {
      const className = typeof element.className === 'string' ? element.className : ''
      return className.includes('pb-2') && element.textContent?.trim() === label
    }),
    { timeout: 30_000 },
    copy.research,
  )
  let activated = false
  for (let attempt = 0; attempt < 3 && !activated; attempt += 1) {
    await clickVisibleButton(page, copy.research, 'pb-2')
    try {
      await page.waitForFunction(
        label => Array.from(document.querySelectorAll('button')).some(element => {
          const className = typeof element.className === 'string' ? element.className : ''
          return className.includes('pb-2')
            && className.includes('border-primary')
            && element.textContent?.trim() === label
        }),
        { timeout: 5_000 },
        copy.research,
      )
      activated = true
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1_500))
    }
  }
  assert.equal(activated, true, `Research tab did not activate for ${locale}`)
  await waitForText(page, copy.teamTitle)
}

async function newLocalizedPage(browser, authCookies, locale, viewport) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const runtimeErrors = []
  page.on('pageerror', error => runtimeErrors.push(`page: ${error.message}`))
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.host === `${tenantHost}:3010` && response.status() >= 400) {
      const statusPath = `http ${response.status()}: ${url.pathname}`
      const isKnownShellBaseline = (response.status() === 404 && url.pathname === '/api/portal/me')
        || (response.status() === 403 && url.pathname === '/api/accounting/vehicle-index')
      if (isKnownShellBaseline) observedKnownShellResponses.add(statusPath)
      else runtimeErrors.push(statusPath)
    }
  })
  await page.setCookie(
    ...authCookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      url: targetUrl,
      path: '/',
      sameSite: 'Lax',
      secure: false,
    })),
    {
      name: 'NEXT_LOCALE',
      value: locale,
      url: targetUrl,
      path: '/',
      sameSite: 'Lax',
      secure: false,
      httpOnly: true,
    },
  )
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  return { page, runtimeErrors }
}

async function assertNoFounderTab(page, locale) {
  const count = await page.$$eval('button', (buttons, label) => buttons.filter(button => {
    const className = typeof button.className === 'string' ? button.className : ''
    return className.includes('pb-2') && button.textContent?.trim() === label
  }).length, localeCopy[locale].founderTab)
  assert.equal(count, 0, `Unexpected top-level ${localeCopy[locale].founderTab} tab`)
}

async function verifyPreResearch(browser, authCookies, locale) {
  const { page, runtimeErrors } = await newLocalizedPage(
    browser,
    authCookies,
    locale,
    { width: 1280, height: 900 },
  )
  try {
    await openResearch(page, locale)
    await waitForText(page, localeCopy[locale].preResearch)
    await assertNoFounderTab(page, locale)
    const addCount = await page.$$eval(
      'button',
      (buttons, label) => buttons.filter(button => button.textContent?.trim() === label).length,
      localeCopy[locale].add,
    )
    assert.equal(addCount, 0, 'Pre-Research state exposed an ineffective add action')
    await page.screenshot({
      path: path.join(evidenceDir, `research-team-pre-research-${locale}.png`),
      fullPage: true,
    })
    assert.deepEqual(runtimeErrors, [], `Runtime errors in ${locale} pre-Research flow`)
  } finally {
    await page.close()
  }
}

async function verifyEnglishEditing(browser, authCookies) {
  const { page, runtimeErrors } = await newLocalizedPage(
    browser,
    authCookies,
    'en',
    { width: 1280, height: 900 },
  )
  try {
    await openResearch(page, 'en')
    await waitForText(page, 'Browser QA Founder')
    await assertNoFounderTab(page, 'en')
    const bodyText = await page.$eval('body', element => element.innerText)
    const competitionIndex = bodyText.indexOf(localeCopy.en.competitionTitle)
    const teamIndex = bodyText.indexOf(localeCopy.en.teamTitle)
    assert.ok(competitionIndex >= 0 && teamIndex > competitionIndex, 'Team section is not after Competitive Landscape')

    await clickVisibleButton(page, localeCopy.en.add)
    await setField(page, '#founder-name', 'Added QA Member')
    await setField(page, '#founder-role', 'QA Lead')
    await setField(page, '#founder-background', 'Added through the authenticated browser flow.')
    await setField(page, '#founder-questions', 'Confirm browser persistence.')
    await clickVisibleButton(page, localeCopy.en.save)
    await page.waitForFunction(() => !document.querySelector('#founder-name'), { timeout: 30_000 })
    await waitForText(page, 'Added QA Member')

    await page.waitForSelector('button[aria-label="Open team profile for Added QA Member"]', {
      visible: true,
      timeout: 30_000,
    })
    await page.click('button[aria-label="Open team profile for Added QA Member"]')
    assert.equal(await page.$eval('#founder-name', element => element.value), 'Added QA Member')
    await setField(page, '#founder-role', 'Updated QA Lead')
    await clickVisibleButton(page, localeCopy.en.save)
    await page.waitForFunction(() => !document.querySelector('#founder-name'), { timeout: 30_000 })
    await waitForText(page, 'Updated QA Lead')

    await page.click('button[aria-label="Open team profile for Added QA Member"]')
    await clickVisibleButton(page, localeCopy.en.remove)
    await clickVisibleButton(page, localeCopy.en.removeConfirm)
    await page.waitForFunction(() => !document.body.innerText.includes('Added QA Member'), { timeout: 30_000 })

    await page.screenshot({
      path: path.join(evidenceDir, 'research-team-desktop-final.png'),
      fullPage: true,
    })
    assert.deepEqual(runtimeErrors, [], 'Runtime errors in English edit flow')
    return { competitionIndex, teamIndex }
  } finally {
    await page.close()
  }
}

async function verifyChineseAndMobile(browser, authCookies) {
  const desktop = await newLocalizedPage(
    browser,
    authCookies,
    'zh-CN',
    { width: 1280, height: 900 },
  )
  try {
    await openResearch(desktop.page, 'zh-CN')
    await waitForText(desktop.page, 'Browser QA Founder')
    await assertNoFounderTab(desktop.page, 'zh-CN')
    await clickVisibleButton(desktop.page, localeCopy['zh-CN'].add)
    await desktop.page.waitForSelector('#founder-name', { visible: true, timeout: 30_000 })
    await waitForText(desktop.page, '创始人与团队档案')
    await clickVisibleButton(desktop.page, localeCopy['zh-CN'].cancel)
    await desktop.page.screenshot({
      path: path.join(evidenceDir, 'research-team-zh-CN-final.png'),
      fullPage: true,
    })
    assert.deepEqual(desktop.runtimeErrors, [], 'Runtime errors in Chinese flow')
  } finally {
    await desktop.page.close()
  }

  const mobile = await newLocalizedPage(
    browser,
    authCookies,
    'zh-CN',
    { width: 390, height: 844 },
  )
  try {
    await openResearch(mobile.page, 'zh-CN')
    await waitForText(mobile.page, 'Browser QA Founder')
    const width = await mobile.page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    assert.ok(width.scrollWidth <= width.innerWidth, `Mobile horizontal overflow: ${JSON.stringify(width)}`)
    await mobile.page.screenshot({
      path: path.join(evidenceDir, 'research-team-mobile-zh-CN-final.png'),
      fullPage: true,
    })
    assert.deepEqual(mobile.runtimeErrors, [], 'Runtime errors in Chinese mobile flow')
    return width
  } finally {
    await mobile.page.close()
  }
}

async function main() {
  const { admin, emitted } = await createAuthCookies()
  const draft = await admin
    .from('diligence_memo_drafts')
    .select('id, research_output')
    .eq('deal_id', dealId)
    .eq('is_draft', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (draft.error || !draft.data) throw draft.error || new Error('No active QA diligence draft')

  const originalResearch = draft.data.research_output
  const browser = await puppeteer.launch({
    executablePath: '/opt/google/chrome/chrome',
    headless: true,
    args: ['--no-sandbox'],
  })
  try {
    const cleared = await admin
      .from('diligence_memo_drafts')
      .update({ research_output: null })
      .eq('id', draft.data.id)
    if (cleared.error) throw cleared.error
    await verifyPreResearch(browser, emitted, 'en')
    await verifyPreResearch(browser, emitted, 'zh-CN')

    const fixture = {
      findings: [],
      contradictions: [],
      competitive_map: {
        named_by_company: [{ name: 'Fixture competitor', note: 'QA fixture' }],
        named_by_research: [],
      },
      founder_dossiers: [{
        founder_name: 'Browser QA Founder',
        role: 'Founder',
        background_summary: 'Fixture restored automatically after verification.',
        sources: [{ title: 'QA source', url: null }],
        open_questions: ['Confirm QA fixture cleanup.'],
      }],
      research_gaps: [],
      research_mode: 'no_web_search',
    }
    const seeded = await admin
      .from('diligence_memo_drafts')
      .update({ research_output: fixture })
      .eq('id', draft.data.id)
    if (seeded.error) throw seeded.error

    const order = await verifyEnglishEditing(browser, emitted)
    const mobile = await verifyChineseAndMobile(browser, emitted)
    console.log(JSON.stringify({
      ok: true,
      targetUrl,
      locales: ['en', 'zh-CN'],
      addEditRemove: true,
      preResearch: true,
      order,
      mobile,
      knownShellBaseline: [...observedKnownShellResponses].sort(),
    }))
  } finally {
    await browser.close()
    const restored = await admin
      .from('diligence_memo_drafts')
      .update({ research_output: originalResearch })
      .eq('id', draft.data.id)
    if (restored.error) throw restored.error
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
