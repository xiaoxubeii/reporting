import { describe, expect, it, vi } from 'vitest'
import fixture from './__fixtures__/fda-510k.json'
import { Fda510kApiAdapter } from './fda-510k'

const context = (signal = new AbortController().signal) => ({
  fundId: 'fund-1',
  userId: 'user-1',
  signal,
})

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Fda510kApiAdapter', () => {
  it('uses only the openFDA 510(k) endpoint and normalizes k_number identifiers', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(fixture))
    const result = await new Fda510kApiAdapter(fetcher)
      .search({ query: 'cardiac monitor', limit: 50 }, context())

    expect(result.candidates).toEqual([
      expect.objectContaining({
        id: 'fda:K261234',
        origin: 'specialized',
        title: 'Cardiac Monitor',
        snippet: 'Example Medical Inc. · Product code DSI · Traditional',
        publishedAt: '2026-07-18T00:00:00.000Z',
        source: { id: 'fda', label: 'FDA/openFDA · 510(k)' },
        identifiers: { fdaId: 'K261234' },
      }),
      expect.objectContaining({
        id: 'fda:K261235',
        identifiers: { fdaId: 'K261235' },
      }),
    ])

    const url = new URL(String(fetcher.mock.calls[0]?.[0]))
    expect(`${url.origin}${url.pathname}`).toBe('https://api.fda.gov/device/510k.json')
    expect(url.searchParams.get('limit')).toBe('5')
    expect(url.searchParams.get('search')).toContain('device_name:"cardiac monitor"')
    expect(url.searchParams.has('skip')).toBe(false)
  })

  it('escapes openFDA syntax rather than allowing a query to add fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ results: [] }))
    await new Fda510kApiAdapter(fetcher)
      .search({ query: 'pump" OR applicant:*', limit: 5 }, context())
    const search = new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.get('search') ?? ''
    expect(search).toContain('pump\\" OR applicant\\:\\*')
    expect(search).not.toContain('applicant:*')
  })

  it('returns empty for the documented openFDA no-match 404 and caps results to five', async () => {
    const noMatch = new Fda510kApiAdapter(
      vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'NOT_FOUND' } }, 404)),
    )
    await expect(noMatch.search({ query: 'nothing', limit: 5 }, context()))
      .resolves.toEqual({ candidates: [] })

    const results = Array.from({ length: 7 }, (_, index) => ({
      k_number: `K${String(index + 1).padStart(6, '0')}`,
      device_name: `Device ${index + 1}`,
    }))
    const capped = await new Fda510kApiAdapter(
      vi.fn().mockResolvedValue(jsonResponse({ results })),
    ).search({ query: 'device', limit: 99 }, context())
    expect(capped.candidates).toHaveLength(5)
  })

  it('does not hide an unrelated 404 as an empty result', async () => {
    const missingEndpoint = new Fda510kApiAdapter(
      vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'MISSING_ENDPOINT' } }, 404)),
    )
    await expect(missingEndpoint.search({ query: 'query', limit: 5 }, context()))
      .rejects.toMatchObject({ code: 'failed', upstreamStatus: 404 })
  })

  it('rejects malformed records and normalizes rate limits', async () => {
    const malformed = new Fda510kApiAdapter(
      vi.fn().mockResolvedValue(jsonResponse({ results: [{ device_name: 'Missing ID' }] })),
    )
    await expect(malformed.search({ query: 'query', limit: 5 }, context()))
      .rejects.toMatchObject({ code: 'invalid_response' })

    const limited = new Fda510kApiAdapter(
      vi.fn().mockResolvedValue(jsonResponse({}, 429)),
    )
    await expect(limited.search({ query: 'query', limit: 5 }, context()))
      .rejects.toMatchObject({ code: 'rate_limited' })
  })
})
