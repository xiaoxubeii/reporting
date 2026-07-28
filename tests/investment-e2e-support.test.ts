import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  assertLocalInvestmentFixtureTarget,
  readExplicitInvestmentProvider,
} from './e2e/support/investment-fixture'

describe('investment E2E fixture safety', () => {
  it.each([
    'http://127.0.0.1:8000',
    'http://localhost:54321',
  ])('allows local Supabase target %s', target => {
    expect(assertLocalInvestmentFixtureTarget(target)).toBe(target)
  })

  it.each([
    'https://project.supabase.co',
    'http://192.168.1.10:8000',
    'not-a-url',
  ])('rejects non-local or malformed target %s', target => {
    expect(() => assertLocalInvestmentFixtureTarget(target)).toThrow(
      'Investment E2E prerequisite writes require local Supabase',
    )
  })

  it('fails closed when the comprehensive investment provider is unconfigured', () => {
    expect(() => readExplicitInvestmentProvider({})).toThrow(
      'E2E_INVESTMENT_PROVIDER is required for the comprehensive investment journey',
    )
  })

  it('contains no service-role prerequisite seeding path for investment terminal state', () => {
    const support = readFileSync(new URL('./e2e/support/investment-fixture.ts', import.meta.url), 'utf8')
    const journey = readFileSync(new URL('./e2e/investment-flow.spec.ts', import.meta.url), 'utf8')
    expect(support).not.toContain('seedNonAiInvestmentPrerequisite')
    expect(journey).not.toContain('seedNonAiInvestmentPrerequisite')
    expect(support).not.toContain('e2e-non-ai-prerequisite')
  })

  it('accepts one explicit OpenAI-compatible E2E credential bundle', () => {
    const result = readExplicitInvestmentProvider({
      E2E_INVESTMENT_PROVIDER: 'openrouter',
      E2E_INVESTMENT_PROVIDER_API_KEY: 'disposable-test-key',
      E2E_INVESTMENT_PROVIDER_MODEL: 'test-model',
      E2E_INVESTMENT_PROVIDER_BASE_URL: 'https://provider.example/v1',
    })

    expect(result.configured).toBe(true)
    if (!result.configured) throw new Error('expected configured provider')
    expect(result.provider).toBe('openrouter')
    expect(result.model).toBe('test-model')
    expect(result.baseUrl).toBe('https://provider.example/v1')
  })

  it('accepts a credential-free local Ollama fixture without weakening remote provider rules', () => {
    const result = readExplicitInvestmentProvider({
      E2E_INVESTMENT_PROVIDER: 'ollama',
      E2E_INVESTMENT_PROVIDER_MODEL: 'reporting-e2e',
      E2E_INVESTMENT_PROVIDER_BASE_URL: 'http://127.0.0.1:43123/v1',
    })

    expect(result).toEqual({
      configured: true,
      provider: 'ollama',
      apiKey: null,
      model: 'reporting-e2e',
      baseUrl: 'http://127.0.0.1:43123/v1',
    })
  })

  it('fails closed for partial, unsupported, or non-HTTPS remote provider configuration', () => {
    expect(() => readExplicitInvestmentProvider({
      E2E_INVESTMENT_PROVIDER: 'openai',
    })).toThrow('E2E_INVESTMENT_PROVIDER_API_KEY')

    expect(() => readExplicitInvestmentProvider({
      E2E_INVESTMENT_PROVIDER: 'borrowed-fund',
      E2E_INVESTMENT_PROVIDER_API_KEY: 'test',
      E2E_INVESTMENT_PROVIDER_MODEL: 'test',
    })).toThrow('Unsupported E2E investment provider')

    expect(() => readExplicitInvestmentProvider({
      E2E_INVESTMENT_PROVIDER: 'openrouter',
      E2E_INVESTMENT_PROVIDER_API_KEY: 'test',
      E2E_INVESTMENT_PROVIDER_MODEL: 'test',
      E2E_INVESTMENT_PROVIDER_BASE_URL: 'http://provider.example/v1',
    })).toThrow('must use HTTPS or localhost')
  })
})
