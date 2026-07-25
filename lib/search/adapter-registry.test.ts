import { describe, expect, it } from 'vitest'
import { SEARCH_ADAPTER_DESCRIPTORS, type SearchAdapter } from './adapter-contracts'
import { AdapterRegistry } from './adapter-registry'

const PUBMED = SEARCH_ADAPTER_DESCRIPTORS.find(value => value.id === 'pubmed')!
const adapter: SearchAdapter = { descriptor: PUBMED, search: async () => ({ candidates: [] }) }

describe('AdapterRegistry', () => {
  it('registers canonical adapters and rejects duplicates or altered descriptors', () => {
    const registry = new AdapterRegistry([adapter])
    expect(registry.has('pubmed')).toBe(true)
    expect(registry.has('unknown')).toBe(false)
    expect(() => new AdapterRegistry([adapter, adapter])).toThrow('Duplicate')
    expect(() => new AdapterRegistry([{ ...adapter, descriptor: { ...PUBMED, label: 'Changed' } }])).toThrow('canonical')
  })
})
