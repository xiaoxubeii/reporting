import { describe, expect, it, vi } from 'vitest'
import { SearxngWebSearchAdapter } from './web'

const context = () => ({ fundId: 'fund-1', userId: 'user-1', signal: new AbortController().signal })
const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

describe('SearxngWebSearchAdapter', () => {
  it('POSTs fixed General and News controls and returns bounded safe candidates', async () => {
    const results = Array.from({ length: 12 }, (_, index) => ({
      title: `<b>Result ${index}</b>`, url: `https://example.com/${index}`, content: `<p>Snippet ${index}</p>`, engine: 'bing',
    }))
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ results, unresponsive_engines: [] }))
    const response = await new SearxngWebSearchAdapter('http://127.0.0.1:8086', fetcher).search({ query: 'devices', limit: 10 }, context())
    expect(response.candidates).toHaveLength(10)
    expect(response.candidates[0]).toMatchObject({ origin: 'web', title: 'Result 0', source: { id: 'web' } })
    const body = new URLSearchParams(String(fetcher.mock.calls[0][1].body))
    expect(body.get('engines')).toBe('bing,duckduckgo,brave,startpage,bing news,duckduckgo news,brave.news,startpage news')
  })

  it('keeps usable aggregate results despite internal engine failure', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      results: [{ title: 'One', url: 'https://example.com/one' }], unresponsive_engines: [['bing', 'timeout']],
    }))
    await expect(new SearxngWebSearchAdapter('http://127.0.0.1:8086', fetcher).search({ query: 'one', limit: 10 }, context()))
      .resolves.toMatchObject({ candidates: [{ title: 'One' }] })
  })

  it('fails when all engines fail and returns empty after unsafe candidates are dropped', async () => {
    const failed = vi.fn().mockResolvedValue(jsonResponse({ results: [], unresponsive_engines: [['bing', 'timeout']] }))
    await expect(new SearxngWebSearchAdapter('http://127.0.0.1:8086', failed).search({ query: 'one', limit: 10 }, context())).rejects.toMatchObject({ code: 'failed' })
    const empty = vi.fn().mockResolvedValue(jsonResponse({ results: [{ title: 'Local', url: 'http://127.0.0.1/admin' }], unresponsive_engines: [] }))
    await expect(new SearxngWebSearchAdapter('http://127.0.0.1:8086', empty).search({ query: 'one', limit: 10 }, context())).resolves.toEqual({ candidates: [] })
  })

  it.each([[429, 'rate_limited'], [500, 'failed']] as const)('normalizes HTTP %s', async (status, code) => {
    const adapter = new SearxngWebSearchAdapter('http://127.0.0.1:8086', vi.fn().mockResolvedValue(jsonResponse({}, status)))
    await expect(adapter.search({ query: 'q', limit: 10 }, context())).rejects.toMatchObject({ code })
  })

  it('rejects invalid response shapes and normalizes aborts', async () => {
    const invalid = new SearxngWebSearchAdapter('http://127.0.0.1:8086', vi.fn().mockResolvedValue(jsonResponse({ results: 'bad' })))
    await expect(invalid.search({ query: 'q', limit: 10 }, context())).rejects.toMatchObject({ code: 'invalid_response' })
    const aborted = new SearxngWebSearchAdapter('http://127.0.0.1:8086', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')))
    await expect(aborted.search({ query: 'q', limit: 10 }, context())).rejects.toMatchObject({ code: 'timeout' })
  })
})
