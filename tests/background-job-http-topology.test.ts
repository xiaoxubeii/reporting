import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dispatcher = readFileSync(new URL('../lib/background-jobs/dispatcher.ts', import.meta.url), 'utf8')
const cronConfig = readFileSync(new URL('../scripts/cron-runner/config.mjs', import.meta.url), 'utf8')
const registry = readFileSync(new URL('../lib/background-jobs/registry.ts', import.meta.url), 'utf8')
const context = readFileSync(new URL('../lib/background-jobs/context.ts', import.meta.url), 'utf8')
const token = readFileSync(new URL('../lib/background-jobs/token.ts', import.meta.url), 'utf8')
const feedWorker = readFileSync(new URL('../lib/background-jobs/feed-discovery-worker.ts', import.meta.url), 'utf8')
const feedCron = readFileSync(new URL('../app/api/cron/feeds-discovery/route.ts', import.meta.url), 'utf8')
const dispatcherCron = readFileSync(new URL('../app/api/cron/background-jobs/route.ts', import.meta.url), 'utf8')

describe('generic background-job HTTP topology', () => {
  it('dispatches registry-owned kinds instead of a Deal Research literal', () => {
    expect(dispatcher).toContain('validateBackgroundJobRegistry(registry)')
    expect(dispatcher).toContain('policies.map(policy => policy.kind)')
    expect(dispatcher).not.toContain("claimDue('deal_research'")
    expect(dispatcher).not.toContain("backgroundJobPolicy('deal_research'")
    expect(dispatcher).not.toContain("kind === 'deal_research'")
    expect(context).not.toContain("kind === 'deal_research'")
    expect(token).not.toContain('reporting-deal-research-worker')
  })

  it('uses generic Cron and internal worker namespaces', () => {
    expect(cronConfig).toContain("name: 'background-jobs'")
    expect(cronConfig).toContain("path: '/api/cron/background-jobs'")
    expect(dispatcherCron).toContain("export const dynamic = 'force-dynamic'")
    expect(registry).toContain("workerPath: '/api/internal/background-jobs/deal-research/run'")
    expect(registry).toContain("workerPath: '/api/internal/background-jobs/feed-discovery/run'")
  })

  it('keeps Feed Discovery fund authority in signed persisted job context', () => {
    expect(feedCron).toContain('scheduleFeedDiscoveryJobs()')
    expect(feedCron).not.toContain('runFeedDiscoveryRefresh')
    expect(feedCron).not.toContain("searchParams.get('fundId')")
    expect(feedWorker).toContain('runRefresh(context.fundId)')
    expect(feedWorker).not.toContain("searchParams.get('fundId')")
  })
})
