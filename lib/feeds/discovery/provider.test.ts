import { describe, expect, it, vi } from 'vitest'

import type { AIProvider } from '@/lib/ai/types'
import { resolveDiscoveryAIProvider } from './provider'

const FUND_ID = '7b2d62d7-58cf-4684-8c31-7e4c43b9949e'
const provider = { createMessage: vi.fn() } as unknown as AIProvider

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    default_ai_provider: 'openrouter', encryption_key_encrypted: 'encrypted-dek',
    claude_api_key_encrypted: 'encrypted-anthropic', claude_model: 'claude-model',
    openai_api_key_encrypted: 'encrypted-openai', openai_model: 'openai-model',
    gemini_api_key_encrypted: 'encrypted-gemini', gemini_model: 'gemini-model',
    openrouter_api_key_encrypted: 'encrypted-custom', openrouter_model: 'MiniMax-M3',
    openrouter_base_url: 'https://api.minimaxi.com/v1',
    openrouter_request_parameters: { thinking: { type: 'disabled' } },
    ...overrides,
  }
}

function dependencies(settings = snapshot(), overrides: Record<string, unknown> = {}) {
  return {
    loadSnapshot: vi.fn(async () => settings),
    decryptKey: vi.fn(() => 'api-key-test-secret'),
    validateCustomUrl: vi.fn(async (url: string) => ({ ok: true as const, url })),
    createProvider: vi.fn(() => provider),
    ...overrides,
  }
}

describe('Discovery current-fund provider resolver', () => {
  it('resolves the verified current fund Custom Provider from one snapshot with a secret-free fingerprint', async () => {
    const deps = dependencies()
    const result = await resolveDiscoveryAIProvider({} as never, FUND_ID, deps as never)

    expect(deps.loadSnapshot).toHaveBeenCalledOnce()
    expect(deps.loadSnapshot).toHaveBeenCalledWith(expect.anything(), FUND_ID)
    expect(deps.createProvider).toHaveBeenCalledWith(expect.objectContaining({
      providerType: 'openrouter', model: 'MiniMax-M3', baseUrl: 'https://api.minimaxi.com/v1',
    }))
    expect(result).toMatchObject({ fundId: FUND_ID, provider, providerType: 'openrouter', model: 'MiniMax-M3' })
    expect(result.configurationFingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(result)).not.toContain('api-key-test-secret')
  })

  it('changes the fingerprint for behavior changes but not key rotation', async () => {
    const variants = [
      snapshot(),
      snapshot({ openrouter_api_key_encrypted: 'rotated-key' }),
      snapshot({ openrouter_model: 'MiniMax-M3.1' }),
      snapshot({ openrouter_base_url: 'https://openrouter.ai/api/v1' }),
      snapshot({ openrouter_request_parameters: { thinking: { type: 'enabled' } } }),
    ]
    const fingerprints = await Promise.all(variants.map(item =>
      resolveDiscoveryAIProvider({} as never, FUND_ID, dependencies(item) as never)
        .then(result => result.configurationFingerprint),
    ))

    expect(fingerprints[1]).toBe(fingerprints[0])
    expect(new Set([fingerprints[0], ...fingerprints.slice(2)]).size).toBe(4)
  })

  it.each([
    ['anthropic', 'claude-model'], ['openai', 'openai-model'], ['gemini', 'gemini-model'],
  ] as const)('accepts the reviewed %s fund default', async (providerType, model) => {
    const deps = dependencies(snapshot({ default_ai_provider: providerType }))
    await expect(resolveDiscoveryAIProvider({} as never, FUND_ID, deps as never))
      .resolves.toMatchObject({ providerType, model })
    expect(deps.validateCustomUrl).not.toHaveBeenCalled()
  })

  it('rejects Ollama before provider creation', async () => {
    const deps = dependencies(snapshot({ default_ai_provider: 'ollama' }))
    await expect(resolveDiscoveryAIProvider({} as never, FUND_ID, deps as never))
      .rejects.toThrow('Feed discovery AI configuration is unavailable')
    expect(deps.createProvider).not.toHaveBeenCalled()
  })

  it.each([
    ['missing Custom Base URL', { openrouter_base_url: null }],
    ['missing Custom model', { openrouter_model: null }],
    ['missing Custom key', { openrouter_api_key_encrypted: null }],
    ['oversized Custom model', { openrouter_model: 'm'.repeat(201) }],
  ])('fails closed for %s instead of using provider defaults', async (_label, override) => {
    const deps = dependencies(snapshot(override))
    await expect(resolveDiscoveryAIProvider({} as never, FUND_ID, deps as never))
      .rejects.toThrow('Feed discovery AI configuration is unavailable')
    expect(deps.createProvider).not.toHaveBeenCalled()
  })

  it.each(['settings missing', 'database unavailable', 'api-key-test-secret'])('sanitizes %s without fallback', async detail => {
    const deps = dependencies(snapshot(), { loadSnapshot: vi.fn(async () => { throw new Error(detail) }) })
    await expect(resolveDiscoveryAIProvider({} as never, FUND_ID, deps as never))
      .rejects.toThrow('Feed discovery AI configuration is unavailable')
    expect(deps.createProvider).not.toHaveBeenCalled()
  })
})
