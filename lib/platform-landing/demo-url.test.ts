import { describe, expect, it, vi } from 'vitest'
import { createPlatformLandingConfig } from './config'
import { loadDemoUrl, parseDemoUrl } from './demo-url'

describe('platform landing demo URL', () => {
  it('accepts a credential-free absolute HTTPS URL with path and query', () => {
    expect(parseDemoUrl('https://calendar.example/demo?team=fund')).toBe(
      'https://calendar.example/demo?team=fund',
    )
  })

  it.each([
    undefined,
    '',
    '/demo',
    'http://calendar.example/demo',
    'not a url',
    'https://user:pass@calendar.example/demo',
  ])('rejects an unsafe value: %s', value => {
    expect(parseDemoUrl(value)).toBeNull()
  })

  it('warns at most once for unusable hosted configuration', () => {
    const warn = vi.fn()

    loadDemoUrl(undefined, { hosted: true, warn })
    loadDemoUrl('http://calendar.example', { hosted: true, warn })

    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('does not warn in legacy self-host mode', () => {
    const warn = vi.fn()

    expect(loadDemoUrl(undefined, { hosted: false, warn })).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('creates an immutable server-side landing configuration', () => {
    const config = createPlatformLandingConfig({
      demoUrl: 'https://calendar.example/demo',
      hosted: true,
      platformOrigin: 'https://fundworkspace.example',
    })

    expect(config).toEqual({
      demoUrl: 'https://calendar.example/demo',
      platformOrigin: 'https://fundworkspace.example',
    })
    expect(Object.isFrozen(config)).toBe(true)
  })
})
