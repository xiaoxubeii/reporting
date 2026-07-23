export const CUSTOM_AI_PROVIDER_LABEL = 'Custom (OpenAI-compatible)'
export const CUSTOM_AI_PROVIDER_REQUEST_PARAMETERS_MAX_BYTES = 8_192

const CUSTOM_AI_PROVIDER_REQUEST_PARAMETERS_MAX_DEPTH = 8
const UNSAFE_PARAMETER_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const PROTECTED_PARAMETER_KEYS = new Set([
  'model',
  'messages',
  'max_tokens',
  'max_completion_tokens',
  'stream',
  'stream_options',
  'n',
  'tools',
  'tool_choice',
  'parallel_tool_calls',
  'functions',
  'function_call',
  'authorization',
  'api_key',
  'apiKey',
  'access_token',
])

export type CustomAIProviderJsonValue =
  | string
  | number
  | boolean
  | null
  | CustomAIProviderJsonValue[]
  | { [key: string]: CustomAIProviderJsonValue }

export type CustomAIProviderRequestParameters = Record<string, CustomAIProviderJsonValue>

export type CustomAIProviderRequestParametersResult =
  | { ok: true; value: CustomAIProviderRequestParameters }
  | { ok: false; error: string }

export interface CustomAIProviderConfigState {
  hasApiKey: boolean
  baseUrl: string | null | undefined
  model: string | null | undefined
}

export interface CustomAIProviderPatchInput {
  apiKey?: unknown
  baseUrl?: unknown
  model?: unknown
  requestParameters?: unknown
}

const CUSTOM_PROVIDER_FIELD_LIMITS = {
  apiKey: 10_000,
  baseUrl: 2_048,
  model: 256,
} as const

export function getCustomAIProviderInputError(
  input: CustomAIProviderPatchInput,
): string | null {
  const fields = [
    ['API key', input.apiKey, CUSTOM_PROVIDER_FIELD_LIMITS.apiKey],
    ['Base URL', input.baseUrl, CUSTOM_PROVIDER_FIELD_LIMITS.baseUrl],
    ['Model', input.model, CUSTOM_PROVIDER_FIELD_LIMITS.model],
  ] as const

  for (const [label, value, maxLength] of fields) {
    if (value === undefined) continue
    if (typeof value !== 'string') return `${label} must be a string.`
    if (value.length > maxLength) return `${label} is too long.`
  }

  if (input.requestParameters !== undefined) {
    const result = parseCustomAIProviderRequestParameters(input.requestParameters)
    if (!result.ok) return result.error
  }

  return null
}

export function parseCustomAIProviderRequestParameters(
  input: unknown,
): CustomAIProviderRequestParametersResult {
  if (input === undefined) return { ok: true, value: {} }
  if (!isPlainObject(input)) {
    return { ok: false, error: 'Custom parameters must be a JSON object.' }
  }

  const validationError = validateJsonValue(input, 1)
  if (validationError) return { ok: false, error: validationError }

  for (const key of Object.keys(input)) {
    if (PROTECTED_PARAMETER_KEYS.has(key)) {
      return {
        ok: false,
        error: `Custom parameter "${key}" is managed by Reporting or may contain credentials.`,
      }
    }
  }

  let serialized: string
  try {
    serialized = JSON.stringify(input)
  } catch {
    return { ok: false, error: 'Custom parameters must contain valid JSON values.' }
  }

  if (new TextEncoder().encode(serialized).length > CUSTOM_AI_PROVIDER_REQUEST_PARAMETERS_MAX_BYTES) {
    return { ok: false, error: 'Custom parameters are too large.' }
  }

  return {
    ok: true,
    value: JSON.parse(serialized) as CustomAIProviderRequestParameters,
  }
}

function validateJsonValue(value: unknown, depth: number): string | null {
  if (depth > CUSTOM_AI_PROVIDER_REQUEST_PARAMETERS_MAX_DEPTH) {
    return 'Custom parameters are nested too deeply.'
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? null : 'Custom parameters must contain valid JSON values.'
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const error = validateJsonValue(item, depth + 1)
      if (error) return error
    }
    return null
  }
  if (!isPlainObject(value)) return 'Custom parameters must contain valid JSON values.'

  for (const [key, nestedValue] of Object.entries(value)) {
    if (UNSAFE_PARAMETER_KEYS.has(key)) {
      return `Custom parameter key "${key}" is not allowed.`
    }
    if (isCredentialLikeParameterKey(key)) {
      return `Custom parameter "${key}" is managed by Reporting or may contain credentials.`
    }
    const error = validateJsonValue(nestedValue, depth + 1)
    if (error) return error
  }
  return null
}

function isCredentialLikeParameterKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return normalized === 'authorization' ||
    normalized === 'password' ||
    normalized === 'secret' ||
    normalized === 'token' ||
    normalized === 'key' ||
    normalized.includes('credential') ||
    normalized.endsWith('token') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('password') ||
    normalized.endsWith('privatekey') ||
    normalized.endsWith('secretkey') ||
    normalized.endsWith('clientkey') ||
    normalized.endsWith('apikey')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function getMissingCustomAIProviderFields(
  config: CustomAIProviderConfigState,
): string[] {
  return [
    !config.hasApiKey ? 'API key' : null,
    !config.baseUrl?.trim() ? 'Base URL' : null,
    !config.model?.trim() ? 'Model' : null,
  ].filter((field): field is string => field !== null)
}

export function isCustomAIProviderConfigured(
  config: CustomAIProviderConfigState,
): boolean {
  return getMissingCustomAIProviderFields(config).length === 0
}

export function getCustomAIProviderValidationError(
  config: CustomAIProviderConfigState,
): string | null {
  const missingFields = getMissingCustomAIProviderFields(config)
  return missingFields.length > 0
    ? `Custom OpenAI-compatible provider requires: ${missingFields.join(', ')}.`
    : null
}
