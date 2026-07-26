import { afterEach, describe, expect, it, vi } from 'vitest'
import { mayManagePlatformExperts } from './platform-admin'

afterEach(() => vi.unstubAllEnvs())

describe('platform expert administration', () => {
  it('allows only an administrator of the configured operations fund', () => {
    vi.stubEnv('EXPERT_GLOBAL_ADMIN_FUND_ID', 'fund-ops')

    expect(mayManagePlatformExperts('fund-ops', 'admin')).toBe(true)
    expect(mayManagePlatformExperts('fund-ops', 'member')).toBe(false)
    expect(mayManagePlatformExperts('fund-other', 'admin')).toBe(false)
  })

  it('fails closed when the operations fund is not configured', () => {
    vi.stubEnv('EXPERT_GLOBAL_ADMIN_FUND_ID', '')
    expect(mayManagePlatformExperts('fund-ops', 'admin')).toBe(false)
  })
})
