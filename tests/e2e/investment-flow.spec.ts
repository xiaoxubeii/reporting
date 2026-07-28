import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect } from './support/observed-test'
import { signInToTenant, tenantOrigin } from './support/auth'
import { readE2EFixtureState } from './support/fixture-state'
import {
  configureLocalFundMail,
  signResendWebhook,
} from './support/fund-mail-fixture'
import {
  configureExplicitInvestmentProvider,
  createLocalInvestmentAdmin,
  readInvestmentChecklistGapCount,
  readExplicitInvestmentProvider,
  waitForBackgroundDealResearch,
  waitForMemoAgentIdle,
} from './support/investment-fixture'

test('public Pitch becomes a reviewable Deal, queues research, promotes to Diligence, and uploads evidence', async ({ page, baseURL, browserFailures }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const origin = tenantOrigin(baseURL, primary)
  const companyName = `Cardio Signal ${primary.suffix.slice(-8)}`
  const pitch = 'We are building a clinically validated cardiovascular workflow for hospital teams. Two pilot sites are measuring alert accuracy and clinician response time while we raise a seed round.'
  const fixtureIp = primary.suffix
    .slice(-8)
    .match(/.{1,2}/g)
    ?.map(part => String((Number.parseInt(part, 16) % 254) + 1))
    .join('.')
  if (!fixtureIp) throw new Error('E2E fixture suffix cannot produce a client IP')

  await page.setExtraHTTPHeaders({ 'x-real-ip': fixtureIp })
  await page.goto(`${origin}/submit/${primary.submissionToken}`)
  await expect(page.getByRole('heading', { name: `Submit a pitch to ${primary.fundName}` })).toBeVisible()
  await page.locator('#companyName').fill(companyName)
  await page.locator('#companyUrl').fill('https://cardiosignal.example/product')
  await page.locator('#founderName').fill('Alex Founder')
  await page.locator('#founderEmail').fill(`alex-${primary.suffix}@cardiosignal.example`)
  await page.locator('#pitch').fill(pitch)
  const submissionResponse = page.waitForResponse(response => (
    response.url().includes(`/api/public/submit/${primary.submissionToken}`)
    && response.request().method() === 'POST'
  ))
  await page.getByRole('button', { name: 'Submit pitch' }).click()
  expect((await submissionResponse).status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Submission received' })).toBeVisible()

  await signInToTenant(page, baseURL, primary)
  await page.goto(`${origin}/emails`)
  await expect(page.getByRole('heading', { name: 'Inbound', exact: true })).toBeVisible()
  const inboundSubject = page.getByText(`Web submission: ${companyName}`, { exact: true })
  await expect(inboundSubject).toBeVisible()
  await inboundSubject.locator('xpath=ancestor::tr').click()
  await page.waitForURL(url => url.origin === origin && /^\/emails\/[^/]+$/.test(url.pathname))
  await expect(page.getByRole('heading', { name: 'Email Body' })).toBeVisible()
  await expect(page.locator('pre').filter({ hasText: pitch })).toBeVisible()

  await page.goto(`${origin}/deals`)
  const dealLink = page.getByRole('link', { name: companyName, exact: true })
  await expect(dealLink).toBeVisible()
  await dealLink.click()
  await expect(page.getByRole('heading').filter({ hasText: companyName })).toBeVisible()
  await expect(page.locator('main')).toContainText(pitch)

  const researchInFlight = page.getByText(/Researching the founder and company/i)
  const researchAction = page.getByRole('button', { name: /^(Research this deal|Re-run)$/ })
  await expect(researchInFlight.or(researchAction)).toBeVisible()

  // Public intake queues fallback research automatically when synchronous Deal
  // analysis is unavailable. Only use the manual action when no job is already
  // running; in-flight research intentionally hides the action button.
  if (await researchAction.isVisible()) {
    const researchResponse = page.waitForResponse(response => (
      /\/api\/deals\/[^/]+\/research$/.test(new URL(response.url()).pathname)
      && response.request().method() === 'POST'
    ))
    await researchAction.click()
    expect((await researchResponse).status()).toBe(200)
  }
  await expect(researchInFlight).toBeVisible()

  await page.getByRole('button', { name: 'New', exact: true }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Diligence', exact: true }).click()
  await page.waitForURL(url => url.origin === origin && /^\/diligence\/[^/]+$/.test(url.pathname))
  await expect(page.getByRole('heading').filter({ hasText: companyName })).toBeVisible()

  const workflowTabs = ['Checklist', 'Data Room', 'Research', 'Founders', 'Scoring', 'Memo', 'Settings']
  const workflowNav = page.locator('main nav').filter({ has: page.getByRole('button', { name: 'Founders', exact: true }) })
  for (const tab of workflowTabs) {
    await expect(workflowNav.getByRole('button', { name: tab, exact: true })).toBeVisible()
  }

  await workflowNav.getByRole('button', { name: 'Data Room', exact: true }).click()
  const upload = page.locator('input[type="file"]').first()
  const uploadFixture = path.join(process.cwd(), 'tests/e2e/fixtures/cardio-signal-pitch.txt')
  const uploadedFiles = page.getByText('cardio-signal-pitch.txt', { exact: true })
  await upload.setInputFiles(uploadFixture)
  const uploadOutcome = await expect.poll(async () => {
    if (await uploadedFiles.count() > 0) return 'uploaded'
    const networkFailed = browserFailures.some(failure => (
      failure.kind === 'request'
      && failure.method === 'POST'
      && failure.url?.endsWith('/documents/upload-url')
      && /ERR_NETWORK_CHANGED/.test(failure.message)
    ))
    return networkFailed ? 'network-failed' : 'pending'
  }, { timeout: 30_000 }).not.toBe('pending').then(async () => (
    await uploadedFiles.count() > 0 ? 'uploaded' : 'network-failed'
  ))
  if (uploadOutcome === 'network-failed') {
    // A user-level retry is the only safe recovery for a failed mutating
    // browser request. The observer verifies the repeated POST succeeds.
    await upload.setInputFiles([])
    await upload.setInputFiles(uploadFixture)
  }
  await expect(uploadedFiles).toHaveCount(1, { timeout: 30_000 })
  await expect(uploadedFiles.first()).toBeVisible()

  for (const tab of ['Research', 'Founders', 'Scoring', 'Memo', 'Settings']) {
    const tabButton = workflowNav.getByRole('button', { name: tab, exact: true })
    await tabButton.click()
    await expect(tabButton).toHaveClass(/border-primary/)
  }

  await page.goto(`${origin}/diligence`)
  await expect(page.getByText(companyName, { exact: true })).toBeVisible()

  const inboxResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/diligence/inbox'
    && response.request().method() === 'GET'
  ))
  await page.goto(`${origin}/diligence/inbox`)
  expect((await inboxResponse).status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Diligence inbox' })).toBeVisible()
  await expect(page.getByText('No diligence items match these filters.')).toBeVisible()

  const analyticsResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/diligence/analytics'
    && response.request().method() === 'GET'
  ))
  await page.goto(`${origin}/diligence/analytics`)
  expect((await analyticsResponse).status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Diligence analytics' })).toBeVisible()
  await expect(page.getByText('Pipeline funnel', { exact: true })).toBeVisible()
})

