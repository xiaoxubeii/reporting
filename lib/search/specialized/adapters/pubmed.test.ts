import { describe, expect, it, vi } from 'vitest'
import searchFixture from './__fixtures__/pubmed-search.json'
import summaryFixture from './__fixtures__/pubmed-summary.json'
import { PubMedApiAdapter } from './pubmed'

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

describe('PubMedApiAdapter', () => {
  it('runs fixed ESearch and ESummary requests and normalizes PMID/DOI candidates', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(searchFixture))
      .mockResolvedValueOnce(jsonResponse(summaryFixture))

    const result = await new PubMedApiAdapter(fetcher)
      .search({ query: 'medical device', limit: 100 }, context())

    expect(result.candidates).toEqual([
      expect.objectContaining({
        id: 'pubmed:40710387',
        origin: 'specialized',
        title: 'Safe medical device study',
        url: 'https://pubmed.ncbi.nlm.nih.gov/40710387/',
        source: { id: 'pubmed', label: 'PubMed' },
        identifiers: { pmid: '40710387', doi: '10.1000/device.123' },
      }),
      expect.objectContaining({
        id: 'pubmed:40709295',
        identifiers: { pmid: '40709295' },
      }),
    ])

    const searchUrl = new URL(String(fetcher.mock.calls[0]?.[0]))
    expect(`${searchUrl.origin}${searchUrl.pathname}`).toBe(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
    )
    expect(Object.fromEntries(searchUrl.searchParams)).toMatchObject({
      db: 'pubmed',
      term: 'medical device',
      retmax: '5',
      retmode: 'json',
      sort: 'relevance',
    })

    const summaryUrl = new URL(String(fetcher.mock.calls[1]?.[0]))
    expect(`${summaryUrl.origin}${summaryUrl.pathname}`).toBe(
      'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
    )
    expect(summaryUrl.searchParams.get('id')).toBe('40710387,40709295')
    expect(summaryUrl.searchParams.get('retmode')).toBe('json')
  })

  it('does not call ESummary when ESearch is empty', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ esearchresult: { idlist: [] } }))
    const result = await new PubMedApiAdapter(fetcher)
      .search({ query: 'no matches', limit: 5 }, context())
    expect(result).toEqual({ candidates: [] })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed ESearch and ESummary payloads', async () => {
    await expect(new PubMedApiAdapter(vi.fn().mockResolvedValue(jsonResponse({ idlist: [] })))
      .search({ query: 'query', limit: 5 }, context()))
      .rejects.toMatchObject({ code: 'invalid_response' })

    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(searchFixture))
      .mockResolvedValueOnce(jsonResponse({ result: { uids: ['40710387'] } }))
    await expect(new PubMedApiAdapter(fetcher).search({ query: 'query', limit: 5 }, context()))
      .rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('normalizes rate limiting and caller cancellation without logging raw queries', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const limited = new PubMedApiAdapter(vi.fn().mockResolvedValue(jsonResponse({}, 429)))
    await expect(limited.search({ query: 'private acquisition target', limit: 5 }, context()))
      .rejects.toMatchObject({ code: 'rate_limited' })

    const controller = new AbortController()
    controller.abort(new DOMException('cancelled', 'AbortError'))
    const cancelled = new PubMedApiAdapter(vi.fn(async (_input, init) => {
      throw (init?.signal as AbortSignal).reason
    }))
    await expect(cancelled.search({ query: 'private acquisition target', limit: 5 }, context(controller.signal)))
      .rejects.toMatchObject({ code: 'timeout' })
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })
})
