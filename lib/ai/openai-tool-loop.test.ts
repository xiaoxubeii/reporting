import { describe, expect, it, vi } from 'vitest'

import { OpenAIProvider } from './openai'

function response(message: Record<string, unknown>, usage = { prompt_tokens: 2, completion_tokens: 3 }, finishReason = 'stop') {
  return { choices: [{ message, finish_reason: finishReason }], usage }
}

describe('OpenAIProvider.createToolLoop', () => {
  it('defines tools, executes ordered parallel calls, returns matching tool messages, and aggregates usage', async () => {
    const provider = new OpenAIProvider('test-key')
    const create = vi.fn()
      .mockResolvedValueOnce(response({
        role: 'assistant', content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'reporting_search', arguments: '{"query":"alpha"}' } },
          { id: 'call_2', type: 'function', function: { name: 'reporting_search', arguments: '{"query":"beta"}' } },
        ],
      }, { prompt_tokens: 5, completion_tokens: 4 }, 'tool_calls'))
      .mockResolvedValueOnce(response({ role: 'assistant', content: '{"summary":"done"}' }, { prompt_tokens: 7, completion_tokens: 6 }))
    ;(provider as unknown as {
      client: { chat: { completions: { create: typeof create } } }
    }).client.chat.completions.create = create
    const executeTool = vi.fn(async call => JSON.stringify({ query: call.input.query }))

    const result = await provider.createToolLoop!({
      model: 'openrouter/model', maxTokens: 1000, content: 'research', maxIterations: 3,
      tools: [{ name: 'reporting_search', description: 'Search', inputSchema: { type: 'object' } }],
      executeTool,
    })

    expect(executeTool.mock.calls.map(([call]) => call)).toEqual([
      { id: 'call_1', name: 'reporting_search', input: { query: 'alpha' } },
      { id: 'call_2', name: 'reporting_search', input: { query: 'beta' } },
    ])
    expect(result).toMatchObject({
      text: '{"summary":"done"}',
      usage: { inputTokens: 12, outputTokens: 10 },
    })
    const secondMessages = create.mock.calls[1][0].messages
    expect(secondMessages.slice(-2)).toEqual([
      { role: 'tool', tool_call_id: 'call_1', content: '{"query":"alpha"}' },
      { role: 'tool', tool_call_id: 'call_2', content: '{"query":"beta"}' },
    ])
    expect(create.mock.calls[0][0].tools[0]).toMatchObject({ type: 'function', function: { name: 'reporting_search' } })
  })

  it('returns malformed arguments and executor failures as tool errors without aborting the loop', async () => {
    const provider = new OpenAIProvider('test-key')
    const create = vi.fn()
      .mockResolvedValueOnce(response({
        role: 'assistant', content: null,
        tool_calls: [
          { id: 'bad_1', type: 'function', function: { name: 'reporting_search', arguments: '{bad' } },
          { id: 'bad_2', type: 'function', function: { name: 'reporting_search', arguments: '{"query":"x"}' } },
        ],
      }, undefined, 'tool_calls'))
      .mockResolvedValueOnce(response({ role: 'assistant', content: 'recovered' }))
    ;(provider as unknown as {
      client: { chat: { completions: { create: typeof create } } }
    }).client.chat.completions.create = create
    const executeTool = vi.fn(async () => { throw new Error('private upstream secret') })
    const result = await provider.createToolLoop!({
      model: 'gpt', maxTokens: 10, content: 'x',
      tools: [{ name: 'reporting_search', description: 'Search', inputSchema: { type: 'object' } }],
      executeTool,
    })
    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls.every(call => call.isError)).toBe(true)
    expect(JSON.stringify(create.mock.calls[1][0].messages)).not.toContain('private upstream secret')
  })

  it('passes abort signals and fails explicitly when the iteration bound is exhausted', async () => {
    const provider = new OpenAIProvider('test-key')
    const controller = new AbortController()
    const create = vi.fn().mockResolvedValue(response({
      role: 'assistant', content: null,
      tool_calls: [{ id: 'call_forever', type: 'function', function: { name: 'reporting_search', arguments: '{}' } }],
    }, undefined, 'tool_calls'))
    ;(provider as unknown as {
      client: { chat: { completions: { create: typeof create } } }
    }).client.chat.completions.create = create
    await expect(provider.createToolLoop!({
      model: 'gpt', maxTokens: 10, content: 'x', maxIterations: 1, signal: controller.signal,
      tools: [{ name: 'reporting_search', description: 'Search', inputSchema: { type: 'object' } }],
      executeTool: async () => '{}',
    })).rejects.toThrow('exhausted')
    expect(create.mock.calls[0][1]).toMatchObject({ signal: controller.signal })
  })

  it('rejects unsupported remote MCP toolsets explicitly', async () => {
    const provider = new OpenAIProvider('test-key')
    await expect(provider.createToolLoop!({
      model: 'gpt', maxTokens: 10, content: 'x', mcpServers: [{ name: 'remote', url: 'https://example.com' }],
    })).rejects.toThrow('MCP')
  })
})
