import { describe, expect, it } from 'vitest'
import { parseConfirmation, parseDiscoverySearch } from './validation'

describe('expert discovery input validation', () => {
  it('accepts only the fixed discovery source allowlist', () => {
    expect(parseDiscoverySearch({ query: 'cardiac AI', sourceIds: ['pubmed', 'clinical_trials'] })).toEqual({ query: 'cardiac AI', sourceIds: ['pubmed', 'clinical_trials'] })
    expect(() => parseDiscoverySearch({ query: 'cardiac AI', sourceIds: ['https://attacker.test'] })).toThrow('Unsupported discovery source')
  })

  it('requires an explicit valid email at confirmation time', () => {
    expect(() => parseConfirmation({ name: 'Ada', email: '', profileText: 'Cardiology' })).toThrow('Invalid email')
    expect(parseConfirmation({ name: 'Ada', email: 'ADA@EXAMPLE.COM', profileText: 'Cardiology' }).email).toBe('ada@example.com')
  })
})
