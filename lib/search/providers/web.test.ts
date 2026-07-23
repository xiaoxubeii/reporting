import { describe, expect, it, vi } from 'vitest'
import { SearxngWebSearchProvider } from './web'

const context = () => ({
  fundId: 'fund-1',
  userId: 'user-1',
  signal: new AbortController().signal,
})

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('SearxngWebSearchProvider', () => {
  it('POSTs fixed JSON General+News controls and normalizes at most ten safe results', async () => {
    const results = Array.from({ length: 12 }, (_, index) => ({
      title: `<b>Result ${index}</b>`,
      url: `https://example.com/${index}`,
      content: `<p>Snippet ${index}</p>`,
      engine: index % 2 ? 'bing' : 'duckduckgo',
      publishedDate: '2026-07-20T12:00:00Z',
    }))
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ results, unresponsive_engines: [] }))
    const provider = new SearxngWebSearchProvider('http://127.0.0.1:8086', fetcher)

    const response = await provider.search({ query: 'medical devices' }, context())

    expect(response.candidates).toHaveLength(10)
    expect(response.candidates[0]).toMatchObject({
      origin: 'web',
      title: 'Result 0',
      snippet: 'Snippet 0',
      url: 'https://example.com/0',
      source: { id: 'web', label: 'Web · duckduckgo' },
    })
    expect(response.statuses).toEqual([{ id: 'web', status: 'ok', resultCount: 10 }])

    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:8086/search')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store' })
    const body = new URLSearchParams(String(init.body))
    expect(Object.fromEntries(body)).toMatchObject({
      q: 'medical devices',
      format: 'json',
      categories: 'general,news',
      safesearch: '1',
      pageno: '1',
      engines: 'bing,duckduckgo,brave,startpage,bing news,duckduckgo news,brave.news,startpage news',
    })
  })

  it('reports partial when engines fail but valid results remain', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      results: [{ title: 'One', url: 'https://example.com/one', content: '' }],
      unresponsive_engines: [['bing', 'timeout']],
    }))
    const response = await new SearxngWebSearchProvider('http://127.0.0.1:8086', fetcher)
      .search({ query: 'one' }, context())
    expect(response.statuses).toEqual([{ id: 'web', status: 'partial', resultCount: 1 }])
  })

  it('returns empty and drops unsafe or malformed candidates without forwarding raw fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      results: [
        { title: 'Local', url: 'http://127.0.0.1/admin', content: 'nope' },
        { title: '', url: 'https://example.com/missing-title' },
      ],
      unresponsive_engines: [],
      query: 'must not be forwarded',
    }))
    const response = await new SearxngWebSearchProvider('http://127.0.0.1:8086', fetcher)
      .search({ query: 'nothing' }, context())
    expect(response).toEqual({ candidates: [], statuses: [{ id: 'web', status: 'empty', resultCount: 0 }] })
  })

  it.each([
    [429, 'rate_limited'],
    [500, 'failed'],
  ] as const)('normalizes HTTP %s', async (status, code) => {
    const provider = new SearxngWebSearchProvider(
      'http://127.0.0.1:8086',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'upstream detail' }, status)),
    )
    await expect(provider.search({ query: 'query' }, context()))
      .rejects.toMatchObject({ code })
  })

  it('rejects non-JSON and malformed JSON response shapes', async () => {
    const wrongType = new SearxngWebSearchProvider(
      'http://127.0.0.1:8086',
      vi.fn().mockResolvedValue(new Response('<html>bad</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })),
    )
    await expect(wrongType.search({ query: 'query' }, context()))
      .rejects.toEqual(expect.objectContaining({ code: 'invalid_response' }))

    const wrongShape = new SearxngWebSearchProvider(
      'http://127.0.0.1:8086',
      vi.fn().mockResolvedValue(jsonResponse({ results: 'bad' })),
    )
    await expect(wrongShape.search({ query: 'query' }, context()))
      .rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('normalizes aborted requests as a timeout', async () => {
    const provider = new SearxngWebSearchProvider(
      'http://127.0.0.1:8086',
      vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')),
    )
    await expect(provider.search({ query: 'query' }, context()))
      .rejects.toMatchObject({ code: 'timeout' })
  })
})
