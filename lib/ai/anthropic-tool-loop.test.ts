import { describe, expect, it, vi } from 'vitest'

import { AnthropicProvider } from './anthropic'

function message(content: unknown[], stopReason = 'end_turn', input = 2, output = 3) {
  return {
    content,
    stop_reason: stopReason,
    usage: {
      input_tokens: input,
      output_tokens: output,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  }
}

describe('AnthropicProvider.createToolLoop', () => {
  it('forwards createMessage cancellation to the SDK stream options', async () => {
    const provider = new AnthropicProvider('test-key')
    const stream = vi.fn().mockReturnValue({ finalMessage: async () => message([{ type: 'text', text: 'done' }]) })
    ;(provider as unknown as { client: { messages: { stream: typeof stream } } }).client.messages.stream = stream
    const controller = new AbortController()

    await provider.createMessage({ model: 'claude', maxTokens: 10, content: 'x', signal: controller.signal })

    expect(stream.mock.calls[0][1]).toEqual({ signal: controller.signal })
  })

  it('passes blocked domains to native web search at the provider boundary', async () => {
    const provider = new AnthropicProvider('test-key')
    const stream = vi.fn().mockReturnValue({ finalMessage: async () => message([{ type: 'text', text: 'done' }]) })
    ;(provider as unknown as { client: { messages: { stream: typeof stream } } }).client.messages.stream = stream

    await provider.createMessage({
      model: 'claude',
      maxTokens: 10,
      content: 'x',
      enableWebSearch: true,
      webSearchBlockedDomains: ['linkedin.com', 'lnkd.in'],
    })

    expect(stream.mock.calls[0][0].tools).toEqual([
      expect.objectContaining({
        name: 'web_search',
        blocked_domains: ['linkedin.com', 'lnkd.in'],
      }),
    ])
  })

  it('propagates abort, executes ordered multi-calls with ids, and aggregates usage', async () => {
    const provider = new AnthropicProvider('test-key')
    const stream = vi.fn()
      .mockReturnValueOnce({ finalMessage: async () => message([
        { type: 'tool_use', id: 'tool_1', name: 'reporting_search', input: { query: 'alpha' } },
        { type: 'tool_use', id: 'tool_2', name: 'reporting_search', input: { query: 'beta' } },
      ], 'tool_use', 5, 4) })
      .mockReturnValueOnce({ finalMessage: async () => message([{ type: 'text', text: 'final' }], 'end_turn', 7, 6) })
    ;(provider as unknown as {
      client: { messages: { stream: typeof stream } }
    }).client.messages.stream = stream
    const executeTool = vi.fn(async call => JSON.stringify(call.input))
    const controller = new AbortController()
    const result = await provider.createToolLoop({
      model: 'claude', maxTokens: 100, content: 'research', signal: controller.signal,
      tools: [{ name: 'reporting_search', description: 'Search', inputSchema: { type: 'object' } }],
      executeTool,
    })
    expect(executeTool.mock.calls.map(([call]) => call)).toEqual([
      { id: 'tool_1', name: 'reporting_search', input: { query: 'alpha' } },
      { id: 'tool_2', name: 'reporting_search', input: { query: 'beta' } },
    ])
    expect(result).toMatchObject({ text: 'final', usage: { inputTokens: 12, outputTokens: 10 } })
    expect(stream.mock.calls[0][1]).toMatchObject({ signal: controller.signal })
    expect(stream.mock.calls[1][0].messages.at(-1).content).toEqual([
      expect.objectContaining({ type: 'tool_result', tool_use_id: 'tool_1' }),
      expect.objectContaining({ type: 'tool_result', tool_use_id: 'tool_2' }),
    ])
  })

  it('sanitizes executor failures and fails explicitly on exhaustion', async () => {
    const provider = new AnthropicProvider('test-key')
    const stream = vi.fn().mockReturnValue({ finalMessage: async () => message([
      { type: 'tool_use', id: 'tool_forever', name: 'reporting_search', input: {} },
    ], 'tool_use') })
    ;(provider as unknown as {
      client: { messages: { stream: typeof stream } }
    }).client.messages.stream = stream
    await expect(provider.createToolLoop({
      model: 'claude', maxTokens: 100, content: 'research', maxIterations: 2,
      tools: [{ name: 'reporting_search', description: 'Search', inputSchema: { type: 'object' } }],
      executeTool: async () => { throw new Error('private upstream secret') },
    })).rejects.toThrow('exhausted')
    expect(JSON.stringify(stream.mock.calls)).not.toContain('private upstream secret')
  })
})
