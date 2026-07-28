import { describe, expect, it } from 'vitest'

import { validateCustomProviderUrl, validateOllamaEgressUrl } from '../lib/validate-url'
import { safeCustomProviderLookup } from '../lib/ai/custom-provider-fetch'

describe('custom provider URL validation', () => {
  it('allows explicit local Ollama only outside production or with the deployment opt-in', async () => {
    await expect(validateOllamaEgressUrl('http://127.0.0.1:11434/v1', {
      NODE_ENV: 'development',
    })).resolves.toEqual({
      ok: true,
      url: 'http://127.0.0.1:11434/v1',
      publicOnly: false,
    })
    await expect(validateOllamaEgressUrl('http://127.0.0.1:11434/v1', {
      NODE_ENV: 'production',
    })).resolves.toEqual({
      ok: false,
      error: 'Custom provider Base URL must use HTTPS',
    })
    await expect(validateOllamaEgressUrl('http://127.0.0.1:11434/v1', {
      NODE_ENV: 'production',
      ALLOW_PRIVATE_OLLAMA_EGRESS: 'true',
    })).resolves.toEqual({
      ok: true,
      url: 'http://127.0.0.1:11434/v1',
      publicOnly: false,
    })
  })

  it('requires public DNS-pinned, redirect-free egress for production Ollama', async () => {
    await expect(validateOllamaEgressUrl('https://93.184.216.34/v1', {
      NODE_ENV: 'production',
    })).resolves.toEqual({
      ok: true,
      url: 'https://93.184.216.34/v1',
      publicOnly: true,
    })
  })

  it('fails closed when the runtime environment is not explicitly development or test', async () => {
    await expect(validateOllamaEgressUrl('http://127.0.0.1:11434/v1', {})).resolves.toEqual({
      ok: false,
      error: 'Custom provider Base URL must use HTTPS',
    })
  })

  it('accepts a public HTTPS address', async () => {
    await expect(validateCustomProviderUrl('https://93.184.216.34/v1')).resolves.toEqual({
      ok: true,
      url: 'https://93.184.216.34/v1',
    })
  })

  it('rejects plaintext HTTP for hosted custom providers', async () => {
    await expect(validateCustomProviderUrl('http://93.184.216.34/v1')).resolves.toEqual({
      ok: false,
      error: 'Custom provider Base URL must use HTTPS',
    })
  })

  it.each([
    'https://localhost:3000/v1',
    'https://127.0.0.1:3000/v1',
    'https://[::1]:3000/v1',
  ])('rejects local server-side egress target %s', async (url) => {
    await expect(validateCustomProviderUrl(url)).resolves.toEqual({
      ok: false,
      error: 'Local addresses are not allowed for custom providers',
    })
  })

  it('rejects credentials embedded in the Base URL', async () => {
    await expect(validateCustomProviderUrl('https://user:password@93.184.216.34/v1'))
      .resolves.toEqual({
        ok: false,
        error: 'Credentials are not allowed in the Base URL',
      })
  })

  it.each([
    'https://93.184.216.34/v1?api_key=secret',
    'https://93.184.216.34/v1#secret',
  ])('rejects query parameters and fragments in the Base URL: %s', async (url) => {
    await expect(validateCustomProviderUrl(url)).resolves.toEqual({
      ok: false,
      error: 'Query parameters and fragments are not allowed in the Base URL',
    })
  })

  it.each([
    'https://[::ffff:7f00:1]/v1',
    'https://[::ffff:a9fe:a9fe]/v1',
  ])('rejects hexadecimal IPv4-mapped IPv6 target %s', async (url) => {
    await expect(validateCustomProviderUrl(url)).resolves.toEqual({
      ok: false,
      error: 'Base URL must resolve only to public addresses',
    })
  })

  it('blocks non-public DNS results at the actual connection lookup', async () => {
    await expect(new Promise((resolve, reject) => {
      safeCustomProviderLookup('localhost', { all: false }, (error, address) => {
        if (error) reject(error)
        else resolve(address)
      })
    })).rejects.toThrow('Custom provider resolved to a non-public address')
  })
})
