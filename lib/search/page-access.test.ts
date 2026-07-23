import { describe, expect, it, vi } from 'vitest'
import type { AccessContext } from '@/lib/access/effective'
import { DEFAULT_FEATURE_VISIBILITY } from '@/lib/types/features'
import { resolveSearchFeedStatus } from './page-access'

function access(feeds: 'off' | 'everyone'): AccessContext {
  return {
    fundId: 'fund-1',
    userId: 'user-1',
    role: 'member',
    features: { ...DEFAULT_FEATURE_VISIBILITY, search: 'everyone', feeds },
    grants: { dealflow: 'read' },
    defaults: {},
  }
}

describe('Search page Feed access', () => {
  it('does not resolve a Miniflux connection when the caller lacks Feeds read access', async () => {
    const connectionStatus = vi.fn(async () => ({ connected: true }))

    const status = await resolveSearchFeedStatus(
      access('off'),
      'user-1',
      { connectionStatus },
    )

    expect(status).toBeNull()
    expect(connectionStatus).not.toHaveBeenCalled()
  })

  it('checks the caller-scoped connection only after Feeds read access is established', async () => {
    const connectionStatus = vi.fn(async () => ({ connected: true }))

    const status = await resolveSearchFeedStatus(
      access('everyone'),
      'user-1',
      { connectionStatus },
    )

    expect(status).toEqual({ connected: true })
    expect(connectionStatus).toHaveBeenCalledWith('user-1')
  })
})
