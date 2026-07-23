import { describe, expect, it, vi } from 'vitest'
import fixture from './__fixtures__/clinical-trials.json'
import { ClinicalTrialsApiAdapter } from './clinical-trials'

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

describe('ClinicalTrialsApiAdapter', () => {
  it('uses the fixed API v2 endpoint and normalizes at most five NCT records', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(fixture))
    const result = await new ClinicalTrialsApiAdapter(fetcher)
      .search({ query: 'cardiac device', limit: 99 }, context())

    expect(result.candidates).toEqual([
      expect.objectContaining({
        id: 'clinical_trials:NCT01234567',
        origin: 'specialized',
        title: 'Device feasibility study',
        url: 'https://clinicaltrials.gov/study/NCT01234567',
        snippet: 'A controlled feasibility study.',
        publishedAt: '2026-07-18T00:00:00.000Z',
        source: { id: 'clinical_trials', label: 'ClinicalTrials.gov' },
        identifiers: { nct: 'NCT01234567' },
      }),
      expect.objectContaining({
        id: 'clinical_trials:NCT07654321',
        title: 'Official-only title',
        identifiers: { nct: 'NCT07654321' },
      }),
    ])

    const url = new URL(String(fetcher.mock.calls[0]?.[0]))
    expect(`${url.origin}${url.pathname}`).toBe('https://clinicaltrials.gov/api/v2/studies')
    expect(url.searchParams.get('query.term')).toBe('cardiac device')
    expect(url.searchParams.get('pageSize')).toBe('5')
    expect(url.searchParams.get('format')).toBe('json')
    expect(url.searchParams.has('pageToken')).toBe(false)
  })

  it('caps normalization even if the upstream returns more than five studies', async () => {
    const studies = Array.from({ length: 7 }, (_, index) => ({
      protocolSection: {
        identificationModule: {
          nctId: `NCT${String(index + 1).padStart(8, '0')}`,
          briefTitle: `Study ${index + 1}`,
        },
      },
    }))
    const result = await new ClinicalTrialsApiAdapter(
      vi.fn().mockResolvedValue(jsonResponse({ studies })),
    ).search({ query: 'query', limit: 100 }, context())
    expect(result.candidates).toHaveLength(5)
  })

  it('rejects malformed records and non-JSON responses', async () => {
    const malformed = new ClinicalTrialsApiAdapter(
      vi.fn().mockResolvedValue(jsonResponse({ studies: [{ protocolSection: {} }] })),
    )
    await expect(malformed.search({ query: 'query', limit: 5 }, context()))
      .rejects.toMatchObject({ code: 'invalid_response' })

    const html = new ClinicalTrialsApiAdapter(
      vi.fn().mockResolvedValue(new Response('<html>error</html>', {
        headers: { 'Content-Type': 'text/html' },
      })),
    )
    await expect(html.search({ query: 'query', limit: 5 }, context()))
      .rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('passes a cancellable signal and normalizes cancellation as timeout', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      controller.abort(new DOMException('cancelled', 'AbortError'))
    }))
    await expect(new ClinicalTrialsApiAdapter(fetcher)
      .search({ query: 'query', limit: 5 }, context(controller.signal)))
      .rejects.toMatchObject({ code: 'timeout' })
  })
})
