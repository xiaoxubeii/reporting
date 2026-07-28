import { describe, expect, it } from 'vitest'

import {
  assertRequiredE2ECapabilities,
  browserExecutableCandidates,
  readDiscoveryProviderCapability,
  readFundMailRoundTripCapability,
  readPlatformMailCapability,
  writeE2ECapabilityReport,
} from '@/scripts/e2e/capabilities.mjs'

const healthyCapabilities = {
  services: {
    web: { state: 'running' },
    cron: { state: 'running' },
  },
  external: {
    supabase: { state: 'running' },
    miniflux: { state: 'running' },
    searxng: { state: 'running' },
  },
  credentials: {
    supabaseServiceRole: true,
    minifluxProvisioner: true,
  },
  providers: {
    ai: 'unconfigured',
    investmentAi: { state: 'configured', provider: 'ollama' },
    discoveryAi: { state: 'unconfigured', provider: null },
    platformMail: 'unconfigured',
    platformMailDelivery: 'disabled',
    fundMailEncryption: 'unconfigured',
    fundMailRoundTrip: { state: 'configured', provider: 'resend-local' },
  },
  browser: { state: 'running' },
}

describe('comprehensive E2E capability gate', () => {
  it('uses the Playwright-managed Chromium unless an explicit executable is configured', () => {
    expect(browserExecutableCandidates({}, '/playwright/chromium')).toEqual([
      '/playwright/chromium',
    ])
    expect(browserExecutableCandidates({
      E2E_CHROMIUM_EXECUTABLE: '/controlled/chromium',
    }, '/playwright/chromium')).toEqual([
      '/controlled/chromium',
      '/playwright/chromium',
    ])
  })

  it('accepts required runtime dependencies while allowing explicit optional-provider states', () => {
    expect(() => assertRequiredE2ECapabilities(healthyCapabilities)).not.toThrow()
  })

  it('requires a configured investment provider for the comprehensive journey', () => {
    expect(() => assertRequiredE2ECapabilities({
      ...healthyCapabilities,
      providers: {
        ...healthyCapabilities.providers,
        investmentAi: { state: 'unconfigured', provider: null },
      },
    })).toThrow('investment-ai:unconfigured')
  })

  it('requires a complete local Fund mail adapter for the round-trip journey', () => {
    expect(readFundMailRoundTripCapability({})).toEqual({ state: 'unconfigured', provider: null })
    expect(readFundMailRoundTripCapability({
      RESEND_BASE_URL: 'http://127.0.0.1:43210',
      E2E_RESEND_API_KEY: 're_e2e_test',
      E2E_RESEND_CONTROL_URL: 'http://127.0.0.1:43210/__e2e',
      E2E_RESEND_CONTROL_TOKEN: 'not-recorded',
    })).toEqual({ state: 'configured', provider: 'resend-local' })
    expect(readFundMailRoundTripCapability({
      RESEND_BASE_URL: 'https://api.resend.com',
      E2E_RESEND_API_KEY: 're_live_test',
      E2E_RESEND_CONTROL_URL: 'https://api.resend.com/__e2e',
      E2E_RESEND_CONTROL_TOKEN: 'not-recorded',
    })).toEqual({ state: 'invalid', provider: null })
    expect(() => assertRequiredE2ECapabilities({
      ...healthyCapabilities,
      providers: {
        ...healthyCapabilities.providers,
        fundMailRoundTrip: { state: 'unconfigured', provider: null },
      },
    })).toThrow('fund-mail-round-trip:unconfigured')
  })

  it('reports every missing required capability without exposing provider values', () => {
    expect(() => assertRequiredE2ECapabilities({
      ...healthyCapabilities,
      services: { web: { state: 'stopped' }, cron: { state: 'running' } },
      external: {
        ...healthyCapabilities.external,
        searxng: { state: 'unreachable' },
      },
      credentials: {
        supabaseServiceRole: false,
        minifluxProvisioner: true,
      },
    })).toThrow('web:not-running, searxng:unreachable, supabase-service-role:missing')
  })

  it('classifies the explicit Discovery provider without exposing its credential', () => {
    expect(readDiscoveryProviderCapability({
      E2E_INVESTMENT_PROVIDER: 'openai',
      E2E_INVESTMENT_PROVIDER_API_KEY: 'not-recorded',
      E2E_INVESTMENT_PROVIDER_MODEL: 'test-model',
    })).toEqual({ state: 'configured', provider: 'openai' })
    expect(readDiscoveryProviderCapability({
      E2E_INVESTMENT_PROVIDER: 'openrouter',
      E2E_INVESTMENT_PROVIDER_API_KEY: 'not-recorded',
      E2E_INVESTMENT_PROVIDER_MODEL: 'test-model',
    })).toEqual({ state: 'invalid', provider: 'openrouter' })
    expect(readDiscoveryProviderCapability({
      E2E_INVESTMENT_PROVIDER: 'ollama',
      E2E_INVESTMENT_PROVIDER_MODEL: 'reporting-e2e',
      E2E_INVESTMENT_PROVIDER_BASE_URL: 'http://127.0.0.1:43123/v1',
    })).toEqual({ state: 'configured', provider: 'ollama' })
  })

  it('fails preflight when an explicitly requested Discovery provider is incomplete', () => {
    expect(() => assertRequiredE2ECapabilities({
      ...healthyCapabilities,
      providers: {
        ...healthyCapabilities.providers,
        discoveryAi: { state: 'invalid', provider: 'openrouter' },
      },
    })).toThrow('discovery-ai:invalid')
  })

  it('requires the Resend key and From identity and keeps real delivery opt-in explicit', () => {
    expect(readPlatformMailCapability({
      RESEND_API_KEY: 're_test',
    })).toEqual({ state: 'unconfigured', delivery: 'disabled' })
    expect(readPlatformMailCapability({
      SYSTEM_EMAIL_FROM: 'E2E <e2e@example.test>',
    })).toEqual({ state: 'unconfigured', delivery: 'disabled' })
    expect(readPlatformMailCapability({
      RESEND_API_KEY: 're_test',
      SYSTEM_EMAIL_FROM: 'E2E <e2e@example.test>',
    })).toEqual({ state: 'configured', delivery: 'disabled' })
    expect(readPlatformMailCapability({
      RESEND_API_KEY: 're_test',
      SYSTEM_EMAIL_FROM: 'E2E <e2e@example.test>',
      E2E_ALLOW_REAL_MAIL_DELIVERY: 'true',
    })).toEqual({ state: 'configured', delivery: 'enabled' })
  })

  it('writes only the supplied redacted capability object', async () => {
    const target = `/tmp/reporting-e2e-capabilities-${process.pid}.json`
    await writeE2ECapabilityReport(healthyCapabilities, target)
    const saved = await import('node:fs/promises').then(({ readFile, unlink }) => (
      readFile(target, 'utf8').finally(() => unlink(target))
    ))
    expect(JSON.parse(saved)).toEqual(healthyCapabilities)
    expect(saved).not.toContain('API_KEY')
  })
})
