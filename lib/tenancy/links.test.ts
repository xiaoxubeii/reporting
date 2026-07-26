import { afterEach, describe, expect, it, vi } from 'vitest'
import { canonicalFundOriginForId, canonicalProviderOriginForFundId } from './links'

afterEach(() => {
  delete process.env.FUND_WORKSPACE_ROOT_DOMAIN
  delete process.env.FUND_WORKSPACE_DEV_PORT
  delete process.env.NEXT_PUBLIC_SITE_URL
  delete process.env.NEXT_PUBLIC_APP_URL
  delete process.env.VERCEL_URL
})

function adminWithSlug(slug: string | null) {
  const maybeSingle = vi.fn(async () => ({ data: slug ? { slug } : null, error: null }))
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  return { from: vi.fn(() => chain) }
}

describe('canonical Fund links', () => {
  it('uses the persisted Fund slug in hosted mode', async () => {
    process.env.FUND_WORKSPACE_ROOT_DOMAIN = 'fundworkspace.com'
    const admin = adminWithSlug('alpha-fund')
    await expect(canonicalFundOriginForId(admin as never, 'fund-alpha'))
      .resolves.toBe('https://alpha-fund.fundworkspace.com')
    expect(admin.from).toHaveBeenCalledWith('funds')
  })

  it('uses localhost tenant origins with the configured development port', async () => {
    process.env.FUND_WORKSPACE_ROOT_DOMAIN = 'localhost'
    process.env.FUND_WORKSPACE_DEV_PORT = '5010'
    await expect(canonicalFundOriginForId(adminWithSlug('alpha-fund') as never, 'fund-alpha'))
      .resolves.toBe('http://alpha-fund.localhost:5010')
  })

  it('preserves the validated existing site origin in legacy mode', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://self-host.example/'
    const admin = adminWithSlug(null)
    await expect(canonicalFundOriginForId(admin as never, 'fund-alpha'))
      .resolves.toBe('https://self-host.example')
    expect(admin.from).not.toHaveBeenCalled()
  })

  it('preserves the provider APP_URL preference in legacy mode', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://marketing.example/'
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example/'
    await expect(canonicalProviderOriginForFundId(adminWithSlug(null) as never, 'fund-alpha'))
      .resolves.toBe('https://app.example')
  })

  it('preserves the provider VERCEL_URL fallback in legacy mode', async () => {
    process.env.VERCEL_URL = 'reporting-preview.vercel.app'
    await expect(canonicalProviderOriginForFundId(adminWithSlug(null) as never, 'fund-alpha'))
      .resolves.toBe('https://reporting-preview.vercel.app')
  })

  it('fails closed when hosted Fund identity cannot be resolved', async () => {
    process.env.FUND_WORKSPACE_ROOT_DOMAIN = 'fundworkspace.com'
    await expect(canonicalFundOriginForId(adminWithSlug(null) as never, 'fund-missing'))
      .rejects.toThrow('Fund slug not found')
  })
})
