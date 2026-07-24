import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessContext } from '@/lib/access/effective'
import type { SupabaseClient } from '@supabase/supabase-js'

const resolveSearchFeedStatus = vi.hoisted(() => vi.fn())
const configuredSearxngUrl = vi.hoisted(() => vi.fn(() => 'http://127.0.0.1:8086'))
const checkSearxngAvailability = vi.hoisted(() => vi.fn())

vi.mock('@/lib/search/page-access', () => ({ resolveSearchFeedStatus }))
vi.mock('@/lib/search/searxng/config', () => ({ configuredSearxngUrl, checkSearxngAvailability }))
vi.mock('@/lib/feeds/service', () => ({ FeedService: class FeedService {} }))

const policy = Object.freeze({
  web: true,
  specialized: Object.freeze({
    pubmed: true,
    clinical_trials: true,
    fda: true,
    tctmd: true,
    massdevice: true,
  }),
})

beforeEach(() => {
  vi.clearAllMocks()
  resolveSearchFeedStatus.mockResolvedValue({ connected: true })
  checkSearxngAvailability.mockResolvedValue(true)
})

describe('createSearchRuntime', () => {
  it('returns one registry and matching runnable IDs for every available adapter', async () => {
    const { createSearchRuntime } = await import('./runtime')
    const runtime = await createSearchRuntime({
      admin: {} as SupabaseClient,
      access: {} as AccessContext,
      userId: 'user-1',
      policy,
    })

    expect(Array.from(runtime.registry.ids())).toEqual([
      'feeds', 'pubmed', 'clinical_trials', 'fda', 'web',
    ])
    expect(Array.from(runtime.runnableAdapterIds)).toEqual(Array.from(runtime.registry.ids()))
  })

  it('omits disconnected or unhealthy transports from both outputs', async () => {
    resolveSearchFeedStatus.mockResolvedValueOnce({ connected: false })
    checkSearxngAvailability.mockResolvedValueOnce(false)
    const { createSearchRuntime } = await import('./runtime')
    const runtime = await createSearchRuntime({
      admin: {} as SupabaseClient,
      access: {} as AccessContext,
      userId: 'user-1',
      policy,
    })

    expect(Array.from(runtime.registry.ids())).toEqual(['pubmed', 'clinical_trials', 'fda'])
    expect(Array.from(runtime.runnableAdapterIds)).toEqual(['pubmed', 'clinical_trials', 'fda'])
  })

  it('does not construct adapters disabled by the fund source policy', async () => {
    const { createSearchRuntime } = await import('./runtime')
    const runtime = await createSearchRuntime({
      admin: {} as SupabaseClient,
      access: {} as AccessContext,
      userId: 'user-1',
      policy: {
        web: false,
        specialized: {
          pubmed: false,
          clinical_trials: true,
          fda: false,
          tctmd: true,
          massdevice: true,
        },
      },
    })

    expect(Array.from(runtime.registry.ids())).toEqual(['feeds', 'clinical_trials'])
    expect(Array.from(runtime.runnableAdapterIds)).toEqual(['feeds', 'clinical_trials'])
    expect(configuredSearxngUrl).not.toHaveBeenCalled()
    expect(checkSearxngAvailability).not.toHaveBeenCalled()
  })
})
