const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')
const { createServerClient } = require('@supabase/ssr')
const puppeteer = require('puppeteer-core')

const dealId = process.env.STAGE_GUIDANCE_QA_DEAL_ID
  || 'c321df20-ef87-4b9d-ad8e-c48f8e64a63a'
const tenantHost = process.env.STAGE_GUIDANCE_QA_HOST
  || 'cci-7b2d62d758cf46848c317e4c43b9949e.localhost'
const port = process.env.STAGE_GUIDANCE_QA_PORT || '3020'
const targetUrl = `http://${tenantHost}:${port}/diligence/${dealId}`
const evidenceDir = __dirname
const sentinel = `qa-ingest-${Date.now()}`

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
  return emitted
}

async function waitForBodyText(page, text) {
  await page.waitForFunction(
    expected => document.body.innerText.includes(expected),
    { timeout: 30_000 },
    text,
  )
}

async function clickVisibleButton(page, text) {
  const clicked = await page.$$eval('button', (buttons, expected) => {
    const button = buttons.find(element => {
      const rect = element.getBoundingClientRect()
      return element.textContent?.trim() === expected && rect.width > 0 && rect.height > 0
    })
    if (!button) return false
    button.click()
    return true
  }, text)
  assert.equal(clicked, true, `Visible button not found: ${text}`)
}

async function activateTab(page, label) {
  await clickVisibleButton(page, label)
  await page.waitForFunction(
    expected => Array.from(document.querySelectorAll('button')).some(button => {
      const className = typeof button.className === 'string' ? button.className : ''
      return button.textContent?.trim() === expected && className.includes('border-primary')
    }),
    { timeout: 30_000 },
    label,
  )
}

async function openStageGuidance(page) {
  const alreadyOpen = await page.$eval(
    'textarea[placeholder^="调整本阶段"]',
    element => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    },
  ).catch(() => false)
  if (alreadyOpen) return

  const buttons = await page.$$('button')
  let workflowButton = null
  for (const button of buttons) {
    const matches = await button.evaluate(element => {
      const rect = element.getBoundingClientRect()
      return element.textContent?.includes('智能体工作方式') && rect.width > 0 && rect.height > 0
    })
    if (matches) {
      workflowButton = button
      break
    }
  }
  assert.ok(workflowButton, 'Visible stage workflow control was not found')
  const workflowBefore = await workflowButton.evaluate(element => ({
    className: element.className,
    text: element.textContent?.trim(),
    parentText: element.parentElement?.textContent?.trim(),
  }))
  const workflowAlreadyOpen = workflowBefore.parentText?.includes('正在加载指引')
    || workflowBefore.parentText?.includes('本阶段的基金级指引')
  if (!workflowAlreadyOpen) {
    await workflowButton.click()
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  try {
    await waitForBodyText(page, '本阶段的基金级指引')
    await page.waitForSelector('textarea[placeholder^="调整本阶段"]', {
      visible: true,
      timeout: 30_000,
    })
  } catch (error) {
    const visibleButtons = await page.$$eval('button', buttons => buttons.flatMap(element => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 ? [element.textContent?.trim() || ''] : []
    }))
    await page.screenshot({ path: path.join(evidenceDir, 'stage-guidance-failure.png'), fullPage: true })
    console.error(`Workflow control before click: ${JSON.stringify(workflowBefore)}`)
    console.error(`Visible buttons at stage-guidance failure: ${JSON.stringify(visibleButtons)}`)
    throw error
  }
}

async function readGuidance(page) {
  return page.$eval('textarea[placeholder^="调整本阶段"]', element => element.value)
}

