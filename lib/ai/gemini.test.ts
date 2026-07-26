import { describe, expect, it, vi } from 'vitest'

import { GeminiProvider } from './gemini'

describe('GeminiProvider', () => {
  it('forwards createMessage cancellation in the SDK generation config', async () => {
    const provider = new GeminiProvider('test-key')
    const generateContent = vi.fn().mockResolvedValue({ text: 'done', candidates: [], usageMetadata: {} })
    ;(provider as unknown as { client: { models: { generateContent: typeof generateContent } } }).client.models.generateContent = generateContent
    const controller = new AbortController()

    await provider.createMessage({ model: 'gemini', maxTokens: 10, content: 'x', signal: controller.signal })

    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({ abortSignal: controller.signal }),
    }))
  })
})
