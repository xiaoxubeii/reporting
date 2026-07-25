import { describe, expect, it, vi } from 'vitest'
import {
  checkSearxngAvailability,
  configuredSearxngUrl,
} from './config'

describe('Reporting SearXNG configuration', () => {
  it('accepts only a loopback HTTP URL without credentials, query, or fragment', () => {
    expect(configuredSearxngUrl({ REPORTING_SEARXNG_URL: 'http://127.0.0.1:8086/' }))
      .toBe('http://127.0.0.1:8086')
    expect(configuredSearxngUrl({ REPORTING_SEARXNG_URL: 'http://[::1]:8086' }))
      .toBe('http://[::1]:8086')

    for (const value of [
      'https://search.example.com',
      'http://localhost:8086',
      'http://user:pass@127.0.0.1:8086',
      'http://127.0.0.1:8086/path',
      'http://127.0.0.1:8086?q=secret',
      'http://127.0.0.1:8086/#fragment',
    ]) {
      expect(() => configuredSearxngUrl({ REPORTING_SEARXNG_URL: value })).toThrow()
    }
  })

  it('returns null when the dedicated URL is not configured', () => {
    expect(configuredSearxngUrl({})).toBeNull()
  })

  it('checks only the local health endpoint and follows no redirects', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }))
    await expect(checkSearxngAvailability('http://127.0.0.1:8086', fetcher)).resolves.toBe(true)

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:8086/healthz')
    expect(init).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store' })
  })

  it('reports unavailable for non-OK, redirect, timeout, or network failure', async () => {
    await expect(checkSearxngAvailability(
      'http://127.0.0.1:8086',
      vi.fn().mockResolvedValue(new Response('', { status: 503 })),
    )).resolves.toBe(false)
    await expect(checkSearxngAvailability(
      'http://127.0.0.1:8086',
      vi.fn().mockRejectedValue(new Error('connection refused')),
    )).resolves.toBe(false)
  })
})