async function writeGuidance(page, value) {
  await page.$eval('textarea[placeholder^="调整本阶段"]', (element, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    if (!setter) throw new Error('Textarea value setter is unavailable')
    setter.call(element, nextValue)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

async function saveGuidance(page) {
  const clicked = await page.$$eval('button', buttons => {
    const button = buttons.find(element => {
      const rect = element.getBoundingClientRect()
      const label = element.textContent?.trim()
      return (label === '保存指引' || label === '已保存') && !element.disabled && rect.width > 0 && rect.height > 0
    })
    if (!button) return false
    button.click()
    return true
  })
  assert.equal(clicked, true, 'Enabled stage-guidance save button was not found')
  await waitForBodyText(page, '已保存')
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('button')).some(button => button.textContent?.trim() === '已保存'),
    { timeout: 30_000 },
  )
}

async function patchGuidance(page, stage, value) {
  const result = await page.evaluate(async ({ targetStage, nextValue }) => {
    const response = await fetch('/api/diligence/prompts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guidance: { [targetStage]: nextValue } }),
    })
    return { ok: response.ok, status: response.status, body: await response.text() }
  }, { targetStage: stage, nextValue: value })
  assert.equal(result.ok, true, `Could not restore ${stage} guidance: HTTP ${result.status} ${result.body}`)
}

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true })
  const authCookies = await createAuthCookies()
  const browser = await puppeteer.launch({
    executablePath: '/opt/google/chrome/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  const runtimeErrors = []
  const knownShellResponses = new Set()
  let originalIngest
  let ingestChanged = false
  page.on('pageerror', error => runtimeErrors.push(`page: ${error.message}`))
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.host === `${tenantHost}:${port}` && response.status() >= 400) {
      const statusPath = `http ${response.status()}: ${url.pathname}`
      const known = (response.status() === 404 && url.pathname === '/api/portal/me')
        || (response.status() === 403 && url.pathname === '/api/accounting/vehicle-index')
        || (response.status() === 403 && url.pathname === '/api/time-zone')
      if (known) knownShellResponses.add(statusPath)
      else runtimeErrors.push(statusPath)
    }
  })

  try {
    await page.setViewport({ width: 1440, height: 1000 })
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
        value: 'zh-CN',
        url: targetUrl,
        path: '/',
        sameSite: 'Lax',
        secure: false,
        httpOnly: true,
      },
    )
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60_000 })
    await waitForBodyText(page, '资料室')

    const projectPreferenceCount = await page.$$eval('button', buttons => (
      buttons.filter(button => button.textContent?.trim() === '分析偏好').length
    ))
    assert.equal(projectPreferenceCount, 0, 'Project-wide analysis preferences control is still visible')

    await activateTab(page, '清单')
    await waitForBodyText(page, '资料室发现')
    await openStageGuidance(page)
    const observedIngest = await readGuidance(page)
    originalIngest = observedIngest.startsWith('qa-ingest-') ? '' : observedIngest
    if (observedIngest !== originalIngest) {
      await writeGuidance(page, originalIngest)
      await saveGuidance(page)
    }
    await page.screenshot({ path: path.join(evidenceDir, 'checklist-stage-guidance.png'), fullPage: true })
    await writeGuidance(page, sentinel)
    await saveGuidance(page)
    ingestChanged = true

    await activateTab(page, '研究')
    await waitForBodyText(page, '外部研究')
    await openStageGuidance(page)
    const originalResearch = await readGuidance(page)
    assert.notEqual(originalResearch, sentinel, 'Ingest guidance leaked into the Research stage')

    await activateTab(page, '清单')
    await waitForBodyText(page, '资料室发现')
    await openStageGuidance(page)
    assert.equal(await readGuidance(page), sentinel, 'Saved ingest guidance did not reopen on its own stage')
    await writeGuidance(page, originalIngest)
    await saveGuidance(page)
    ingestChanged = false

    await activateTab(page, '研究')
    await waitForBodyText(page, '外部研究')
    await openStageGuidance(page)
    assert.equal(await readGuidance(page), originalResearch, 'Research guidance changed during ingest verification')
    await page.screenshot({ path: path.join(evidenceDir, 'research-stage-guidance.png'), fullPage: true })

    assert.deepEqual(runtimeErrors, [], `Unexpected browser errors: ${runtimeErrors.join('; ')}`)
    const result = {
      ok: true,
      targetUrl,
      projectPreferenceCount,
      ingestSavedAndReopened: true,
      researchRemainedIsolated: true,
      originalIngestRestored: true,
      runtimeErrors,
      knownShellResponses: [...knownShellResponses],
    }
    fs.writeFileSync(path.join(evidenceDir, 'browser-result.json'), `${JSON.stringify(result, null, 2)}\n`)
    console.log(JSON.stringify(result))
  } finally {
    if (ingestChanged && originalIngest !== undefined) {
      try {
        await patchGuidance(page, 'ingest', originalIngest)
        ingestChanged = false
      } catch (cleanupError) {
        console.error(`Could not restore ingest guidance: ${cleanupError.message}`)
      }
    }
    await browser.close()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
