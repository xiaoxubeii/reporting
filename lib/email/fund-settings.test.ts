/* eslint-disable @typescript-eslint/no-explicit-any -- tests inject minimal Supabase doubles */
import { describe, expect, it, vi } from 'vitest'
import {
  configureFundEmailInboundSettings,
  configureFundEmailOutboundSettings,
  configureFundEmailSettings,
  resolveFundEmailWebhookBaseUrl,
  rotateFundEmailRouteForSettings,
  validateFundEmailWebhookBaseUrl,
  type FundEmailSettingsDependencies,
} from './fund-settings'

function dependencies(overrides: Partial<FundEmailSettingsDependencies> = {}): FundEmailSettingsDependencies {
  return {
    inspectDomain: vi.fn().mockResolvedValue({
      providerDomainId: 'domain-1',
      domainStatus: 'verified',
      sendingStatus: 'verified',
      receivingStatus: 'verified',
      dnsRecords: [],
      lastErrorCode: null,
    }),
    saveConnection: vi.fn().mockResolvedValue({
      domain: 'cci.fundworkspace.com',
      routeToken: 'A'.repeat(43),
    }),
    persistInspection: vi.fn().mockResolvedValue(undefined),
    rotateRoute: vi.fn().mockResolvedValue({ routeToken: 'B'.repeat(43) }),
    ...overrides,
  }
}