test('admin-created Deal survives unavailable AI and concurrent promotion creates one Diligence record', async ({ page, baseURL, browserFailureAllowances }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const origin = await signInToTenant(page, baseURL, primary)
  const companyName = `Concurrent Bio ${primary.suffix.slice(-8)}`

  await page.goto(`${origin}/deals`)
  await page.getByRole('button', { name: 'New Deal' }).click()
  const dialog = page.getByRole('dialog', { name: 'New deal' })
  await dialog.getByLabel('Company name *').fill(companyName)
  await dialog.getByLabel('Founder name *').fill('Casey Founder')
  await dialog.getByLabel('Founder email *').fill(`casey-${primary.suffix}@concurrent.example`)
  await dialog.getByLabel('Intro source').selectOption('warm_intro')
  await dialog.getByLabel('Referrer name').fill('Trusted Scout')
  await dialog.getByLabel('Pitch / description *').fill('A partner-entered cardiovascular diagnostics company with a validated pilot and a seed financing plan.')
  await dialog.getByRole('button', { name: 'Create deal' }).click()
  await page.waitForURL(url => url.origin === origin && /^\/deals\/[^/]+$/.test(url.pathname))
  await expect(page.getByRole('heading').filter({ hasText: companyName })).toBeVisible()

  const dealId = new URL(page.url()).pathname.split('/').pop()
  if (!dealId) throw new Error('Created Deal URL did not contain an ID')
  browserFailureAllowances.allow({
    kind: 'console',
    pathname: `/api/deals/${dealId}/promote-to-diligence`,
    status: 409,
  })
  const promotions = await page.evaluate(async id => {
    const promote = async () => {
      const response = await fetch(`/api/deals/${id}/promote-to-diligence`, { method: 'POST' })
      return { status: response.status, body: await response.json() }
    }
    return Promise.all([promote(), promote()])
  }, dealId)

  expect(promotions.map(result => result.status).sort()).toEqual([200, 409])
  const diligenceIds = promotions.map(result => result.body.diligence_id)
  expect(diligenceIds[0]).toBeTruthy()
  expect(new Set(diligenceIds).size).toBe(1)
  browserFailureAllowances.allow({
    kind: 'console',
    pathname: `/api/diligence/${diligenceIds[0]}`,
    status: 409,
  })
  await page.goto(`${origin}/diligence/${diligenceIds[0]}`)
  await expect(page.getByRole('heading').filter({ hasText: companyName })).toBeVisible()

  const prematureDecision = page.waitForResponse(response => (
    new URL(response.url()).pathname === `/api/diligence/${diligenceIds[0]}`
    && response.request().method() === 'PATCH'
  ))
  await page.getByRole('button', { name: 'Active', exact: true }).click()
  await page.getByRole('button', { name: 'Passed', exact: true }).click()
  expect((await prematureDecision).status()).toBe(409)
  await expect(page.getByRole('alert').filter({ hasText: 'Finalize a memo before recording the final investment decision.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Active', exact: true })).toBeVisible()
})

