import { describe, expect, it } from 'vitest'
import {
  decideServiceCleanup,
  hasAnyExplicitConfiguration,
} from '@/scripts/e2e/lifecycle-policy.mjs'

describe('comprehensive E2E runner lifecycle policy', () => {
  it('uses a local provider only when no related configuration is present', () => {
    const keys = ['API_KEY', 'BASE_URL']
    expect(hasAnyExplicitConfiguration({}, keys)).toBe(false)
    expect(hasAnyExplicitConfiguration({ API_KEY: 'explicit' }, keys)).toBe(true)
    expect(hasAnyExplicitConfiguration({ API_KEY: '  ', BASE_URL: 'https://example.test' }, keys)).toBe(true)
  })

  it('restores existing services whenever a temporary provider was injected', () => {
    expect(decideServiceCleanup({
      ownedLifecycle: false,
      keepServices: false,
      injectedProviders: true,
    })).toBe('restore')
  })

  it('restores owned services kept alive instead of leaving closed provider endpoints', () => {
    expect(decideServiceCleanup({
      ownedLifecycle: true,
      keepServices: true,
      injectedProviders: true,
    })).toBe('restore')
  })

  it('stops owned services when they are not explicitly kept', () => {
    expect(decideServiceCleanup({
      ownedLifecycle: true,
      keepServices: false,
      injectedProviders: true,
    })).toBe('stop')
  })
})
