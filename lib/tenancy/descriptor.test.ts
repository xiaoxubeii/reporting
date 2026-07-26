import { describe, expect, it, vi } from 'vitest'
import { TenantDescriptorCache, loadTenantDescriptor } from './descriptor'

const alpha = {
  id: '82000000-0000-4000-8000-000000000001',
  slug: 'alpha-fund',
  name: 'Alpha Fund',
  logo_url: 'https://assets.example.test/alpha.png',
  theme: { accent: '217 91% 60%' },
}
const alphaDescriptor = {
  id: alpha.id,
  slug: alpha.slug,
  name: alpha.name,
  logoUrl: alpha.logo_url,
  theme: alpha.theme,
}

describe('TenantDescriptorCache', () => {
  it('keys successful descriptors by trusted slug without cross-Fund bleed', async () => {
    const betaId = '82000000-0000-4000-8000-000000000002'
    const load = vi.fn(async (slug: string) => slug === 'alpha-fund'
      ? alphaDescriptor
      : { ...alphaDescriptor, id: betaId, slug, name: 'Beta' })
    const cache = new TenantDescriptorCache({ ttlMs: 1000, now: () => 10 })

    expect((await cache.resolve('alpha-fund', load))?.id).toBe(alpha.id)
    expect((await cache.resolve('beta-fund', load))?.id).toBe(betaId)
    expect((await cache.resolve('alpha-fund', load))?.name).toBe('Alpha Fund')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent exact-slug loads and expires entries', async () => {
    let now = 10
    const load = vi.fn(async () => alphaDescriptor)
    const cache = new TenantDescriptorCache({ ttlMs: 50, now: () => now })

    const [first, second] = await Promise.all([
      cache.resolve('alpha-fund', load),
      cache.resolve('alpha-fund', load),
    ])
    expect(first).toEqual(second)
    expect(load).toHaveBeenCalledTimes(1)

    now = 61
    await cache.resolve('alpha-fund', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('bounds completed tenant descriptors and reloads an evicted slug', async () => {
    const load = vi.fn(async (slug: string) => ({
      ...alphaDescriptor,
      id: slug === 'alpha-fund'
        ? alpha.id
        : `82000000-0000-4000-8000-00000000000${slug === 'beta-fund' ? '2' : '3'}`,
      slug,
      name: slug,
    }))
    const cache = new TenantDescriptorCache({ ttlMs: 1000, maxEntries: 2, now: () => 10 })

    await cache.resolve('alpha-fund', load)
    await cache.resolve('beta-fund', load)
    await cache.resolve('gamma-fund', load)
    await cache.resolve('alpha-fund', load)

    expect(load).toHaveBeenCalledTimes(4)
  })

  it('fails closed when the resolver returns a different slug or malformed identity', async () => {
    const cache = new TenantDescriptorCache()
    await expect(cache.resolve('alpha-fund', async () => ({ ...alphaDescriptor, slug: 'beta-fund' })))
      .rejects.toThrow('Tenant descriptor does not match trusted slug')
    await expect(cache.resolve('alpha-fund', async () => ({ ...alphaDescriptor, id: 'not-a-uuid' })))
      .rejects.toThrow('Invalid tenant descriptor')
  })

  it('does not cache resolver failures', async () => {
    const cache = new TenantDescriptorCache()
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(alphaDescriptor)

    await expect(cache.resolve('alpha-fund', load)).rejects.toThrow('database unavailable')
    await expect(cache.resolve('alpha-fund', load)).resolves.toMatchObject({ id: alpha.id })
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('loadTenantDescriptor', () => {
  it('uses the least-privilege exact-slug RPC and maps public fields', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [alpha], error: null })
    await expect(loadTenantDescriptor({ rpc } as never, 'alpha-fund')).resolves.toEqual({
      id: alpha.id,
      slug: alpha.slug,
      name: alpha.name,
      logoUrl: alpha.logo_url,
      theme: alpha.theme,
    })
    expect(rpc).toHaveBeenCalledWith('resolve_public_fund_host', { p_slug: 'alpha-fund' })
  })

  it('drops non-public and malformed theme fields from the anonymous descriptor', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        ...alpha,
        theme: {
          accent: '217 91% 60%',
          font: 'hanken',
          radius: 0.75,
          provider_secret: 'must-not-leak',
          unknown: { nested: true },
        },
      }],
      error: null,
    })

    await expect(loadTenantDescriptor({ rpc } as never, 'alpha-fund')).resolves.toMatchObject({
      theme: { accent: '217 91% 60%', font: 'hanken', radius: 0.75 },
    })
    const descriptor = await loadTenantDescriptor({ rpc } as never, 'alpha-fund')
    expect(descriptor?.theme).not.toHaveProperty('provider_secret')
    expect(descriptor?.theme).not.toHaveProperty('unknown')
  })

  it('returns null for an unknown exact slug and surfaces database failures', async () => {
    await expect(loadTenantDescriptor({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as never, 'missing-fund'))
      .resolves.toBeNull()
    await expect(loadTenantDescriptor({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'down' } }) } as never, 'alpha-fund'))
      .rejects.toThrow('Unable to resolve tenant Fund')
  })
})
