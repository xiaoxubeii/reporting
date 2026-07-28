import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveDiscoveryAIProvider = vi.hoisted(() => vi.fn())

vi.mock('./provider', () => ({ resolveDiscoveryAIProvider }))

import { DiscoveryRuntimeStore } from './runtime-store'

const FUND_ID = '00000000-0000-4000-8000-000000000001'
const EMPTY_STATE = Object.freeze({
  activeGenerationId: null,
  generatedAt: null,
  lastAttemptAt: null,
  lastErrorCode: null,
})

function adminWithNoJob() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.limit.mockReturnValue(query)
  return { admin: { from: vi.fn(() => query) }, query }
}

describe('DiscoveryRuntimeStore refresh status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports unusable encrypted provider settings as a retryable configuration failure', async () => {
    resolveDiscoveryAIProvider.mockRejectedValueOnce(new Error('decryption failed'))
    const { admin } = adminWithNoJob()
    const store = new DiscoveryRuntimeStore(FUND_ID, admin as never)

    await expect(store.readStatus(EMPTY_STATE, true)).resolves.toEqual({
      state: 'degraded',
      reason: 'provider_not_configured',
      retryable: true,
      lastAttemptAt: null,
    })
  })

  it('reports a validated provider with no results as stale rather than configured by field presence alone', async () => {
    resolveDiscoveryAIProvider.mockResolvedValueOnce({ providerType: 'openai' })
    const { admin } = adminWithNoJob()
    const store = new DiscoveryRuntimeStore(FUND_ID, admin as never)

    await expect(store.readStatus(EMPTY_STATE, true)).resolves.toMatchObject({
      state: 'stale',
      reason: 'results_stale',
      retryable: true,
    })
  })
})
