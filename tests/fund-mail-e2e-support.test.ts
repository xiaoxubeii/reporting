import { describe, expect, it } from 'vitest'

import {
  readLocalResendFixture,
  signResendWebhook,
} from './e2e/support/fund-mail-fixture'

describe('Fund mail E2E support', () => {
  it('requires a same-origin localhost provider and never returns an unconfigured fixture', () => {
    expect(() => readLocalResendFixture({})).toThrow('Local Resend E2E provider is required')
    expect(() => readLocalResendFixture({
      RESEND_BASE_URL: 'https://api.resend.com',
      E2E_RESEND_API_KEY: 're_live',
      E2E_RESEND_CONTROL_URL: 'https://api.resend.com/__e2e',
      E2E_RESEND_CONTROL_TOKEN: 'secret',
    })).toThrow('localhost')
    expect(readLocalResendFixture({
      RESEND_BASE_URL: 'http://127.0.0.1:43210',
      E2E_RESEND_API_KEY: 're_e2e_test',
      E2E_RESEND_CONTROL_URL: 'http://127.0.0.1:43210/__e2e',
      E2E_RESEND_CONTROL_TOKEN: 'secret',
    })).toEqual({
      apiKey: 're_e2e_test',
      baseUrl: 'http://127.0.0.1:43210',
      controlUrl: 'http://127.0.0.1:43210/__e2e',
      controlToken: 'secret',
    })
  })

  it('creates a deterministic Standard Webhooks signature for the exact raw body', () => {
    const signature = signResendWebhook({
      id: 'msg_123',
      timestamp: 1_785_283_200,
      body: '{"type":"email.received"}',
      webhookSecret: 'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    })
    expect(signature).toMatch(/^v1,[A-Za-z0-9+/]+=*$/)
    expect(signature).toBe(signResendWebhook({
      id: 'msg_123',
      timestamp: 1_785_283_200,
      body: '{"type":"email.received"}',
      webhookSecret: 'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    }))
  })
})
