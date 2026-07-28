import type { Page, TestInfo } from '@playwright/test'

import { enqueueBackgroundJob } from '@/lib/background-jobs/store'
import { parseDiscoveryPage, type DiscoveryPage } from '@/lib/feeds/discovery/contracts'
import { resolveDiscoveryAIProvider } from '@/lib/feeds/discovery/provider'
import { DiscoveryReadService } from '@/lib/feeds/discovery/read-service'
import { test, expect } from './support/observed-test'
import { signInToTenant } from './support/auth'
import { readE2EFixtureState } from './support/fixture-state'
import {
  configureExplicitInvestmentProvider,
  createLocalInvestmentAdmin,
  readExplicitInvestmentProvider,
} from './support/investment-fixture'

type JobRow = Readonly<{
  id: string
  fund_id: string
  kind: string
  payload: unknown
  actor_type: string
  actor_user_id: string | null
  dedupe_key: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  last_error: string | null
  attempts: number
  max_attempts: number
  available_at: string
  lease_expires_at: string | null
  created_at: string
  updated_at: string
}>

test('Explore Discovery uses real curated content, a Fund-scoped refresh job, and a confirmed Deal handoff', async ({ page, baseURL, browserFailureAllowances }, testInfo) => {
  test.setTimeout(900_000)
  if (!baseURL) throw new Error('Playwright baseURL is required')

  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const secondary = await readE2EFixtureState('E2E_SECONDARY_FIXTURE_STATE')
  const provider = readExplicitInvestmentProvider()
  const admin = createLocalInvestmentAdmin()
  const origin = await signInToTenant(page, baseURL, primary)

  // The collector remains usable before a personal Miniflux account exists.
  // Its tabs probe that optional connection and intentionally receive 409.
  browserFailureAllowances.allow({
    kind: 'console',
    pathname: '/api/feeds/explore/following',
    status: 409,
  })

  if (provider.configured) {
    const configured = await configureExplicitInvestmentProvider(admin, primary.fundId, provider)
    expect(configured).toEqual({ configured: true, provider: provider.provider })
    testInfo.annotations.push({
      type: 'discovery-provider',
      description: `configured:${provider.provider}`,
    })
  } else {
    browserFailureAllowances.allow({
      kind: 'console',
      pathname: '/api/feeds/explore/discovery/refresh',
      status: 409,
    })
    testInfo.annotations.push({
      type: 'discovery-provider',
      description: 'unconfigured: explicit degraded path verified',
    })
  }

  const latestResponsePromise = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/feeds/explore/entries'
    && response.request().method() === 'GET'
  ))
  await page.goto(`${origin}/feeds?view=explore`)
  await expect(page.getByRole('link', { name: 'Latest', exact: true })).toHaveAttribute('aria-current', 'page')
  const latestResponse = await latestResponsePromise
  expect(latestResponse.status()).toBe(200)
  const latestEnvelope = await latestResponse.json() as {
    success?: unknown
    data?: { items?: unknown[]; total?: unknown; nextOffset?: unknown }
  }
  expect(latestEnvelope.success).toBe(true)
  const latestItems = Array.isArray(latestEnvelope.data?.items) ? latestEnvelope.data.items : []
  expect(latestItems.length, 'Latest must contain real curated collector entries').toBeGreaterThan(0)
  const inspectableArticle = latestItems.find(isInspectableLatestArticle)
  expect(inspectableArticle, 'Latest must expose a titled HTTP(S) article with source provenance').toBeDefined()
  await expect(page.getByRole('button', { name: inspectableArticle!.title, exact: true }).first()).toBeVisible()
  await attachJson(testInfo, 'explore-latest.json', {
    total: latestEnvelope.data?.total,
    items: latestItems,
  })
  const scanFixture = provider.configured
    ? await prepareDiscoveryScanFixture({ page, admin, fundId: primary.fundId, latestItems })
    : null

  await page.getByRole('link', { name: 'Trending', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/feeds?view=explore&exploreView=trending`)
  const initialTrending = await readDiscoveryFromPage(page, 'trending')

  if (!provider.configured) {
    assertProviderNotConfigured(initialTrending)
    await expect(page.getByRole('status')).toContainText('Discovery AI is not configured')

    const retryResponsePromise = page.waitForResponse(response => (
      new URL(response.url()).pathname === '/api/feeds/explore/discovery/refresh'
      && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    const retryResponse = await retryResponsePromise
    expect(retryResponse.status()).toBe(409)
    expect(await retryResponse.json()).toMatchObject({
      success: false,
      error: {
        code: 'not_configured',
        message: 'Discovery AI is not configured for this Fund.',
      },
    })
    await expect(page.getByRole('status')).toContainText('Configure an AI provider for this Fund in Settings')

    await page.getByRole('link', { name: 'Deal Signals', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/feeds?view=explore&exploreView=deal_signal`)
    const blockedSignals = await readDiscoveryFromPage(page, 'deal_signal')
    assertProviderNotConfigured(blockedSignals)
    await expect(page.getByRole('status')).toContainText('Discovery AI is not configured')
    await attachJson(testInfo, 'explore-discovery-degraded.json', {
      configuredProvider: false,
      trending: initialTrending,
      dealSignals: blockedSignals,
      retry: { status: retryResponse.status(), code: 'not_configured', retryable: true },
    })
    return
  }

  expect(initialTrending.refresh.state).toMatch(/^(ready|stale|degraded)$/)
  const refreshAttempts: Array<Awaited<ReturnType<typeof runDiscoveryRefreshAttempt>>> = []
  let trending: DiscoveryPage = initialTrending
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const refreshAttempt = await runDiscoveryRefreshAttempt({
      page,
      admin,
      baseURL,
      primaryFundId: primary.fundId,
      secondaryFundId: secondary.fundId,
      trigger: attempt === 0 ? 'ui' : 'queue',
    })
    refreshAttempts.push(refreshAttempt)
    if (attempt === 0 && scanFixture) {
      await completeDiscoveryScanFixture(admin, primary.fundId, scanFixture.latestEntryId)
    }
    await assertDiscoveryPersistenceReadable(admin, primary.fundId)
    await page.reload()
    trending = await readDiscoveryFromPage(page, 'trending')
    if (trending.generationId && trending.refresh.state === 'ready') break
  }
  assertPublishedDiscovery(trending, 'trending')
  expect(trending.refresh).toMatchObject({ state: 'ready', reason: null, retryable: false })
  if (trending.items.length > 0) {
    const firstTrending = trending.items[0]
    if (firstTrending.kind !== 'trending') throw new Error('Trending endpoint returned the wrong item kind')
    const card = page.locator('main article').filter({ has: page.getByRole('heading', { name: firstTrending.label, exact: true }) }).first()
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: 'View sources', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('link', { name: new RegExp(escapeRegExp(firstTrending.sources[0].title)) }).first()).toBeVisible()
    await page.keyboard.press('Escape')
  }

  await page.getByRole('link', { name: 'Deal Signals', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/feeds?view=explore&exploreView=deal_signal`)
  const signals = await readDiscoveryFromPage(page, 'deal_signal')
  assertPublishedDiscovery(signals, 'deal_signal')
  expect(signals.generationId).toBe(trending.generationId)
  const eligibleSignal = signals.items.find(item => item.kind === 'deal_signal' && item.existingDealId === null)
  expect(eligibleSignal, 'real configured refresh must produce an eligible evidence-backed Deal Signal').toBeDefined()
  if (!eligibleSignal || eligibleSignal.kind !== 'deal_signal') throw new Error('No eligible Deal Signal was produced')
  const providerProvenance = await assertProviderMaterialization({
    admin,
    primaryFundId: primary.fundId,
    secondaryFundId: secondary.fundId,
    provider: provider.provider,
    model: provider.model,
    sourceEntryIds: eligibleSignal.sources.map(source => source.entryId),
  })

  const signalCard = page.locator('main article').filter({
    has: page.getByRole('heading', { name: eligibleSignal.companyName, exact: true }),
  }).first()
  await expect(signalCard).toBeVisible()
  await signalCard.getByRole('button', { name: 'Evidence', exact: true }).click()
  const evidenceDialog = page.getByRole('dialog')
  await expect(evidenceDialog).toContainText(eligibleSignal.evidence[0])
  await expect(evidenceDialog.getByRole('link', { name: new RegExp(escapeRegExp(eligibleSignal.sources[0].title)) }).first()).toBeVisible()
  await page.keyboard.press('Escape')

  await signalCard.getByRole('button', { name: 'Create Deal', exact: true }).click()
  const dealDialog = page.getByRole('dialog', { name: 'New deal' })
  const discoveryFounderEmail = `discovery-${primary.suffix}@example.invalid`
  await expect(dealDialog.getByLabel('Company name *')).toHaveValue(eligibleSignal.companyName)
  await dealDialog.getByLabel('Founder name *').fill('Discovery E2E Founder')
  await dealDialog.getByLabel('Founder email *').fill(discoveryFounderEmail)
  await expect(dealDialog.getByLabel('Pitch / description *')).not.toHaveValue('')
  const dealResponsePromise = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/deals/manual'
    && response.request().method() === 'POST'
  ), { timeout: 120_000 })
  await dealDialog.getByRole('button', { name: 'Create deal', exact: true }).click()
  const dealResponse = await dealResponsePromise
  expect(dealResponse.status()).toBe(200)
  const dealResponseBody = await dealResponse.json() as { deal_id?: unknown; email_id?: unknown }
  expect(dealResponseBody.deal_id).toEqual(expect.any(String))
  const dealId = String(dealResponseBody.deal_id)
  await page.waitForURL(url => url.origin === origin && url.pathname === `/deals/${dealId}`)
  await expect(page.getByRole('heading').filter({ hasText: eligibleSignal.companyName })).toBeVisible()

  const createdDeal = await admin.from('inbound_deals')
    .select('id, fund_id, company_name, company_domain, email_id', { count: 'exact' })
    .eq('id', dealId)
  if (createdDeal.error) throw new Error(createdDeal.error.message)
  expect(createdDeal.count).toBe(1)
  expect(createdDeal.data).toHaveLength(1)
  expect(createdDeal.data?.[0]).toMatchObject({
    id: dealId,
    fund_id: primary.fundId,
    company_name: eligibleSignal.companyName,
  })
  const correlatedDeals = await admin.from('inbound_deals')
    .select('id, fund_id, founder_email', { count: 'exact' })
    .eq('founder_email', discoveryFounderEmail)
  if (correlatedDeals.error) throw new Error(correlatedDeals.error.message)
  expect(correlatedDeals.count).toBe(1)
  expect(correlatedDeals.data).toEqual([expect.objectContaining({ id: dealId, fund_id: primary.fundId })])
  expect(correlatedDeals.data?.some(row => row.fund_id === secondary.fundId)).toBe(false)

  await page.goto(`${origin}/feeds?view=explore&exploreView=deal_signal`)
  const decoratedSignals = await readDiscoveryFromPage(page, 'deal_signal')
  const decorated = decoratedSignals.items.find(item => item.id === eligibleSignal.id)
  expect(decorated?.kind).toBe('deal_signal')
  if (decorated?.kind !== 'deal_signal') throw new Error('Created Deal Signal disappeared from its generation')
  expect(decorated.existingDealId).toBe(dealId)
  const decoratedCard = page.locator('main article').filter({
    has: page.getByRole('heading', { name: eligibleSignal.companyName, exact: true }),
  }).first()
  await expect(decoratedCard.getByRole('link', { name: 'Open Deal', exact: true })).toHaveAttribute('href', `/deals/${dealId}`)
  await expect(decoratedCard.getByRole('button', { name: 'Create Deal', exact: true })).toHaveCount(0)

  await attachJson(testInfo, 'explore-discovery-configured.json', {
    configuredProvider: provider.provider,
    refreshAttempts: refreshAttempts.map(attempt => ({
      queued: attempt.queuedStatus,
      running: attempt.sawRunning,
      terminal: attempt.job,
    })),
    trending,
    dealSignals: signals,
    providerProvenance,
    createdDeal: createdDeal.data?.[0],
  })
})

async function readDiscoveryFromPage(page: Page, kind: 'trending' | 'deal_signal'): Promise<DiscoveryPage> {
  const envelope = await page.evaluate(async requestedKind => {
    const response = await fetch(`/api/feeds/explore/discovery?kind=${requestedKind}&limit=100&offset=0`)
    return { status: response.status, body: await response.json() }
  }, kind)
  expect(envelope.status).toBe(200)
  expect(envelope.body).toMatchObject({ success: true, error: null })
  const data = (envelope.body as { data?: unknown }).data
  return parseDiscoveryPage(data)
}

async function runDiscoveryRefreshAttempt(input: {
  page: Page
  admin: ReturnType<typeof createLocalInvestmentAdmin>
  baseURL: string
  primaryFundId: string
  secondaryFundId: string
  trigger: 'ui' | 'queue'
}): Promise<{ job: JobRow; sawRunning: boolean; queuedStatus: unknown; trigger: 'ui' | 'queue' }> {
  const queued = input.trigger === 'ui'
    ? await queueDiscoveryFromUi(input.page)
    : await queueDiscoveryContinuation(input.admin, input.primaryFundId)
  const jobId = queued.jobId
  const queuedJob = await readJob(input.admin, jobId)
  expect(queuedJob).toMatchObject({
    id: jobId,
    fund_id: input.primaryFundId,
    kind: 'feed_discovery',
    payload: {},
    actor_type: 'system',
    actor_user_id: null,
    dedupe_key: `feed_discovery:${input.primaryFundId}`,
  })
  expect(['pending', 'running']).toContain(queuedJob.status)

  const terminal = await dispatchUntilTerminal({ admin: input.admin, baseURL: input.baseURL, jobId })
  expect(terminal.sawRunning, 'the real worker must expose a running state before terminal completion').toBe(true)
  expect(terminal.job.status).toBe('completed')
  expect(terminal.job.last_error).toBeNull()
  expect(terminal.job.fund_id).toBe(input.primaryFundId)
  const secondaryJob = await input.admin.from('background_jobs')
    .select('id', { count: 'exact' })
    .eq('id', jobId)
    .eq('fund_id', input.secondaryFundId)
  if (secondaryJob.error) throw new Error(secondaryJob.error.message)
  expect(secondaryJob.count).toBe(0)
  return { job: terminal.job, sawRunning: terminal.sawRunning, queuedStatus: queued.status, trigger: input.trigger }
}

async function queueDiscoveryFromUi(page: Page): Promise<{ jobId: string; status: unknown }> {
  const refreshResponsePromise = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/feeds/explore/discovery/refresh'
    && response.request().method() === 'POST'
  ))
  await page.getByRole('button', { name: 'Refresh discovery results', exact: true }).click()
  const refreshResponse = await refreshResponsePromise
  expect(refreshResponse.status()).toBe(202)
  const envelope = await refreshResponse.json() as {
    success?: unknown
    data?: { jobId?: unknown; status?: unknown }
  }
  expect(envelope.success).toBe(true)
  expect(['pending', 'running']).toContain(envelope.data?.status)
  expect(envelope.data?.jobId).toEqual(expect.any(String))
  return { jobId: String(envelope.data?.jobId), status: envelope.data?.status }
}

async function queueDiscoveryContinuation(
  admin: ReturnType<typeof createLocalInvestmentAdmin>,
  fundId: string,
): Promise<{ jobId: string; status: unknown }> {
  const queued = await enqueueBackgroundJob({
    kind: 'feed_discovery',
    payload: Object.freeze({}),
    fundId,
    actor: Object.freeze({ type: 'system' }),
    dedupeKey: `feed_discovery:${fundId}`,
  }, admin)
  expect(['pending', 'running']).toContain(queued.status)
  return { jobId: queued.id, status: queued.status }
}

async function prepareDiscoveryScanFixture(input: {
  page: Page
  admin: ReturnType<typeof createLocalInvestmentAdmin>
  fundId: string
  latestItems: readonly unknown[]
}): Promise<{ latestEntryId: number; evidenceEntryId: number }> {
  const evidence = await input.page.evaluate(async () => {
    const response = await fetch('/api/feeds/explore/entries?q=plans%20to%20raise%20cash&limit=100&offset=0')
    return { status: response.status, body: await response.json() }
  })
  expect(evidence.status).toBe(200)
  const evidenceItems = (evidence.body as { data?: { items?: unknown[] } })?.data?.items ?? []
  const explicitRaise = evidenceItems.find(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const row = item as { title?: unknown; summary?: unknown }
    return typeof row.title === 'string'
      && /Kaveri/i.test(row.title)
      && typeof row.summary === 'string'
      && /startup that plans to raise cash for further development/i.test(row.summary)
  })
  const evidenceEntryId = exploreEntryId(explicitRaise)
  expect(Number.isSafeInteger(evidenceEntryId), 'collector fixture must include a recent, explicit open-fundraising article').toBe(true)
  const latestEntryId = Math.max(
    evidenceEntryId!,
    ...input.latestItems.map(exploreEntryId).filter((id): id is number => id !== null),
  )
  const resolved = await resolveDiscoveryAIProvider(input.admin, input.fundId)
  const now = new Date().toISOString()
  const seeded = await input.admin.from('explore_discovery_refresh_state').upsert({
    fund_id: input.fundId,
    scope: 'public_explore',
    watermark_entry_id: evidenceEntryId! - 1,
    watermark_changed_at: now,
    watermark_changed_entry_id: 0,
    watermark_changed_scan_cutoff: null,
    target_semantic_version: resolved.versions.semantic,
    target_classifier_version: resolved.versions.classifier,
    last_error_code: null,
  }, { onConflict: 'fund_id,scope' })
  if (seeded.error) throw new Error(seeded.error.message)
  return { latestEntryId, evidenceEntryId: evidenceEntryId! }
}

async function completeDiscoveryScanFixture(
  admin: ReturnType<typeof createLocalInvestmentAdmin>,
  fundId: string,
  latestEntryId: number,
): Promise<void> {
  const updated = await admin.from('explore_discovery_refresh_state').update({
    // Preserve a bounded recent window so the second real worker run sees
    // enough fresh, multi-source articles to exercise Trending materialization.
    watermark_entry_id: Math.max(0, latestEntryId - 90),
    watermark_changed_at: new Date().toISOString(),
    watermark_changed_entry_id: 0,
    watermark_changed_scan_cutoff: null,
    last_error_code: null,
  }).eq('fund_id', fundId).eq('scope', 'public_explore')
  if (updated.error) throw new Error(updated.error.message)
}

function exploreEntryId(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = (value as { id?: unknown }).id
  if (typeof id !== 'string') return null
  const match = /^explore-entry:(\d+)$/.exec(id)
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

async function assertDiscoveryPersistenceReadable(
  admin: ReturnType<typeof createLocalInvestmentAdmin>,
  fundId: string,
): Promise<void> {
  const state = await admin.from('explore_discovery_refresh_state')
    .select('active_generation_id, last_success_at, last_error_code')
    .eq('fund_id', fundId)
    .eq('scope', 'public_explore')
    .maybeSingle()
  if (state.error) throw new Error(`Discovery refresh state is unreadable: ${state.error.message}`)
  if (!state.data?.active_generation_id) return
  const stored = await admin.from('explore_discovery_items')
    .select('id, kind, result_key, source_entry_refs, metadata_json')
    .eq('fund_id', fundId)
    .eq('generation_id', state.data.active_generation_id)
  if (stored.error) throw new Error(`Discovery generation rows are unreadable: ${stored.error.message}`)
  try {
    await new DiscoveryReadService(admin).list({ fundId, kind: 'trending', limit: 100, offset: 0 })
  } catch (error) {
    throw new Error(`Discovery read service rejected its persisted generation: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function assertProviderNotConfigured(page: DiscoveryPage): void {
  expect(page.refresh).toEqual({
    state: 'degraded',
    reason: 'provider_not_configured',
    retryable: true,
    lastAttemptAt: page.refresh.lastAttemptAt,
  })
  expect(page.refresh.lastAttemptAt === null || !Number.isNaN(Date.parse(page.refresh.lastAttemptAt))).toBe(true)
}

function assertPublishedDiscovery(page: DiscoveryPage, kind: 'trending' | 'deal_signal'): void {
  expect(page.generationId).toMatch(/^[0-9a-f-]{36}$/i)
  expect(page.generatedAt).toEqual(expect.any(String))
  expect(Number.isNaN(Date.parse(page.generatedAt!))).toBe(false)
  expect(page.total).toBeGreaterThanOrEqual(page.items.length)
  expect(page.items.length).toBeLessThanOrEqual(page.limit)
  for (const item of page.items) {
    expect(item.kind).toBe(kind)
    expect(item.generatedAt).toBe(page.generatedAt)
    expect(item.sources.length, `${kind} results must retain source provenance`).toBeGreaterThan(0)
    for (const source of item.sources) {
      expect(source.entryId).toBeGreaterThan(0)
      expect(source.title.trim()).not.toBe('')
      expect(source.sourceTitle.trim()).not.toBe('')
      expect(new URL(source.url).protocol).toMatch(/^https?:$/)
    }
    if (item.kind === 'trending') {
      expect(item.score).toBeGreaterThanOrEqual(0)
      expect(item.score).toBeLessThanOrEqual(100)
      expect(item.metrics.currentWindowHours).toBe(24)
      expect(item.metrics.baselineWindowDays).toBe(7)
      expect(item.metrics.articleCount).toBeGreaterThanOrEqual(item.sources.length)
    } else {
      expect(item.confidence).toBeGreaterThanOrEqual(0)
      expect(item.confidence).toBeLessThanOrEqual(1)
      expect(item.evidence.length).toBeGreaterThan(0)
    }
  }
}

async function readJob(admin: ReturnType<typeof createLocalInvestmentAdmin>, jobId: string): Promise<JobRow> {
  const result = await admin.from('background_jobs')
    .select('id, fund_id, kind, payload, actor_type, actor_user_id, dedupe_key, status, last_error, attempts, max_attempts, available_at, lease_expires_at, created_at, updated_at')
    .eq('id', jobId)
    .maybeSingle()
  if (result.error || !result.data) throw new Error(result.error?.message ?? 'Discovery background job was not found')
  return result.data as JobRow
}

async function assertProviderMaterialization(input: {
  admin: ReturnType<typeof createLocalInvestmentAdmin>
  primaryFundId: string
  secondaryFundId: string
  provider: string
  model: string
  sourceEntryIds: readonly number[]
}): Promise<{ enrichmentCount: number; classificationCount: number; provider: string; model: string }> {
  const sourceEntryIds = Array.from(new Set(input.sourceEntryIds))
  const enrichments = await input.admin.from('explore_article_enrichments')
    .select('id, collector_entry_id, processing_status, semantic_provider, semantic_model')
    .eq('fund_id', input.primaryFundId)
    .in('collector_entry_id', sourceEntryIds)
    .eq('processing_status', 'enriched')
    .eq('semantic_provider', input.provider)
    .eq('semantic_model', input.model)
  if (enrichments.error) throw new Error(enrichments.error.message)
  expect(enrichments.data?.length).toBeGreaterThanOrEqual(sourceEntryIds.length)
  for (const entryId of sourceEntryIds) {
    expect(enrichments.data?.some(row => row.collector_entry_id === entryId)).toBe(true)
  }

  const classifications = await input.admin.from('explore_article_deal_classifications')
    .select('id, enrichment_id, classification_status, classifier_provider, classifier_model')
    .eq('fund_id', input.primaryFundId)
    .in('enrichment_id', (enrichments.data ?? []).map(row => row.id))
    .eq('classification_status', 'classified')
    .eq('classifier_provider', input.provider)
    .eq('classifier_model', input.model)
  if (classifications.error) throw new Error(classifications.error.message)
  expect(classifications.data?.length).toBeGreaterThan(0)

  const secondaryRows = await input.admin.from('explore_article_enrichments')
    .select('id', { count: 'exact' })
    .eq('fund_id', input.secondaryFundId)
    .in('collector_entry_id', sourceEntryIds)
  if (secondaryRows.error) throw new Error(secondaryRows.error.message)
  expect(secondaryRows.count).toBe(0)

  return {
    enrichmentCount: enrichments.data?.length ?? 0,
    classificationCount: classifications.data?.length ?? 0,
    provider: input.provider,
    model: input.model,
  }
}

async function dispatchUntilTerminal(input: {
  admin: ReturnType<typeof createLocalInvestmentAdmin>
  baseURL: string
  jobId: string
}): Promise<{ job: JobRow; sawRunning: boolean }> {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) throw new Error('CRON_SECRET is required to drive the real background dispatcher')
  // A concurrently scheduled real Cron dispatch may already own the same
  // deduplicated five-minute lease. Cover one complete lease recovery plus a
  // bounded worker attempt instead of racing the production scheduler.
  const deadline = Date.now() + 420_000
  let sawRunning = false
  let idleDispatches = 0
  let lastDispatchResult: unknown = null

  while (Date.now() < deadline) {
    const before = await readJob(input.admin, input.jobId)
    sawRunning ||= before.status === 'running'
    if (isTerminal(before.status)) return { job: before, sawRunning }

    let dispatchSettled = false
    let dispatchError: Error | null = null
    const dispatch = fetch(new URL('/api/cron/background-jobs', input.baseURL), {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(280_000),
    }).then(async response => {
      const body = await response.json().catch(() => null)
      lastDispatchResult = body
      if (!response.ok) throw new Error(`Background dispatcher returned HTTP ${response.status}: ${JSON.stringify(body)}`)
      const claimed = Number((body as { claimed?: unknown } | null)?.claimed)
      idleDispatches = claimed > 0 ? 0 : idleDispatches + 1
    }).catch(error => {
      dispatchError = error instanceof Error ? error : new Error(String(error))
    }).finally(() => {
      dispatchSettled = true
    })

    while (!dispatchSettled && Date.now() < deadline) {
      await delay(100)
      const during = await readJob(input.admin, input.jobId)
      sawRunning ||= during.status === 'running'
      if (isTerminal(during.status)) break
    }
    await dispatch
    if (dispatchError) throw dispatchError
    const after = await readJob(input.admin, input.jobId)
    sawRunning ||= after.status === 'running'
    if (isTerminal(after.status)) return { job: after, sawRunning }
    if (
      idleDispatches >= 10
      && after.status === 'pending'
      && after.attempts === 0
      && Date.parse(after.available_at) <= Date.now()
    ) {
      throw new Error(`Background dispatcher did not claim a due Discovery job: ${JSON.stringify({ job: after, dispatcher: lastDispatchResult })}`)
    }
    await delay(500)
  }
  const finalJob = await readJob(input.admin, input.jobId)
  throw new Error(`Timed out waiting for the real Discovery background job to reach a terminal state: ${JSON.stringify(finalJob)}`)
}

function isTerminal(status: JobRow['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function isInspectableLatestArticle(value: unknown): value is {
  title: string
  originalUrl: string
  source: { id: string; title: string }
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  const source = item.source
  if (!source || typeof source !== 'object' || Array.isArray(source)) return false
  if (typeof item.title !== 'string' || !item.title.trim()) return false
  if (typeof (source as Record<string, unknown>).id !== 'string') return false
  if (typeof (source as Record<string, unknown>).title !== 'string') return false
  if (typeof item.originalUrl !== 'string') return false
  try {
    return ['http:', 'https:'].includes(new URL(item.originalUrl).protocol)
  } catch {
    return false
  }
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  await testInfo.attach(name, {
    body: Buffer.from(`${JSON.stringify(value, null, 2)}\n`),
    contentType: 'application/json',
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}
