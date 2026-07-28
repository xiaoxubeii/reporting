import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import { AnthropicProvider } from '@/lib/ai/anthropic'
import { parseCustomAIProviderRequestParameters, type CustomAIProviderRequestParameters } from '@/lib/ai/custom-provider'
import { GeminiProvider } from '@/lib/ai/gemini'
import { OpenAIProvider } from '@/lib/ai/openai'
import type { AIProvider } from '@/lib/ai/types'
import { decryptApiKey } from '@/lib/crypto'
import { validateCustomProviderUrl, validateOllamaEgressUrl } from '@/lib/validate-url'
import { createDiscoveryVersions, validateDiscoveryFundId, type DiscoveryAIProviderType, type DiscoveryVersions } from './config'

const CONFIGURATION_ERROR = 'Feed discovery AI configuration is unavailable'
const SUPPORTED_PROVIDERS = new Set<DiscoveryAIProviderType>(['anthropic', 'openai', 'gemini', 'ollama', 'openrouter'])

interface ProviderSettingsSnapshot {
  readonly default_ai_provider: unknown
  readonly encryption_key_encrypted: unknown
  readonly claude_api_key_encrypted: unknown
  readonly claude_model: unknown
  readonly openai_api_key_encrypted: unknown
  readonly openai_model: unknown
  readonly gemini_api_key_encrypted: unknown
  readonly gemini_model: unknown
  readonly openrouter_api_key_encrypted: unknown
  readonly openrouter_model: unknown
  readonly openrouter_base_url: unknown
  readonly openrouter_request_parameters: unknown
  readonly ollama_base_url: unknown
  readonly ollama_model: unknown
}

interface RuntimeProviderConfig {
  readonly providerType: DiscoveryAIProviderType
  readonly apiKey: string
  readonly model: string
  readonly baseUrl?: string
  readonly requestParameters?: CustomAIProviderRequestParameters
  readonly publicEgressOnly?: boolean
}

interface ProviderDependencies {
  loadSnapshot(admin: SupabaseClient, fundId: string): Promise<ProviderSettingsSnapshot>
  decryptKey(ciphertext: string, encryptedKey: string): string
  validateCustomUrl(url: string): Promise<{ ok: true; url: string } | { ok: false; error: string }>
  validateOllamaEgressUrl(url: string): Promise<
    { ok: true; url: string; publicOnly: boolean } | { ok: false; error: string }
  >
  createProvider(config: RuntimeProviderConfig): AIProvider
}

export interface ResolvedDiscoveryAIProvider {
  readonly fundId: string
  readonly provider: AIProvider
  readonly providerType: DiscoveryAIProviderType
  readonly model: string
  readonly configurationFingerprint: string
  readonly versions: DiscoveryVersions
}

const defaultDependencies: ProviderDependencies = {
  loadSnapshot: async (admin, fundId) => {
    const { data, error } = await admin
      .from('fund_settings')
      .select('default_ai_provider, encryption_key_encrypted, claude_api_key_encrypted, claude_model, openai_api_key_encrypted, openai_model, gemini_api_key_encrypted, gemini_model, openrouter_api_key_encrypted, openrouter_model, openrouter_base_url, openrouter_request_parameters, ollama_base_url, ollama_model')
      .eq('fund_id', fundId)
      .single()
    if (error || !data) throw new Error('settings unavailable')
    return data as ProviderSettingsSnapshot
  },
  decryptKey: decryptApiKey,
  validateCustomUrl: validateCustomProviderUrl,
  validateOllamaEgressUrl,
  createProvider: config => {
    switch (config.providerType) {
      case 'openai': return new OpenAIProvider(config.apiKey)
      case 'gemini': return new GeminiProvider(config.apiKey)
      case 'openrouter': return new OpenAIProvider(config.apiKey, config.baseUrl, {
        requestParameters: config.requestParameters,
        rejectRedirects: true,
        publicEgressOnly: true,
      })
      case 'ollama': return new OpenAIProvider('ollama', config.baseUrl, {
        rejectRedirects: true,
        publicEgressOnly: config.publicEgressOnly,
      })
      default: return new AnthropicProvider(config.apiKey)
    }
  },
}

