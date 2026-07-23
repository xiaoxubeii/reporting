import { describe, expect, it } from 'vitest'
import { assertSameOriginSearchRequest, readSearchJson, SearchRequestBodyError } from './route-input'

function request(body: string, headers: Record<string, string> = {}) {
  return new Request('https://app.test/api/search', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', Origin: 'https://app.test', 'Sec-Fetch-Site': 'same-origin', ...headers },
  })
}

describe('search route input', () => {
  it('accepts same-origin JSON and parses it', async () => {
    const value = request('{"query":"device"}')
    expect(() => assertSameOriginSearchRequest(value)).not.toThrow()
    await expect(readSearchJson(value)).resolves.toEqual({ query: 'device' })
  })

  it('rejects cross-origin and non-JSON requests', () => {
    expect(() => assertSameOriginSearchRequest(request('{}', { Origin: 'https://evil.test' }))).toThrow(SearchRequestBodyError)
    expect(() => assertSameOriginSearchRequest(request('{}', { 'Content-Type': 'text/plain' }))).toThrowError(expect.objectContaining({ status: 415 }))
  })

  it('returns a distinct too-large error', async () => {
    await expect(readSearchJson(request(JSON.stringify({ query: 'x'.repeat(17_000) })))).rejects.toMatchObject({ status: 413 })
  })
})
