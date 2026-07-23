import { describe, expect, it } from 'vitest'

import {
  CUSTOM_AI_PROVIDER_REQUEST_PARAMETERS_MAX_BYTES,
  CUSTOM_AI_PROVIDER_LABEL,
  getCustomAIProviderInputError,
  getCustomAIProviderValidationError,
  getMissingCustomAIProviderFields,
  isCustomAIProviderConfigured,
  parseCustomAIProviderRequestParameters,
} from '../lib/ai/custom-provider'

describe('custom OpenAI-compatible provider contract', () => {
  it('uses generic user-facing language instead of naming OpenRouter', () => {
    expect(CUSTOM_AI_PROVIDER_LABEL).toBe('Custom (OpenAI-compatible)')
  })

  it('is configured only when key, base URL, and model are present', () => {
    expect(isCustomAIProviderConfigured({
      hasApiKey: true,
      baseUrl: 'https://gateway.example/v1',
      model: 'vendor/model',
    })).toBe(true)

    expect(isCustomAIProviderConfigured({
      hasApiKey: true,
      baseUrl: '   ',
      model: 'vendor/model',
    })).toBe(false)

    expect(isCustomAIProviderConfigured({
      hasApiKey: false,
      baseUrl: 'https://gateway.example/v1',
      model: 'vendor/model',
    })).toBe(false)
  })

  it('reports the exact missing fields for API and UI errors', () => {
    expect(getMissingCustomAIProviderFields({
      hasApiKey: false,
      baseUrl: '',
      model: '  ',
    })).toEqual(['API key', 'Base URL', 'Model'])

    expect(getCustomAIProviderValidationError({
      hasApiKey: true,
      baseUrl: 'https://gateway.example/v1',
      model: '',
    })).toBe('Custom OpenAI-compatible provider requires: Model.')

    expect(getCustomAIProviderValidationError({
      hasApiKey: true,
      baseUrl: 'https://gateway.example/v1',
      model: 'vendor/model',
    })).toBeNull()
  })

  it('rejects malformed or unbounded settings input before trimming it', () => {
    expect(getCustomAIProviderInputError({ baseUrl: true })).toBe('Base URL must be a string.')
    expect(getCustomAIProviderInputError({ model: 'x'.repeat(257) })).toBe('Model is too long.')
    expect(getCustomAIProviderInputError({
      apiKey: 'key',
      baseUrl: 'https://gateway.example/v1',
      model: 'vendor/model',
    })).toBeNull()
  })

  it('accepts and immutably copies nested JSON request parameters', () => {
    const input = {
      thinking: { type: 'disabled' },
      temperature: 0.2,
      stop: ['DONE'],
    }

    const result = parseCustomAIProviderRequestParameters(input)

    expect(result).toEqual({ ok: true, value: input })
    if (result.ok) {
      expect(result.value).not.toBe(input)
      expect(result.value.thinking).not.toBe(input.thinking)
    }
  })

  it.each([null, [], 'not-an-object', 1])(
    'rejects non-object request parameters: %j',
    (parameters) => {
      expect(parseCustomAIProviderRequestParameters(parameters)).toEqual({
        ok: false,
        error: 'Custom parameters must be a JSON object.',
      })
    },
  )

  it('treats omitted request parameters as an empty object', () => {
    expect(parseCustomAIProviderRequestParameters(undefined)).toEqual({
      ok: true,
      value: {},
    })
  })

  it.each([
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
  ])('rejects protected or credential-like root parameter %s', (field) => {
    expect(parseCustomAIProviderRequestParameters({ [field]: 'override' })).toEqual({
      ok: false,
      error: `Custom parameter "${field}" is managed by Reporting or may contain credentials.`,
    })
  })

  it.each(['__proto__', 'prototype', 'constructor'])(
    'rejects unsafe key %s recursively',
    (field) => {
      const input = JSON.parse(`{"thinking":{"${field}":{}}}`)
      expect(parseCustomAIProviderRequestParameters(input)).toEqual({
        ok: false,
        error: `Custom parameter key "${field}" is not allowed.`,
      })
    },
  )

  it.each([
    'Authorization',
    'client_secret',
    'vendorApiKey',
    'access-token',
    'auth_token',
    'bearer_token',
    'refresh_token',
    'id_token',
    'private_key',
    'secret_key',
    'credential',
    'credentials',
    'client_key',
  ])(
    'rejects nested credential-like key %s case-insensitively',
    (field) => {
      expect(parseCustomAIProviderRequestParameters({ vendor: { [field]: 'secret' } }))
        .toEqual({
          ok: false,
          error: `Custom parameter "${field}" is managed by Reporting or may contain credentials.`,
        })
    },
  )

  it('rejects excessive nesting and serialized size', () => {
    const deeplyNested = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
      .reduceRight<unknown>((value, key) => ({ [key]: value }), true)
    expect(parseCustomAIProviderRequestParameters(deeplyNested))
      .toEqual({ ok: false, error: 'Custom parameters are nested too deeply.' })

    expect(parseCustomAIProviderRequestParameters({
      value: 'x'.repeat(CUSTOM_AI_PROVIDER_REQUEST_PARAMETERS_MAX_BYTES),
    })).toEqual({ ok: false, error: 'Custom parameters are too large.' })
  })
})
