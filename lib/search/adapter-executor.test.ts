import { describe, expect, it, vi } from 'vitest'
import { SEARCH_ADAPTER_DESCRIPTORS, SearchAdapterError, type SearchAdapter, type SearchCandidate } from './adapter-contracts'
import { AdapterExecutor } from './adapter-executor'
import { AdapterRegistry } from './adapter-registry'

const descriptor = (id: 'pubmed' | 'clinical_trials') => SEARCH_ADAPTER_DESCRIPTORS.find(value => value.id === id)!
const candidate = (id: 'pubmed' | 'clinical_trials'): SearchCandidate => ({
  id: `${id}:1`, origin: 'specialized', title: id, url: `https://example.com/${id}`, source: { id, label: id },
})

describe('AdapterExecutor', () => {
  it('runs adapters concurrently, deduplicates IDs, and preserves canonical source statuses', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    const started: string[] = []
    const make = (id: 'pubmed' | 'clinical_trials'): SearchAdapter => ({
      descriptor: descriptor(id),
      search: vi.fn(async () => {
        started.push(id)
        await gate
        return { candidates: [candidate(id)] }
      }),
    })
    const pubmed = make('pubmed')
    const trials = make('clinical_trials')
    const pending = new AdapterExecutor(new AdapterRegistry([pubmed, trials])).execute(
      ['pubmed', 'clinical_trials', 'pubmed'], 'heart', { fundId: 'fund', userId: 'user' },
    )
    await vi.waitFor(() => expect(started).toHaveLength(2))
    release?.()
    const result = await pending
    expect(result.statuses.map(status => status.id)).toEqual(['pubmed', 'clinical_trials'])
    expect(pubmed.search).toHaveBeenCalledTimes(1)
  })

  it('isolates adapter failures and emits only public errors', async () => {
    const sink = vi.fn()
    const failed: SearchAdapter = {
      descriptor: descriptor('pubmed'),
      search: async () => { throw new SearchAdapterError('rate_limited', 'secret vendor detail') },
    }
    const ok: SearchAdapter = {
      descriptor: descriptor('clinical_trials'),
      search: async () => ({ candidates: [candidate('clinical_trials')] }),
    }
    const result = await new AdapterExecutor(new AdapterRegistry([failed, ok]), { metricSink: sink }).execute(
      ['pubmed', 'clinical_trials'], 'heart', { fundId: 'fund', userId: 'user' },
    )
    expect(result.statuses[0]).toMatchObject({ id: 'pubmed', status: 'rate_limited' })
    expect(result.statuses[1]).toMatchObject({ id: 'clinical_trials', status: 'ok' })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(sink.mock.calls)).not.toContain('heart')
    expect(JSON.stringify(sink.mock.calls)).not.toContain('clinical_trials:1')
  })

  it('rejects mismatched candidates and enforces an independent deadline', async () => {
    const mismatched: SearchAdapter = {
      descriptor: descriptor('pubmed'),
      search: async () => ({ candidates: [candidate('clinical_trials')] }),
    }
    const never: SearchAdapter = {
      descriptor: descriptor('clinical_trials'),
      search: async () => new Promise(() => undefined),
    }
    const executor = new AdapterExecutor(new AdapterRegistry([mismatched, never]), { timeoutMs: 5 })
    const result = await executor.execute(['pubmed', 'clinical_trials'], 'heart', { fundId: 'fund', userId: 'user' })
    expect(result.statuses.map(status => status.status)).toEqual(['invalid_response', 'timeout'])
  })

  it('counts only candidates that survive public result normalization', async () => {
    const adapter: SearchAdapter = {
      descriptor: descriptor('pubmed'),
      search: async () => ({
        candidates: [{ ...candidate('pubmed'), url: 'javascript:alert(1)' }],
      }),
    }
    const result = await new AdapterExecutor(new AdapterRegistry([adapter])).execute(
      ['pubmed'], 'heart', { fundId: 'fund', userId: 'user' },
    )
    expect(result.candidates).toEqual([])
    expect(result.statuses).toEqual([{ id: 'pubmed', status: 'empty', resultCount: 0 }])
  })
})
