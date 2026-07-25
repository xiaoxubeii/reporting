import { describe, expect, it } from 'vitest'

import {
  backgroundJobSecret,
  backgroundJobInternalOrigin,
  backgroundJobInternalUrl,
} from './config'

describe('background job runtime configuration', () => {
  it('requires a separate secret with at least 32 encoded bytes', () => {
    expect(() => backgroundJobSecret({})).toThrow('BACKGROUND_JOB_TOKEN_SECRET')
    expect(() => backgroundJobSecret({ BACKGROUND_JOB_TOKEN_SECRET: 'short' })).toThrow('at least 32 bytes')
    expect(backgroundJobSecret({ BACKGROUND_JOB_TOKEN_SECRET: 'a'.repeat(32) })).toBe('a'.repeat(32))
  })

  it('accepts an exact HTTPS origin and loopback HTTP for local development', () => {
    expect(backgroundJobInternalOrigin({ BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://reporting.example' })).toBe('https://reporting.example')
    expect(backgroundJobInternalOrigin({ BACKGROUND_JOB_INTERNAL_ORIGIN: 'http://127.0.0.1:5000' })).toBe('http://127.0.0.1:5000')
    expect(backgroundJobInternalOrigin({ BACKGROUND_JOB_INTERNAL_ORIGIN: 'http://localhost:3000/' })).toBe('http://localhost:3000')
  })

  it('rejects missing, public fallback, credentials, paths, query, fragments, and insecure remote origins', () => {
    const invalid = [
      {},
      { NEXT_PUBLIC_APP_URL: 'https://public.example' },
      { BACKGROUND_JOB_INTERNAL_ORIGIN: 'http://reporting.example' },
      { BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://user:pass@reporting.example' },
      { BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://reporting.example/internal' },
      { BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://reporting.example?x=1' },
      { BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://reporting.example#x' },
    ]
    for (const env of invalid) expect(() => backgroundJobInternalOrigin(env)).toThrow('BACKGROUND_JOB_INTERNAL_ORIGIN')
  })

  it('constructs only literal internal API paths on the configured origin', () => {
    const env = {
      BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://reporting.example',
      NEXT_PUBLIC_APP_URL: 'https://public-attacker.example',
      HOST: 'forwarded-attacker.example',
      FORWARDED_HOST: 'forwarded-attacker.example',
      DATABASE_WORKER_URL: 'https://database-attacker.example',
      MODEL_WORKER_URL: 'https://model-attacker.example',
    }
    expect(backgroundJobInternalUrl('/api/internal/background-jobs/deal-research/run', env))
      .toBe('https://reporting.example/api/internal/background-jobs/deal-research/run')
    for (const path of ['https://attacker.example/api/x', '//attacker.example/x', '/not-api', '/api/x?next=https://attacker.example']) {
      expect(() => backgroundJobInternalUrl(path, env)).toThrow('internal API path')
    }
  })
})
