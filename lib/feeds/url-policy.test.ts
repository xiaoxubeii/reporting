import { describe, expect, it, vi } from 'vitest'
import { assertPublicDiscoveryUrl, normalizeDiscoveryUrl, normalizeMinifluxBaseUrl } from './url-policy'

describe('normalizeMinifluxBaseUrl', () => {
  it('requires HTTPS, removes a trailing slash, and rejects credentials', () => {
    vi.stubEnv('MINIFLUX_ALLOW_INSECURE_HTTP', 'false')
    try {
      expect(normalizeMinifluxBaseUrl(' https://feeds.example.com/ ')).toBe('https://feeds.example.com')
      expect(() => normalizeMinifluxBaseUrl('http://feeds.example.com')).toThrow(/https/i)
      expect(() => normalizeMinifluxBaseUrl('https://user:pass@feeds.example.com')).toThrow(/credentials/i)
      expect(() => normalizeMinifluxBaseUrl('file:///tmp/miniflux')).toThrow(/http/i)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('normalizeDiscoveryUrl', () => {
  it('normalizes a public website URL', () => {
    expect(normalizeDiscoveryUrl('example.com/news')).toBe('https://example.com/news')
  })

  it.each([
    'http://localhost/feed.xml',
    'http://127.0.0.1/feed.xml',
    'http://10.1.2.3/feed.xml',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/feed.xml',
    'http://[::ffff:127.0.0.1]/feed.xml',
  ])('rejects private or metadata targets: %s', (value) => {
    expect(() => normalizeDiscoveryUrl(value)).toThrow(/public|private|local/i)
  })

  it('rejects embedded credentials and non-http schemes', () => {
    expect(() => normalizeDiscoveryUrl('https://user:pass@example.com/feed')).toThrow(/credentials/i)
    expect(() => normalizeDiscoveryUrl('javascript:alert(1)')).toThrow(/http/i)
  })

  it('rejects hostnames whose DNS answers include a private address', async () => {
    await expect(assertPublicDiscoveryUrl('https://news.example/feed', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.8', family: 4 },
    ])).rejects.toThrow(/private|public/i)
  })

  it('accepts a hostname only when every DNS answer is public', async () => {
    await expect(assertPublicDiscoveryUrl('https://news.example/feed', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ])).resolves.toBe('https://news.example/feed')
  })
})
