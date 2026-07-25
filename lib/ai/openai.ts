import OpenAI from 'openai'
import type {
  AIProvider, AIModel, AIResult, CreateMessageParams, CreateChatParams, ContentBlock,
  CreateToolLoopParams, ToolCallRecord, ToolLoopResult,
} from './types'
import {
  parseCustomAIProviderRequestParameters,
  type CustomAIProviderRequestParameters,
} from './custom-provider'
import { safeCustomProviderFetch } from './custom-provider-fetch'

export interface OpenAIProviderOptions {
  requestParameters?: CustomAIProviderRequestParameters
  rejectRedirects?: boolean
}

export class OpenAIProvider implements AIProvider {
  private client: OpenAI
  private customBaseURL: boolean
  private requestParameters: CustomAIProviderRequestParameters

  readonly supportsToolLoop = true

  constructor(apiKey: string, baseURL?: string, options: OpenAIProviderOptions = {}) {
    const safeFetch: typeof fetch | undefined = options.rejectRedirects
      ? safeCustomProviderFetch
      : undefined
    this.client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      ...(safeFetch ? { fetch: safeFetch } : {}),
    })
    this.customBaseURL = !!baseURL
    const parsed = parseCustomAIProviderRequestParameters(options.requestParameters)
    if (!parsed.ok) throw new Error(parsed.error)
    this.requestParameters = parsed.value
  }

  async createMessage(params: CreateMessageParams): Promise<AIResult> {
    const userContent = typeof params.content === 'string'
      ? params.content
      : toOpenAIContent(params.content)

    const messages: OpenAI.ChatCompletionMessageParam[] = []

    if (params.system) {
      messages.push({ role: 'system', content: params.system })
    }

    messages.push({ role: 'user', content: userContent })

    const response = await this.client.chat.completions.create({
      ...this.requestParameters,
      model: params.model,
      max_tokens: params.maxTokens,
      messages,
    } as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming)

    return {
      text: response.choices[0]?.message?.content ?? '',
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      truncated: response.choices[0]?.finish_reason === 'length',
    }
  }

  async createChat(params: CreateChatParams): Promise<AIResult> {
    const messages: OpenAI.ChatCompletionMessageParam[] = []

    if (params.system) {
      messages.push({ role: 'system', content: params.system })
    }

    for (const m of params.messages) {
      messages.push({ role: m.role, content: m.content })
    }

    const response = await this.client.chat.completions.create({
      ...this.requestParameters,
      model: params.model,
      max_tokens: params.maxTokens,
      messages,
    } as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming)

    return {
      text: response.choices[0]?.message?.content ?? '',
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      truncated: response.choices[0]?.finish_reason === 'length',
    }
  }

  async createToolLoop(params: CreateToolLoopParams): Promise<ToolLoopResult> {
    if ((params.mcpServers?.length ?? 0) > 0) {
      throw new Error('OpenAI-compatible provider does not support remote MCP toolsets')
    }
    const maxIterations = params.maxIterations ?? 6
    if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 20) {
      throw new Error('Invalid tool-loop iteration limit')
    }

    const messages: OpenAI.ChatCompletionMessageParam[] = []
    if (params.system) messages.push({ role: 'system', content: params.system })
    if (params.messages?.length) {
      messages.push(...params.messages.map(message => ({ role: message.role, content: message.content } as const)))
    } else {
      const content = typeof params.content === 'string'
        ? params.content
        : toOpenAIContent(params.content ?? [])
      messages.push({ role: 'user', content })
    }

    const definitions = params.tools ?? []
    const knownTools = new Set(definitions.map(tool => tool.name))
    const tools: OpenAI.ChatCompletionTool[] = definitions.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
    const toolCalls: ToolCallRecord[] = []
    const usage = { inputTokens: 0, outputTokens: 0 }
    let truncated = false

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await this.client.chat.completions.create({
        ...this.requestParameters,
        model: params.model,
        max_tokens: params.maxTokens,
        messages,
        ...(tools.length > 0 ? { tools } : {}),
      } as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming, params.signal ? { signal: params.signal } : undefined)
      usage.inputTokens += response.usage?.prompt_tokens ?? 0
      usage.outputTokens += response.usage?.completion_tokens ?? 0
      const choice = response.choices[0]
      if (!choice) throw new Error('OpenAI-compatible provider returned no choice')
      if (choice.finish_reason === 'length') truncated = true

      const pending = choice.message.tool_calls ?? []
      if (pending.length === 0) {
        return {
          text: choice.message.content ?? '',
          usage,
          truncated,
          toolCalls,
        }
      }
      if (iteration === maxIterations - 1) {
        throw new Error('Tool loop exhausted before a final response')
      }

      messages.push(choice.message as OpenAI.ChatCompletionAssistantMessageParam)
      for (const call of pending) {
        if (call.type !== 'function') throw new Error('Unsupported OpenAI-compatible tool call type')
        const name = call.function.name
        let input: Record<string, unknown> = {}
        let resultText = 'Tool execution failed.'
        let isError = false
        try {
          const parsed = JSON.parse(call.function.arguments)
          if (!isRecord(parsed)) throw new Error('Tool arguments must be an object')
          input = parsed
          if (!knownTools.has(name)) throw new Error('Unknown tool')
          if (!params.executeTool) throw new Error('No tool executor')
          resultText = await params.executeTool({ id: call.id, name, input })
        } catch {
          isError = true
          resultText = 'Tool execution failed.'
        }
        toolCalls.push({ id: call.id, name, input, resultPreview: resultText.slice(0, 500), isError })
        messages.push({ role: 'tool', tool_call_id: call.id, content: resultText })
      }
    }

    throw new Error('Tool loop exhausted before a final response')
  }

  async testConnection(): Promise<void> {
    if (this.customBaseURL) {
      // For Ollama/custom endpoints, list models to verify connectivity
      const list = await this.client.models.list()
      const models: OpenAI.Model[] = []
      for await (const model of list) {
        models.push(model)
        break // just need one to verify
      }
      if (models.length === 0) throw new Error('No models available')
      return
    }
    await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }],
    })
  }

  async listModels(): Promise<AIModel[]> {
    const list = await this.client.models.list()
    const models: OpenAI.Model[] = []
    for await (const model of list) {
      models.push(model)
    }

    if (this.customBaseURL) {
      // For Ollama/custom endpoints, return all models
      return models
        .sort((a, b) => b.created - a.created)
        .map(m => ({ id: m.id, name: m.id }))
    }

    return models
      .filter(m => /gpt|o1|o3|o4/.test(m.id))
      .sort((a, b) => b.created - a.created)
      .map(m => ({ id: m.id, name: m.id }))
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toOpenAIContent(blocks: ContentBlock[]): OpenAI.ChatCompletionContentPart[] {
  const parts: OpenAI.ChatCompletionContentPart[] = []

  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        parts.push({ type: 'text', text: block.text })
        break
      case 'image':
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${block.mediaType};base64,${block.data}` },
        })
        break
      case 'document':
        // PDFs are not natively supported by OpenAI — extracted text is already
        // included in the text content blocks, so we skip document blocks.
        break
    }
  }

  return parts
}
