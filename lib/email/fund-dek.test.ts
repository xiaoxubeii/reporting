import { describe, expect, it, vi } from 'vitest'
import { decrypt } from '@/lib/crypto'
import { createFundDekResolver } from './fund-dek'

const KEK = '11'.repeat(32)

describe('Fund DEK resolver', () => {
  it('reuses one atomically stored DEK for every secret in a request', async () => {
    let storedEnvelope: string | null = null
    const compareAndSetFundDek = vi.fn(async (_fundId: string, candidate: string) => {
      storedEnvelope ??= candidate
      return storedEnvelope
    })
    const resolveDek = createFundDekResolver({ compareAndSetFundDek }, 'fund-1', KEK)

    const [first, second] = await Promise.all([resolveDek(), resolveDek()])

    expect(first).toBe(second)
    expect(first).toBe(decrypt(storedEnvelope!, KEK))
    expect(compareAndSetFundDek).toHaveBeenCalledOnce()
  })

  it('converges concurrent first-save requests on the database CAS winner', async () => {
    let storedEnvelope: string | null = null
    const store = {
      compareAndSetFundDek: vi.fn(async (_fundId: string, candidate: string) => {
        storedEnvelope ??= candidate
        return storedEnvelope
      }),
    }
    const firstRequest = createFundDekResolver(store, 'fund-1', KEK)
    const secondRequest = createFundDekResolver(store, 'fund-1', KEK)

    const [first, second] = await Promise.all([firstRequest(), secondRequest()])

    expect(first).toBe(second)
    expect(store.compareAndSetFundDek).toHaveBeenCalledTimes(2)
  })
})