describe('Fund email settings service', () => {
  it('prefers the dedicated server-only webhook origin over the public site URL', () => {
    expect(resolveFundEmailWebhookBaseUrl('http://127.0.0.1:5010', {
      FUND_EMAIL_WEBHOOK_BASE_URL: ' https://hooks.fundworkspace.com ',
      NEXT_PUBLIC_SITE_URL: 'https://app.fundworkspace.com',
    })).toBe('https://hooks.fundworkspace.com')
  })

  it('falls back from the public site URL to the request origin', () => {
    expect(resolveFundEmailWebhookBaseUrl('http://127.0.0.1:5010', {
      NEXT_PUBLIC_SITE_URL: ' https://app.fundworkspace.com ',
    })).toBe('https://app.fundworkspace.com')
    expect(resolveFundEmailWebhookBaseUrl('http://127.0.0.1:5010', {}))
      .toBe('http://127.0.0.1:5010')
    expect(() => resolveFundEmailWebhookBaseUrl('https://attacker.example', {}))
      .toThrow('server-configured public webhook origin')
  })

  it('accepts HTTPS origins and explicit HTTP loopback origins only', () => {
    expect(validateFundEmailWebhookBaseUrl('https://hooks.fundworkspace.com/'))
      .toBe('https://hooks.fundworkspace.com')
    expect(validateFundEmailWebhookBaseUrl('http://127.0.0.1:5010'))
      .toBe('http://127.0.0.1:5010')
    expect(validateFundEmailWebhookBaseUrl('http://[::1]:5010'))
      .toBe('http://[::1]:5010')

    for (const invalid of [
      'ftp://localhost',
      'http://hooks.fundworkspace.com',
      'https://user:pass@hooks.fundworkspace.com',
      'https://hooks.fundworkspace.com/nested',
      'https://hooks.fundworkspace.com?tenant=cci',
      'https://hooks.fundworkspace.com#fragment',
    ]) {
      expect(() => validateFundEmailWebhookBaseUrl(invalid)).toThrow(
        'A secure public application origin is required',
      )
    }
  })

  it('rejects an invalid webhook origin before connection side effects', async () => {
    const deps = dependencies()
    await expect(configureFundEmailSettings({} as any, {
      fundId: 'fund-1',
      actorUserId: 'user-1',
      slug: 'cci',
      sendingApiKey: 're_sending',
      receivingApiKey: 're_receiving',
      webhookSecret: 'whsec_secret',
      publicBaseUrl: 'http://hooks.fundworkspace.com',
    }, deps)).rejects.toThrow('A secure public application origin is required')

    expect(deps.inspectDomain).not.toHaveBeenCalled()
    expect(deps.saveConnection).not.toHaveBeenCalled()
  })

  it('rejects an invalid webhook origin before rotating a route token', async () => {
    const deps = dependencies()
    await expect(rotateFundEmailRouteForSettings({} as any, {
      fundId: 'fund-1',
      actorUserId: 'user-1',
      publicBaseUrl: 'ftp://localhost',
    }, deps)).rejects.toThrow('A secure public application origin is required')

    expect(deps.rotateRoute).not.toHaveBeenCalled()
  })

  it('verifies the exact derived domain before encrypting an admin-owned connection', async () => {
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    const deps = dependencies()

    const result = await configureFundEmailSettings({} as any, {
      fundId: 'fund-1',
      actorUserId: 'user-1',
      slug: 'CCI',
      sendingApiKey: 're_sending',
      receivingApiKey: 're_receiving',
      webhookSecret: 'whsec_secret',
      publicBaseUrl: 'https://app.fundworkspace.com/',
    }, deps)

    expect(deps.inspectDomain).toHaveBeenCalledWith(
      'cci.fundworkspace.com',
      're_receiving',
    )
    expect(deps.saveConnection).toHaveBeenCalledWith(expect.anything(), {
      fundId: 'fund-1',
      actorUserId: 'user-1',
      slug: 'cci',
      sendingApiKey: 're_sending',
      receivingApiKey: 're_receiving',
      webhookSecret: 'whsec_secret',
    })
    expect(result).toMatchObject({
      domain: 'cci.fundworkspace.com',
      webhookUrl: `https://app.fundworkspace.com/api/inbound-email/resend/${'A'.repeat(43)}`,
    })
    expect(JSON.stringify(result)).not.toMatch(/re_sending|re_receiving|whsec_secret/)
  })

  it('returns a one-time webhook URL when an admin explicitly rotates the route', async () => {
    const deps = dependencies()
    const result = await rotateFundEmailRouteForSettings({} as any, {
      fundId: 'fund-1',
      actorUserId: 'user-1',
      publicBaseUrl: 'https://app.fundworkspace.com',
    }, deps)

    expect(result).toEqual({
      webhookUrl: `https://app.fundworkspace.com/api/inbound-email/resend/${'B'.repeat(43)}`,
    })
    expect(deps.rotateRoute).toHaveBeenCalledWith(
      expect.anything(), 'fund-1', 'user-1',
    )
  })

  it('stores outbound configuration without requiring receiving credentials', async () => {
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    const saveSendingConfiguration = vi.fn().mockResolvedValue({
      domain: 'cci.fundworkspace.com',
    })

    await expect(configureFundEmailOutboundSettings({} as any, {
      fundId: 'fund-1',
      actorUserId: 'user-1',
      slug: 'CCI',
      sendingApiKey: 're_sending',
    }, { saveSendingConfiguration })).resolves.toEqual({
      domain: 'cci.fundworkspace.com',
    })

    expect(saveSendingConfiguration).toHaveBeenCalledWith(expect.anything(), {
      fundId: 'fund-1', actorUserId: 'user-1', slug: 'cci', sendingApiKey: 're_sending',
    })
  })

  it('updates and persists an existing Resend endpoint without consuming a second webhook slot', async () => {
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    const order: string[] = []
    const inspectDomain = vi.fn(async () => {
      order.push('inspect')
      return {
        providerDomainId: 'domain-1', domainStatus: 'verified' as const,
        sendingStatus: 'pending' as const, receivingStatus: 'verified' as const,
        dnsRecords: [], lastErrorCode: null,
      }
    })
    const refreshWebhook = vi.fn(async () => {
      order.push('refresh')
      return {
        id: 'wh_1', signingSecret: 'whsec_provider_returned', routeToken: 'R'.repeat(43),
      }
    })
    const createWebhook = vi.fn()
    const saveReceivingConfiguration = vi.fn(async () => {
      order.push('persist')
      return { domain: 'cci.fundworkspace.com' }
    })
    const removeWebhook = vi.fn()

    const result = await configureFundEmailInboundSettings({} as any, {
      fundId: 'fund-1', actorUserId: 'user-1', slug: 'cci',
      receivingApiKey: 're_full_access',
      publicBaseUrl: 'https://hooks.fundworkspace.com',
    }, {
      inspectDomain,
      createWebhook,
      recoverWebhook: vi.fn(),
      refreshWebhook,
      saveReceivingConfiguration,
      loadReceivingConfiguration: vi.fn().mockResolvedValue({
        receivingApiKey: 're_old_full_access', providerWebhookId: 'wh_1',
        routeTokenHash: 'a'.repeat(64),
        updatedAt: '2026-07-26T12:00:00.000Z',
      }),
      removeWebhook,
      generateRouteToken: () => 'R'.repeat(43),
    })

    expect(refreshWebhook).toHaveBeenCalledWith(
      're_full_access', 'wh_1', 'a'.repeat(64), 'https://hooks.fundworkspace.com',
    )
    expect(createWebhook).not.toHaveBeenCalled()
    expect(saveReceivingConfiguration).toHaveBeenCalledWith(expect.anything(), {
      fundId: 'fund-1', actorUserId: 'user-1', slug: 'cci',
      receivingApiKey: 're_full_access', webhookSecret: 'whsec_provider_returned',
      routeToken: 'R'.repeat(43), providerWebhookId: 'wh_1',
      expectedProviderWebhookId: 'wh_1',
      expectedUpdatedAt: '2026-07-26T12:00:00.000Z',
      inspection: expect.objectContaining({ providerDomainId: 'domain-1' }),
    })
    expect(removeWebhook).not.toHaveBeenCalled()
    expect(order).toEqual(['inspect', 'refresh', 'persist'])
    expect(result).toMatchObject({ domain: 'cci.fundworkspace.com', webhookConfigured: true })
    expect(JSON.stringify(result)).not.toMatch(/re_full_access|whsec_provider_returned|R{20}/)
  })

  it('removes a newly created provider webhook if local persistence fails', async () => {
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    const removeWebhook = vi.fn().mockResolvedValue(undefined)
    await expect(configureFundEmailInboundSettings({} as any, {
      fundId: 'fund-1', actorUserId: 'user-1', slug: 'cci',
      receivingApiKey: 're_full_access',
      publicBaseUrl: 'https://hooks.fundworkspace.com',
    }, {
      inspectDomain: vi.fn().mockResolvedValue({
        providerDomainId: 'domain-1', domainStatus: 'verified', sendingStatus: 'pending',
        receivingStatus: 'verified', dnsRecords: [], lastErrorCode: null,
      }),
      createWebhook: vi.fn().mockResolvedValue({ id: 'wh_new', signingSecret: 'whsec_new' }),
      recoverWebhook: vi.fn().mockResolvedValue(null),
      refreshWebhook: vi.fn(),
      saveReceivingConfiguration: vi.fn().mockRejectedValue(new Error('storage failed')),
      loadReceivingConfiguration: vi.fn().mockResolvedValue(null),
      removeWebhook,
      generateRouteToken: () => 'S'.repeat(43),
    })).rejects.toThrow('storage failed')

    expect(removeWebhook).toHaveBeenCalledWith('re_full_access', 'wh_new')
  })

  it('recovers an unpersisted managed webhook before attempting to create another one', async () => {
    process.env.FUND_EMAIL_BASE_DOMAIN = 'fundworkspace.com'
    const createWebhook = vi.fn()
    const recoverWebhook = vi.fn().mockResolvedValue({
      id: 'wh_orphan', signingSecret: 'whsec_orphan', routeToken: 'O'.repeat(43),
    })
    const saveReceivingConfiguration = vi.fn().mockResolvedValue({
      domain: 'cci.fundworkspace.com',
    })

    await expect(configureFundEmailInboundSettings({} as any, {
      fundId: 'fund-1', actorUserId: 'user-1', slug: 'cci',
      receivingApiKey: 're_full_access',
      publicBaseUrl: 'https://hooks.fundworkspace.com',
    }, {
      inspectDomain: vi.fn().mockResolvedValue({
        providerDomainId: 'domain-1', domainStatus: 'verified', sendingStatus: 'pending',
        receivingStatus: 'verified', dnsRecords: [], lastErrorCode: null,
      }),
      createWebhook,
      recoverWebhook,
      refreshWebhook: vi.fn(),
      saveReceivingConfiguration,
      loadReceivingConfiguration: vi.fn().mockResolvedValue(null),
      removeWebhook: vi.fn(),
      generateRouteToken: () => 'N'.repeat(43),
    })).resolves.toMatchObject({ webhookConfigured: true })

    expect(recoverWebhook).toHaveBeenCalledWith(
      're_full_access', 'https://hooks.fundworkspace.com',
    )
    expect(createWebhook).not.toHaveBeenCalled()
    expect(saveReceivingConfiguration).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({
        providerWebhookId: 'wh_orphan',
        routeToken: 'O'.repeat(43),
        webhookSecret: 'whsec_orphan',
      }),
    )
  })
})
