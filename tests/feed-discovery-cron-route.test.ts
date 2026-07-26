import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const scheduleFeedDiscoveryJobs = vi.hoisted(() => vi.fn())
vi.mock('@/lib/background-jobs/feed-discovery-scheduler', () => ({ scheduleFeedDiscoveryJobs }))

import { GET } from '../app/api/cron/feeds-discovery/route'

describe('feeds discovery Cron route', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-test-secret'
    scheduleFeedDiscoveryJobs.mockResolvedValue({ eligible: 2, scheduled: 2 })
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
    vi.clearAllMocks()
  })

  it('rejects a missing or incorrect bearer before invoking discovery', async () => {
    const response = await GET(new Request('http://localhost/api/cron/feeds-discovery'))
    expect(response.status).toBe(401)
    expect(scheduleFeedDiscoveryJobs).not.toHaveBeenCalled()
  })

  it('returns only a bounded aggregate scheduling outcome', async () => {
    const response = await GET(new Request('http://localhost/api/cron/feeds-discovery', {
      headers: { authorization: 'Bearer cron-test-secret' },
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { eligible: 2, scheduled: 2 } })
    expect(scheduleFeedDiscoveryJobs).toHaveBeenCalledWith()
  })

  it('rejects any caller-selected fund query without scheduling', async () => {
    const response = await GET(new Request('http://localhost/api/cron/feeds-discovery?fundId=attacker', {
      headers: { authorization: 'Bearer cron-test-secret' },
    }))
    expect(response.status).toBe(400)
    expect(scheduleFeedDiscoveryJobs).not.toHaveBeenCalled()
  })

  it('reports a controlled scheduling failure without exposing internal errors', async () => {
    scheduleFeedDiscoveryJobs.mockRejectedValueOnce(new Error('database secret'))
    const response = await GET(new Request('http://localhost/api/cron/feeds-discovery', {
      headers: { authorization: 'Bearer cron-test-secret' },
    }))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ success: false, error: 'Feed discovery scheduling failed' })
  })
})