test('Pitch to final decision preserves evidence, expert reply, 7-dimension scoring, and tenant isolation', async ({ page, request, baseURL, browserFailureAllowances }, testInfo) => {
  test.setTimeout(20 * 60_000)
  if (!baseURL) throw new Error('Playwright baseURL is required')

  const [primary, secondary] = await Promise.all([
    readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE'),
    readE2EFixtureState('E2E_SECONDARY_FIXTURE_STATE'),
  ])
  const admin = createLocalInvestmentAdmin()
  const provider = readExplicitInvestmentProvider()
  const providerSetup = await configureExplicitInvestmentProvider(admin, primary.fundId, provider)
  const fundMail = await configureLocalFundMail({
    admin,
    fundId: primary.fundId,
    userId: primary.userId,
    slug: primary.fundSlug,
  })
  testInfo.annotations.push({
    type: 'investment-ai',
    description: `explicit disposable Fund provider: ${providerSetup.provider}`,
  })
  testInfo.annotations.push({
    type: 'fund-mail',
    description: 'configured Resend adapter with signed inbound reply',
  })

  const origin = tenantOrigin(baseURL, primary)
  const short = `${primary.suffix.slice(-6)}-${Date.now().toString(36)}`
  const companyName = `Decision Loop ${short}`
  const founderEmail = `founder-${short}@decision-loop.example`
  const pitch = 'Decision Loop builds a cardiovascular decision-support workflow. Management reports two hospital pilots, but independent clinical performance and pilot economics remain unresolved before investment.'
  const recommendation = 'PASS only after independent clinical validation, workflow adoption logs, and pilot economics are reviewed by the investment committee.'
  const fixtureIp = `198.51.100.${(Number.parseInt(primary.suffix.slice(-2), 16) % 200) + 20}`

  await test.step('public Pitch creates exactly one source email and one tenant-scoped Deal', async () => {
    await page.setExtraHTTPHeaders({ 'x-real-ip': fixtureIp })
    await page.goto(`${origin}/submit/${primary.submissionToken}`)
    await page.locator('#companyName').fill(companyName)
    await page.locator('#companyUrl').fill('https://decision-loop.example/product')
    await page.locator('#founderName').fill('Jordan Founder')
    await page.locator('#founderEmail').fill(founderEmail)
    await page.locator('#pitch').fill(pitch)
    const submitted = page.waitForResponse(response => (
      response.url().includes(`/api/public/submit/${primary.submissionToken}`)
      && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: 'Submit pitch' }).click()
    expect((await submitted).status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Submission received' })).toBeVisible()

    const source = await waitUntil(async () => {
      const emails = await admin.from('inbound_emails').select('id, fund_id, subject').eq('fund_id', primary.fundId).eq('subject', `Web submission: ${companyName}`)
      const deals = await admin.from('inbound_deals').select('id, fund_id, email_id, company_name, promoted_diligence_id, research_status, research_error, research_sources').eq('fund_id', primary.fundId).eq('company_name', companyName)
      if (emails.error) throw new Error(emails.error.message)
      if (deals.error) throw new Error(deals.error.message)
      return { emails: emails.data ?? [], deals: deals.data ?? [] }
    }, value => value.emails.length === 1 && value.deals.length === 1)
    expect(source.deals[0].email_id).toBe(source.emails[0].id)
    const foreignDeals = await admin.from('inbound_deals').select('id', { count: 'exact', head: true }).eq('fund_id', secondary.fundId).eq('company_name', companyName)
    expect(foreignDeals.count).toBe(0)
  })

  await signInToTenant(page, baseURL, primary)
  await page.goto(`${origin}/emails`)
  await expect(page.getByText(`Web submission: ${companyName}`, { exact: true })).toBeVisible()
  await page.goto(`${origin}/deals`)
  await Promise.all([
    page.waitForURL(url => url.origin === origin && /^\/deals\/[^/]+$/.test(url.pathname)),
    page.getByRole('link', { name: companyName, exact: true }).click(),
  ])
  const inboundDealId = pathTail(page.url())

  await test.step('Deal Research reaches a truthful terminal state and can be retried from the UI', async () => {
    const initial = await waitForBackgroundDealResearch({
      admin,
      fundId: primary.fundId,
      dealId: inboundDealId,
    })
    expect(initial.status).toBe('completed')

    await page.reload()
    const previousJobId = initial.id
    const rerun = page.waitForResponse(response => (
      new URL(response.url()).pathname === `/api/deals/${inboundDealId}/research`
      && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: /^(Research this deal|Re-run)$/ }).click()
    const rerunResponse = await rerun
    expect(rerunResponse.status()).toBe(200)
    const rerunBody = await rerunResponse.json() as { job_id: string }
    expect(rerunBody.job_id).toEqual(expect.any(String))
    expect(rerunBody.job_id).not.toBe(previousJobId)
    const retryJob = await waitForBackgroundDealResearch({
      admin,
      fundId: primary.fundId,
      dealId: inboundDealId,
      expectedJobId: rerunBody.job_id,
    })
    expect(retryJob.status).toBe('completed')

    const stored = await admin.from('inbound_deals').select('research_status, research_error, research_sources').eq('id', inboundDealId).eq('fund_id', primary.fundId).single()
    if (stored.error) throw new Error(stored.error.message)
    expect(stored.data.research_status).toBe('done')
    expect(collectHttpUrls(stored.data.research_sources)).not.toHaveLength(0)
  })

  let diligenceId = ''
  await test.step('promotion is atomic and final decision is blocked before a finalized Memo', async () => {
    const promoted = page.waitForResponse(response => (
      new URL(response.url()).pathname === `/api/deals/${inboundDealId}/promote-to-diligence`
      && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: 'New', exact: true }).click()
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Diligence', exact: true }).click()
    const promotionResponse = await promoted
    expect(promotionResponse.status()).toBe(200)
    diligenceId = ((await promotionResponse.json()) as { diligence_id: string }).diligence_id
    browserFailureAllowances.allow({
      kind: 'console',
      pathname: `/api/deals/${inboundDealId}/promote-to-diligence`,
      status: 409,
    })
    browserFailureAllowances.allow({
      kind: 'console',
      pathname: `/api/diligence/${diligenceId}`,
      status: 409,
    })
    await page.waitForURL(`${origin}/diligence/${diligenceId}`)

    const duplicate = await page.evaluate(async dealId => {
      const response = await fetch(`/api/deals/${dealId}/promote-to-diligence`, { method: 'POST' })
      return { status: response.status, body: await response.json() }
    }, inboundDealId)
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.diligence_id).toBe(diligenceId)

    const premature = await page.evaluate(async dealId => {
      const response = await fetch(`/api/diligence/${dealId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deal_status: 'passed' }),
      })
      return { status: response.status, body: await response.json() }
    }, diligenceId)
    expect(premature).toMatchObject({ status: 409, body: { code: 'finalized_memo_required' } })
  })

  const workflowNav = page.locator('main nav').filter({ has: page.getByRole('button', { name: 'Research', exact: true }) })
  const evidencePath = testInfo.outputPath(`decision-loop-${short}.txt`)
  await writeFile(evidencePath, `${pitch}\n\nSource: management pitch; independent validation not supplied.\n`, 'utf8')
  let activeDraftId = ''

  await test.step('Data Room upload and ingestion use the real UI/Cron path', async () => {
    await workflowNav.getByRole('button', { name: 'Data Room', exact: true }).click()
    const uploaded = page.waitForResponse(response => (
      new URL(response.url()).pathname === `/api/diligence/${diligenceId}/documents`
      && response.request().method() === 'POST'
    ))
    await page.locator('input[type="file"]').first().setInputFiles(evidencePath)
    expect((await uploaded).status()).toBe(200)

    const prior = await latestMemoJobId(admin, primary.fundId, diligenceId, 'ingest')
    const enqueued = page.waitForResponse(response => (
      new URL(response.url()).pathname === `/api/diligence/${diligenceId}/agent/ingest`
      && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: /^Analyze data room$/ }).click()
    expect((await enqueued).status()).toBe(200)
    const job = await waitForMemoAgentIdle({ admin, fundId: primary.fundId, dealId: diligenceId, expectedKind: 'ingest', afterJobId: prior ?? undefined })
    expect(job.status).toBe('success')

    const documents = await admin.from('diligence_documents').select('id, fund_id, deal_id, source_kind, file_name').eq('fund_id', primary.fundId).eq('deal_id', diligenceId).eq('source_kind', 'upload')
    if (documents.error) throw new Error(documents.error.message)
    expect(documents.data).toHaveLength(1)
    const foreign = await admin.from('diligence_documents').select('id', { count: 'exact', head: true }).eq('fund_id', secondary.fundId).eq('deal_id', diligenceId)
    expect(foreign.count).toBe(0)
  })

  await runMemoStage({
    page, admin, workflowNav, tab: 'Research', button: /^(Run research|Re-run research)$/,
    action: 'research', kind: 'research', fundId: primary.fundId, dealId: diligenceId,
    expectedStatus: 'success',
  })

  const expertName = `Dr Expert ${short}`
  const expertEmail = `expert-${short}@example.com`
  const validationQuestion = 'Does the available evidence support the reported clinical performance and hospital workflow adoption?'
  await test.step('expert validation is requested, invited, answered publicly, materialized, and re-ingested', async () => {
    await page.goto(`${origin}/experts`)
    await page.getByRole('tab', { name: 'Fund experts' }).click()
    await page.getByRole('button', { name: 'Add expert manually' }).click()
    await page.locator('#new-expert-name').fill(expertName)
    await page.locator('#new-expert-email').fill(expertEmail)
    await page.locator('#new-expert-title').fill('Cardiology outcomes researcher')
    await page.locator('#new-expert-organization').fill('Independent Clinical Institute')
    await page.locator('#new-expert-profile').fill('Evaluates cardiovascular clinical evidence and hospital workflow adoption.')
    const createdExpert = page.waitForResponse(response => new URL(response.url()).pathname === '/api/experts' && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Save as fund expert' }).click()
    expect((await createdExpert).status()).toBe(201)
    await expect(page.getByRole('heading', { name: expertName })).toBeVisible()

    await page.goto(`${origin}/diligence/${diligenceId}`)
    const nav = page.locator('main nav').filter({ has: page.getByRole('button', { name: 'Research', exact: true }) })
    await nav.getByRole('button', { name: 'Research', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Validate with expert' }).first()).toBeVisible()
    const generation = page.waitForResponse(response => (
      new URL(response.url()).pathname === `/api/diligence/${diligenceId}/expert-validations/generate`
      && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: 'Validate with expert' }).first().click()
    const generationResponse = await generation
    expect(generationResponse.status()).toBe(200)

    await page.getByLabel('Validation question').fill(validationQuestion)
    await page.getByLabel('Expert profile for matching').fill('Independent cardiovascular outcomes researcher with hospital deployment experience.')
    await page.getByLabel('Sanitized context shown to the expert').fill('Management reports two pilots; no patient-identifiable data is included. Please identify evidence limitations.')
    const requestCreated = page.waitForResponse(response => (
      new URL(response.url()).pathname === `/api/diligence/${diligenceId}/expert-validations`
      && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: 'Confirm request' }).click()
    expect((await requestCreated).status()).toBe(201)

    await page.getByPlaceholder('Search experts').fill(expertName)
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByText(expertName, { exact: true })).toBeVisible()
    const selected = page.waitForResponse(response => response.url().includes('/select') && response.request().method() === 'POST')
    await page.getByRole('button', { name: `Select ${expertName}`, exact: true }).click()
    expect((await selected).status()).toBe(200)

    const beforeReingest = await latestMemoJobId(admin, primary.fundId, diligenceId, 'ingest')
    const invitation = page.waitForResponse(response => response.url().includes('/invite') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Send invitation' }).click()
    const invitationResponse = await invitation
    expect(invitationResponse.status()).toBe(200)
    const invitationUrl = await page.locator('input[readonly]').inputValue()
    const token = new URL(invitationUrl).hash.replace(/^#token=/, '')
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const mailState = await waitUntil(async () => {
      const row = await admin
        .from('diligence_expert_requests')
        .select('id, email_message_id, email_thread_id, email_provider_accepted_at')
        .eq('fund_id', primary.fundId)
        .eq('deal_id', diligenceId)
        .eq('expert_email', expertEmail)
        .maybeSingle()
      if (row.error) throw new Error(row.error.message)
      return row.data
    }, row => Boolean(row?.email_message_id && row.email_thread_id && row.email_provider_accepted_at))
    if (!mailState?.email_message_id || !mailState.email_thread_id) {
      throw new Error('The provider-accepted expert invitation was not tracked')
    }

    const captured = await request.get(`${fundMail.controlUrl}/outbound/${encodeURIComponent(mailState.email_message_id)}`, {
      headers: { Authorization: `Bearer ${fundMail.controlToken}` },
    })
    expect(captured.status()).toBe(200)
    const outbound = await captured.json() as {
      id: string
      idempotencyKey: string
      payload: {
        from: string
        to: string
        reply_to: string
        subject: string
        headers: Record<string, string>
      }
    }
    expect(outbound).toMatchObject({
      id: mailState.email_message_id,
      payload: {
        to: expertEmail,
        subject: 'Invitation to provide an expert perspective',
      },
    })
    expect(outbound.idempotencyKey).toMatch(/^fund-email:[a-f0-9]{48}$/)
    expect(outbound.payload.from).toContain(`expert@${fundMail.domain}`)
    expect(outbound.payload.reply_to).toMatch(new RegExp(`^r_[a-f0-9]{40}@${escapeRegExp(fundMail.domain)}$`))
    expect(outbound.payload.headers['Message-ID']).toMatch(/^<[^<>\s]+>$/)

    const receivedAt = new Date().toISOString()
    const providerEmailId = `reply-${short}`.replace(/[^A-Za-z0-9_-]/g, '_')
    const inboundMessageId = `<${providerEmailId}@example.com>`
    const emailReply = 'Email reply: the current evidence does not independently validate clinical performance or workflow adoption.'
    const fetchedInbound = {
      id: providerEmailId,
      created_at: receivedAt,
      from: expertEmail,
      to: [outbound.payload.reply_to],
      cc: [],
      bcc: [],
      reply_to: [],
      message_id: inboundMessageId,
      subject: `Re: ${outbound.payload.subject}`,
      text: emailReply,
      html: `<p>${emailReply}</p>`,
      headers: {
        'in-reply-to': outbound.payload.headers['Message-ID'],
        references: outbound.payload.headers['Message-ID'],
      },
      attachments: [],
    }
    const registered = await request.post(`${fundMail.controlUrl}/inbound`, {
      headers: { Authorization: `Bearer ${fundMail.controlToken}` },
      data: fetchedInbound,
    })
    expect(registered.status()).toBe(201)

    const event = {
      type: 'email.received',
      created_at: receivedAt,
      data: {
        email_id: providerEmailId,
        created_at: receivedAt,
        from: expertEmail,
        to: [outbound.payload.reply_to],
        cc: [],
        bcc: [],
        message_id: inboundMessageId,
        subject: fetchedInbound.subject,
        attachments: [],
      },
    }
    const rawEvent = JSON.stringify(event)
    const svixId = `svix_${short}`.replace(/[^A-Za-z0-9_-]/g, '_')
    const svixTimestamp = Math.floor(Date.now() / 1000)
    const webhookHeaders = {
      'Content-Type': 'application/json',
      'svix-id': svixId,
      'svix-timestamp': String(svixTimestamp),
      'svix-signature': signResendWebhook({
        id: svixId,
        timestamp: svixTimestamp,
        body: rawEvent,
        webhookSecret: fundMail.webhookSecret,
      }),
    }
    const webhookUrl = `${new URL(baseURL).origin}/api/inbound-email/resend/${fundMail.routeToken}`
    const received = await request.post(webhookUrl, { headers: webhookHeaders, data: rawEvent })
    expect(received.status()).toBe(200)
    expect(await received.json()).toEqual({ ok: true })
    const duplicate = await request.post(webhookUrl, { headers: webhookHeaders, data: rawEvent })
    expect(duplicate.status()).toBe(200)
    expect(await duplicate.json()).toEqual({ ok: true, duplicate: true })

    const threadMessages = await admin
      .from('fund_email_messages')
      .select('id, direction, provider_message_id, text_body')
      .eq('fund_id', primary.fundId)
      .eq('thread_id', mailState.email_thread_id)
      .order('created_at', { ascending: true })
    if (threadMessages.error) throw new Error(threadMessages.error.message)
    expect(threadMessages.data.map(message => message.direction)).toEqual(['outbound', 'inbound'])
    expect(threadMessages.data.some(message => message.provider_message_id === providerEmailId && message.text_body === emailReply)).toBe(true)
    await page.reload()
    await page.locator('main nav').getByRole('button', { name: 'Research', exact: true }).click()
    await page.getByText(validationQuestion, { exact: true }).last().click()
    await expect(page.getByText('Email thread', { exact: true })).toBeVisible()
    await expect(page.getByText(emailReply, { exact: true })).toBeVisible()

    const expertPage = await page.context().newPage()
    const expertIp = `203.0.113.${(Number.parseInt(primary.suffix.slice(-4), 16) % 234) + 20}`
    await expertPage.setExtraHTTPHeaders({ 'x-real-ip': expertIp })
    await expertPage.goto(invitationUrl)
    await expect(expertPage.getByRole('heading', { name: 'Expert validation' })).toBeVisible()
    const expertResponse = 'The current materials do not independently validate clinical performance. Require a prespecified validation dataset, workflow adoption logs, and pilot economics before relying on management claims.'
    await expertPage.locator('#answer').fill(expertResponse)
    const submitted = expertPage.waitForResponse(response => new URL(response.url()).pathname === '/api/public/expert-response/submit')
    await expertPage.getByRole('button', { name: 'Submit response' }).click()
    expect((await submitted).status()).toBe(200)
    await expect(expertPage.locator('#status')).toHaveText('Thank you. Your response has been submitted.')
    const repeated = await expertPage.evaluate(async ({ rawToken, responseMarkdown }) => {
      const response = await fetch('/api/public/expert-response/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: rawToken, response_markdown: responseMarkdown }),
      })
      return { status: response.status, body: await response.json() }
    }, { rawToken: token, responseMarkdown: expertResponse })
    expect(repeated).toMatchObject({ status: 200, body: { submitted: true } })
    await expertPage.close()

    const expertRequest = await waitUntil(async () => {
      const row = await admin.from('diligence_expert_requests').select('id, fund_id, deal_id, status, document_id, response_markdown').eq('fund_id', primary.fundId).eq('deal_id', diligenceId).eq('expert_email', expertEmail).maybeSingle()
      if (row.error) throw new Error(row.error.message)
      return row.data
    }, row => Boolean(row?.status === 'submitted' && row.document_id))
    expect(expertRequest?.response_markdown).toBe(expertResponse)
    const expertDocuments = await admin.from('diligence_documents').select('id, fund_id, deal_id, storage_path, source_kind').eq('fund_id', primary.fundId).eq('deal_id', diligenceId).eq('source_kind', 'industry_expert')
    if (expertDocuments.error) throw new Error(expertDocuments.error.message)
    expect(expertDocuments.data).toHaveLength(1)
    expect(expertDocuments.data[0].id).toBe(expertRequest?.document_id)
    expect(expertDocuments.data[0].storage_path).toBe(`${diligenceId}/expert-validation/${expertRequest?.id}.md`)

    const reingest = await waitForMemoAgentIdle({ admin, fundId: primary.fundId, dealId: diligenceId, expectedKind: 'ingest', afterJobId: beforeReingest ?? undefined })
    expect(reingest.status).toBe('success')
    const draft = await loadActiveDraft(admin, primary.fundId, diligenceId)
    activeDraftId = draft.id
    expect(JSON.stringify(draft.ingestion_output)).toContain(expertRequest?.document_id)
  })

  await test.step('the Fund default checklist is applied through the real UI', async () => {
    await page.goto(`${origin}/diligence/${diligenceId}`)
    const checklistNav = page.locator('main nav').filter({ has: page.getByRole('button', { name: 'Checklist', exact: true }) })
    await checklistNav.getByRole('button', { name: 'Checklist', exact: true }).click()
    const applied = page.waitForResponse(response => (
      new URL(response.url()).pathname === `/api/diligence/${diligenceId}/checklist`
      && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: /^(Apply fund default|Reset from fund default)$/ }).click()
    expect((await applied).status()).toBe(200)
  })

  await runMemoStage({
    page, admin, workflowNav: null, origin, tab: 'Checklist', button: /^(Assess checklist|Reassess checklist)$/,
    action: 'checklist-assessment', kind: 'checklist_assessment', fundId: primary.fundId, dealId: diligenceId,
    expectedStatus: 'success',
  })
  const checklistBeforeMemo = await readInvestmentChecklistGapCount(admin, primary.fundId, diligenceId)
  expect(checklistBeforeMemo.total).toBeGreaterThan(0)
  expect(checklistBeforeMemo.unresolved).toBeGreaterThan(0)

  await runMemoStage({
    page, admin, workflowNav: null, origin, tab: 'Scoring', button: /^(Run scoring|Re-run scoring)$/,
    action: 'score', kind: 'score', fundId: primary.fundId, dealId: diligenceId,
    expectedStatus: 'success',
  })
  let draft = await loadActiveDraft(admin, primary.fundId, diligenceId)
  activeDraftId = draft.id
  const scores = jsonRecord(draft.memo_draft_output).scores
  expect(Array.isArray(scores) ? scores : []).toHaveLength(7)

  await runMemoStage({
    page, admin, workflowNav: null, origin, tab: 'Memo', button: /^(Draft memo|Re-draft memo)$/,
    action: 'draft', kind: 'draft', fundId: primary.fundId, dealId: diligenceId,
    expectedStatus: 'success',
  })
  const review = await latestMemoJob(admin, primary.fundId, diligenceId, 'draft_review')
  expect(review?.status).toBe('success')

  await test.step('Memo rejects an empty recommendation, retains open gaps, finalizes once, then allows Passed', async () => {
    await page.goto(`${origin}/diligence/${diligenceId}`)
    const nav = page.locator('main nav').filter({ has: page.getByRole('button', { name: 'Memo', exact: true }) })
    await nav.getByRole('button', { name: 'Memo', exact: true }).click()
    draft = await loadActiveDraft(admin, primary.fundId, diligenceId)
    activeDraftId = draft.id
    const attention = await admin.from('diligence_attention_items').select('id, status, body').eq('fund_id', primary.fundId).eq('deal_id', diligenceId).eq('status', 'open')
    if (attention.error) throw new Error(attention.error.message)
    expect(attention.data.length).toBeGreaterThan(0)

    const rejectedFinalize = page.waitForResponse(response => response.url().endsWith(`/drafts/${activeDraftId}/finalize`) && response.request().method() === 'POST')
    browserFailureAllowances.allow({
      kind: 'console',
      pathname: `/api/diligence/${diligenceId}/drafts/${activeDraftId}/finalize`,
      status: 422,
    })
    browserFailureAllowances.allow({
      kind: 'console',
      pathname: `/api/diligence/${diligenceId}/drafts/${activeDraftId}/finalize`,
      status: 409,
    })
    await page.getByRole('button', { name: 'Finalize', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Finalize', exact: true }).click()
    expect((await rejectedFinalize).status()).toBe(422)
    await expect(page.getByText(/Recommendation section is empty/)).toBeVisible()

    const section = page.locator('#sec-recommendation')
    const inserted = page.waitForResponse(response => response.url().endsWith(`/drafts/${activeDraftId}`) && response.request().method() === 'PATCH')
    await section.getByRole('button', { name: 'Add paragraph' }).click()
    expect((await inserted).status()).toBe(200)
    await section.locator('textarea').fill(recommendation)
    const saved = page.waitForResponse(response => response.url().endsWith(`/drafts/${activeDraftId}`) && response.request().method() === 'PATCH')
    await section.getByRole('button', { name: 'Save', exact: true }).click()
    expect((await saved).status()).toBe(200)

    const finalized = page.waitForResponse(response => response.url().endsWith(`/drafts/${activeDraftId}/finalize`) && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Finalize', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Finalize', exact: true }).click()
    expect((await finalized).status()).toBe(200)
    const duplicateFinalize = await page.evaluate(async ({ dealId, draftId }) => {
      const response = await fetch(`/api/diligence/${dealId}/drafts/${draftId}/finalize`, { method: 'POST' })
      return { status: response.status, body: await response.json() }
    }, { dealId: diligenceId, draftId: activeDraftId })
    expect(duplicateFinalize.status).toBe(409)

    await page.reload()
    const passed = page.waitForResponse(response => new URL(response.url()).pathname === `/api/diligence/${diligenceId}` && response.request().method() === 'PATCH')
    await page.getByRole('button', { name: 'Active', exact: true }).click()
    await page.getByRole('button', { name: 'Passed', exact: true }).click()
    expect((await passed).status()).toBe(200)
    await expect(page.getByRole('button', { name: 'Passed', exact: true })).toBeVisible()
  })

  await test.step('database truth proves final state, provenance, no duplicates, and no cross-Fund leakage', async () => {
    const finalDraft = await admin.from('diligence_memo_drafts').select('id, is_draft, finalized_at, finalized_by, memo_draft_output, agent_version, ai_provider').eq('id', activeDraftId).eq('fund_id', primary.fundId).eq('deal_id', diligenceId).single()
    if (finalDraft.error) throw new Error(finalDraft.error.message)
    expect(finalDraft.data).toMatchObject({ is_draft: false, finalized_by: primary.userId })
    expect(finalDraft.data.finalized_at).toBeTruthy()
    const paragraphs = jsonRecord(finalDraft.data.memo_draft_output).paragraphs as Array<Record<string, unknown>>
    expect(paragraphs.some(paragraph => (
      paragraph.section_id === 'recommendation'
      && paragraph.prose === recommendation
      && ['partner_drafted', 'partner_edited'].includes(String(paragraph.origin))
    ))).toBe(true)

    const checklistAfterMemo = await readInvestmentChecklistGapCount(admin, primary.fundId, diligenceId)
    expect(checklistAfterMemo).toEqual(checklistBeforeMemo)
    const deal = await admin.from('diligence_deals').select('deal_status, current_memo_stage').eq('id', diligenceId).eq('fund_id', primary.fundId).single()
    if (deal.error) throw new Error(deal.error.message)
    expect(deal.data).toMatchObject({ deal_status: 'passed', current_memo_stage: 'finalized' })
    const linked = await admin.from('inbound_deals').select('promoted_diligence_id').eq('id', inboundDealId).eq('fund_id', primary.fundId).single()
    expect(linked.data?.promoted_diligence_id).toBe(diligenceId)

    const expertRequests = await admin.from('diligence_expert_requests').select('id', { count: 'exact' }).eq('fund_id', primary.fundId).eq('deal_id', diligenceId).eq('expert_email', expertEmail)
    expect(expertRequests.count).toBe(1)
    expect(expertRequests.data).toHaveLength(1)
    const foreignDiligence = await admin.from('diligence_deals').select('id', { count: 'exact', head: true }).eq('fund_id', secondary.fundId).eq('id', diligenceId)
    const foreignExpert = await admin.from('diligence_expert_requests').select('id', { count: 'exact', head: true }).eq('fund_id', secondary.fundId).eq('deal_id', diligenceId)
    expect(foreignDiligence.count).toBe(0)
    expect(foreignExpert.count).toBe(0)

  })
})

async function runMemoStage(params: {
  page: Page
  admin: ReturnType<typeof createLocalInvestmentAdmin>
  workflowNav: ReturnType<Page['locator']> | null
  origin?: string
  tab: 'Research' | 'Checklist' | 'Scoring' | 'Memo'
  button: RegExp
  action: string
  kind: string
  fundId: string
  dealId: string
  expectedStatus: 'success' | 'failed'
}) {
  if (params.origin) await params.page.goto(`${params.origin}/diligence/${params.dealId}`)
  const nav = params.workflowNav ?? params.page.locator('main nav').filter({ has: params.page.getByRole('button', { name: params.tab, exact: true }) })
  await nav.getByRole('button', { name: params.tab, exact: true }).click()
  const prior = await latestMemoJobId(params.admin, params.fundId, params.dealId, params.kind)
  const enqueued = params.page.waitForResponse(response => (
    new URL(response.url()).pathname === `/api/diligence/${params.dealId}/agent/${params.action}`
    && response.request().method() === 'POST'
  ))
  await params.page.getByRole('button', { name: params.button }).click()
  expect((await enqueued).status()).toBe(200)
  const job = await waitForMemoAgentIdle({
    admin: params.admin,
    fundId: params.fundId,
    dealId: params.dealId,
    expectedKind: params.kind,
    afterJobId: prior ?? undefined,
  })
  expect(job.status).toBe(params.expectedStatus)
}

async function latestMemoJobId(
  admin: ReturnType<typeof createLocalInvestmentAdmin>,
  fundId: string,
  dealId: string,
  kind: string,
): Promise<string | null> {
  return (await latestMemoJob(admin, fundId, dealId, kind))?.id ?? null
}

async function latestMemoJob(
  admin: ReturnType<typeof createLocalInvestmentAdmin>,
  fundId: string,
  dealId: string,
  kind: string,
): Promise<{ id: string; status: string } | null> {
  const result = await admin.from('memo_agent_jobs').select('id, status').eq('fund_id', fundId).eq('deal_id', dealId).eq('kind', kind).order('enqueued_at', { ascending: false }).limit(1).maybeSingle()
  if (result.error) throw new Error(result.error.message)
  return result.data
}

async function loadActiveDraft(
  admin: ReturnType<typeof createLocalInvestmentAdmin>,
  fundId: string,
  dealId: string,
) {
  const result = await admin.from('diligence_memo_drafts').select('id, ingestion_output, memo_draft_output').eq('fund_id', fundId).eq('deal_id', dealId).eq('is_draft', true).order('created_at', { ascending: false }).limit(1).single()
  if (result.error) throw new Error(result.error.message)
  return result.data
}

async function waitUntil<T>(
  read: () => Promise<T>,
  ready: (value: T) => boolean,
  timeoutMs = 60_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let latest = await read()
  while (!ready(latest) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1_000))
    latest = await read()
  }
  if (!ready(latest)) throw new Error('Timed out waiting for expected investment E2E state')
  return latest
}

function pathTail(rawUrl: string): string {
  const value = new URL(rawUrl).pathname.split('/').filter(Boolean).pop()
  if (!value) throw new Error('Expected URL to contain a resource ID')
  return value
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function collectHttpUrls(value: unknown): string[] {
  if (typeof value === 'string') return /^https?:\/\//.test(value) ? [value] : []
  if (Array.isArray(value)) return value.flatMap(collectHttpUrls)
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectHttpUrls)
  return []
}
