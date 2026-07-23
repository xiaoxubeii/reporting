import { describe, expect, it, vi } from 'vitest'
import { instrumentSpecializedProvider, instrumentWebProvider } from './instrumentation'

describe('search provider instrumentation', () => {
  it('reports only source metadata and never the query or result body', async () => {
    const sink = vi.fn()
    const provider = instrumentWebProvider({
      search: async () => ({
        candidates: [{ id: 'private', origin: 'web', title: 'Confidential result', url: 'https://example.com', source: { id: 'web', label: 'Web' } }],
        statuses: [{ id: 'web', status: 'ok', resultCount: 1 }],
      }),
    }, sink)
    await provider.search({ query: 'secret query' }, { fundId: 'fund', userId: 'user', signal: new AbortController().signal })

    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ source: 'web', outcome: 'ok', resultCount: 1 }))
    expect(JSON.stringify(sink.mock.calls)).not.toContain('secret query')
    expect(JSON.stringify(sink.mock.calls)).not.toContain('Confidential result')
  })

  it('emits a bounded metric for every selected professional source on rejection', async () => {
    const sink = vi.fn()
    const provider = instrumentSpecializedProvider({ search: async () => { throw new Error('private') } }, sink)
    await expect(provider.search(
      { query: 'q', sources: ['pubmed', 'fda'] },
      { fundId: 'fund', userId: 'user', signal: new AbortController().signal },
    )).rejects.toThrow()
    expect(sink.mock.calls.map(call => call[0].source)).toEqual(['pubmed', 'fda'])
    expect(sink.mock.calls.every(call => call[0].outcome === 'rejected')).toBe(true)
  })
})
