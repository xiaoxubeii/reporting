import { describe, expect, it } from 'vitest'
import { resolveBrowserSupabaseUrl } from './browser-url'

describe('resolveBrowserSupabaseUrl', () => {
  it('resolves a relative browser URL against the current application origin', () => {
    expect(resolveBrowserSupabaseUrl({
      browserUrl: '/_supabase',
      serverUrl: 'http://127.0.0.1:8000',
      browserOrigin: 'http://localhost:50924',
    })).toBe('http://localhost:50924/_supabase')
  })

  it('falls back to the server URL when no browser override is configured', () => {
    expect(resolveBrowserSupabaseUrl({
      serverUrl: 'http://127.0.0.1:8000/',
      browserOrigin: 'http://localhost:50924',
    })).toBe('http://127.0.0.1:8000')
  })

  it('ignores the development proxy override when the proxy is disabled', () => {
    expect(resolveBrowserSupabaseUrl({
      browserUrl: '/_supabase',
      serverUrl: 'https://project-ref.supabase.co',
      browserOrigin: 'https://reporting.example.com',
      allowRelativeProxy: false,
    })).toBe('https://project-ref.supabase.co')
  })

  it.each([
    'javascript:alert(1)',
    'https://auth.example.com',
    '//evil.example',
    '/\\evil.example',
    '/_supabase?redirect=https://evil.example',
    '/_supabase/../api',
    '/_supabase/%2e%2e/api',
  ])('rejects an unsafe browser URL: %s', browserUrl => {
    expect(() => resolveBrowserSupabaseUrl({
      browserUrl,
      serverUrl: 'http://127.0.0.1:8000',
      browserOrigin: 'http://localhost:50924',
    })).toThrow('Invalid Supabase browser URL')
  })
})
