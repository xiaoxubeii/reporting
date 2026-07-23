import { beforeEach, describe, expect, it, vi } from 'vitest'

const create = vi.hoisted(() => vi.fn())

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = { completions: { create } }
    models = { list: vi.fn() }
  },
}))

import { OpenAIProvider } from '../lib/ai/openai'

describe('OpenAIProvider custom request parameters', () => {
  beforeEach(() => {
    create.mockReset()
    create.mockResolvedValue({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })
  })

  it('merges custom parameters into createMessage without mutating them', async () => {
    const requestParameters = {
      thinking: { type: 'disabled' },
      temperature: 0.2,
    }
    const provider = new OpenAIProvider('secret', 'https://gateway.example/v1', {
      requestParameters,
    })

    await provider.createMessage({
      model: 'MiniMax-M3',
      maxTokens: 100,
      system: 'System',
      content: 'Hello',
    })

    expect(create).toHaveBeenCalledWith({
      thinking: { type: 'disabled' },
      temperature: 0.2,
      model: 'MiniMax-M3',
      max_tokens: 100,
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Hello' },
      ],
    })
    expect(requestParameters).toEqual({
      thinking: { type: 'disabled' },
      temperature: 0.2,
    })
  })

  it('merges the same custom parameters into createChat', async () => {
    const provider = new OpenAIProvider('secret', 'https://gateway.example/v1', {
      requestParameters: { reasoning_split: true },
    })

    await provider.createChat({
      model: 'custom-model',
      maxTokens: 50,
      messages: [{ role: 'user', content: 'Hello' }],
    })

    expect(create).toHaveBeenCalledWith({
      reasoning_split: true,
      model: 'custom-model',
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Hello' }],
    })
  })

  it('rejects protected fields even if a caller bypasses the settings API', () => {
    expect(() => new OpenAIProvider('secret', 'https://gateway.example/v1', {
      requestParameters: { stream: true },
    })).toThrow('Custom parameter "stream" is managed by Reporting or may contain credentials.')
  })
})
