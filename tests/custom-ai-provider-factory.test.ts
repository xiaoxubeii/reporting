import { describe, expect, it, vi } from 'vitest'

const openAIProviderConstructor = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ai/openai', () => ({
  OpenAIProvider: class {
    constructor(apiKey: string, baseUrl?: string, options?: unknown) {
      openAIProviderConstructor(apiKey, baseUrl, options)
    }
  },
}))
vi.mock('@/lib/ai/anthropic', () => ({ AnthropicProvider: class {} }))
vi.mock('@/lib/ai/gemini', () => ({ GeminiProvider: class {} }))
vi.mock('@/lib/validate-url', () => ({
  validateOllamaUrl: (url: string) => ({ ok: true as const, url }),
  validateCustomProviderUrl: async (url: string) => ({ ok: true as const, url }),
}))
vi.mock('@/lib/pipeline/processEmail', () => ({
  getDefaultAIProvider: async () => 'openrouter',
  getOpenRouterApiKey: async () => 'custom-secret',
  getOpenRouterConfig: async () => ({
    baseUrl: 'https://codex-lb.example/v1',
    model: 'gpt-compatible-model',
    requestParameters: { thinking: { type: 'disabled' } },
  }),
  getClaudeApiKey: vi.fn(),
  getClaudeModel: vi.fn(),
  getOpenAIApiKey: vi.fn(),
  getOpenAIModel: vi.fn(),
  getGeminiApiKey: vi.fn(),
  getGeminiModel: vi.fn(),
  getOllamaConfig: vi.fn(),
}))

import { createFundAIProvider } from '../lib/ai'

describe('custom provider factory path', () => {
  it('passes the saved key and base URL to OpenAIProvider and keeps the exact model', async () => {
    const result = await createFundAIProvider({} as never, 'fund-1')

    expect(openAIProviderConstructor).toHaveBeenCalledWith(
      'custom-secret',
      'https://codex-lb.example/v1',
      {
        requestParameters: { thinking: { type: 'disabled' } },
        rejectRedirects: true,
      },
    )
    expect(result.model).toBe('gpt-compatible-model')
    expect(result.providerType).toBe('openrouter')
  })
})
