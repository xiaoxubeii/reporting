import OpenAI from 'openai'
import type { AIProvider, AIModel, AIResult, CreateMessageParams, CreateChatParams, ContentBlock } from './types'
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