export async function resolveDiscoveryAIProvider(
  admin: SupabaseClient,
  fundId: string,
  deps: ProviderDependencies = defaultDependencies,
): Promise<ResolvedDiscoveryAIProvider> {
  try {
    const verifiedFundId = validateDiscoveryFundId(fundId)
    const snapshot = await deps.loadSnapshot(admin, verifiedFundId)
    const providerType = strictProvider(snapshot.default_ai_provider)
    const runtime = await runtimeConfig(snapshot, providerType, deps)
    const provider = deps.createProvider(runtime)
    const identity = {
      fundId: verifiedFundId,
      providerType,
      model: runtime.model,
      ...(runtime.baseUrl ? { baseUrl: runtime.baseUrl } : {}),
      ...(runtime.requestParameters ? { requestParameters: runtime.requestParameters } : {}),
    }
    const configurationFingerprint = createHash('sha256').update(canonicalJson(identity)).digest('hex')

    return Object.freeze({
      fundId: verifiedFundId,
      provider,
      providerType,
      model: runtime.model,
      configurationFingerprint,
      versions: createDiscoveryVersions(configurationFingerprint),
    })
  } catch {
    throw new Error(CONFIGURATION_ERROR)
  }
}

async function runtimeConfig(
  snapshot: ProviderSettingsSnapshot,
  providerType: DiscoveryAIProviderType,
  deps: ProviderDependencies,
): Promise<RuntimeProviderConfig> {
  if (providerType === 'openrouter') {
    const encryptedKey = strictString(snapshot.encryption_key_encrypted)
    const model = strictString(snapshot.openrouter_model, 200)
    const baseUrl = strictString(snapshot.openrouter_base_url, 2048)
    const validation = await deps.validateCustomUrl(baseUrl)
    if (!validation.ok) throw new Error('invalid custom URL')
    const parameters = parseCustomAIProviderRequestParameters(snapshot.openrouter_request_parameters ?? undefined)
    if (!parameters.ok) throw new Error('invalid custom parameters')
    return Object.freeze({
      providerType,
      apiKey: strictDecryptedKey(deps.decryptKey(strictString(snapshot.openrouter_api_key_encrypted, 16_384), encryptedKey)),
      model,
      baseUrl: new URL(validation.url).toString(),
      requestParameters: parameters.value,
    })
  }

  if (providerType === 'ollama') {
    const model = strictString(snapshot.ollama_model, 200)
    const baseUrl = strictString(snapshot.ollama_base_url, 2048)
    const validation = await deps.validateOllamaEgressUrl(baseUrl)
    if (!validation.ok) throw new Error('invalid Ollama URL')
    return Object.freeze({
      providerType,
      apiKey: 'ollama',
      model,
      baseUrl: validation.url,
      publicEgressOnly: validation.publicOnly,
    })
  }

  const encryptedKey = strictString(snapshot.encryption_key_encrypted)
  const fields = providerType === 'anthropic'
    ? [snapshot.claude_api_key_encrypted, snapshot.claude_model]
    : providerType === 'openai'
      ? [snapshot.openai_api_key_encrypted, snapshot.openai_model]
      : [snapshot.gemini_api_key_encrypted, snapshot.gemini_model]
  return Object.freeze({
    providerType,
    apiKey: strictDecryptedKey(deps.decryptKey(strictString(fields[0], 16_384), encryptedKey)),
    model: strictString(fields[1], 200),
  })
}

function strictProvider(value: unknown): DiscoveryAIProviderType {
  if (typeof value !== 'string' || !SUPPORTED_PROVIDERS.has(value as DiscoveryAIProviderType)) throw new Error('unsupported provider')
  return value as DiscoveryAIProviderType
}

function strictString(value: unknown, maxLength = 16_384): string {
  if (typeof value !== 'string' || !value || value.length > maxLength || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('missing provider configuration')
  }
  return value
}

function strictDecryptedKey(value: string): string {
  if (!value || value.length > 4096 || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('invalid provider key')
  return value
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Readonly<Record<string, unknown>>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
