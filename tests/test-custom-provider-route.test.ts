import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const getUser = vi.hoisted(() => vi.fn())
const rateLimit = vi.hoisted(() => vi.fn())
const assertAdminAccess = vi.hoisted(() => vi.fn())
const createMessage = vi.hoisted(() => vi.fn())
const OpenAIProvider = vi.hoisted(() => vi.fn().mockImplementation(() => ({ createMessage })))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/api-helpers', () => ({ assertAdminAccess }))
vi.mock('@/lib/validate-url', () => ({
  validateCustomProviderUrl: async (url: string) => url.includes('169.254.')
    ? { ok: false as const, error: 'Link-local addresses are not allowed' }
    : { ok: true as const, url },
}))

vi.mock('@/lib/rate-limit', () => ({ rateLimit }))
vi.mock('@/lib/ai/openai', () => ({ OpenAIProvider }))

import { POST } from '@/app/api/test-custom-provider/route'

describe('POST /api/test-custom-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    rateLimit.mockResolvedValue(null)
    assertAdminAccess.mockResolvedValue({ fundId: 'fund-1', role: 'admin' })
    createMessage.mockResolvedValue({
      text: 'ok',
      usage: { inputTokens: 1, outputTokens: 1 },
      truncated: false,
    })
  })

  it('tests chat completions with the submitted endpoint and exact model', async () => {
    const response = await POST(request({
      apiKey: ' custom-secret ',
      baseUrl: ' https://gateway.example/v1 ',
      model: ' exact-model ',
      requestParameters: { thinking: { type: 'disabled' } },
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(OpenAIProvider).toHaveBeenCalledWith(
      'custom-secret',
      'https://gateway.example/v1',
      {
        requestParameters: { thinking: { type: 'disabled' } },
        rejectRedirects: true,
      },
    )
    expect(createMessage).toHaveBeenCalledWith({
      model: 'exact-model',
      maxTokens: 1,
      content: 'Hi',
    })
  })

  it('rejects incomplete input before creating a provider', async () => {
    const response = await POST(request({
      apiKey: 'custom-secret',
      baseUrl: '',
      model: 'exact-model',
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Custom OpenAI-compatible provider requires: Base URL.',
    })
    expect(OpenAIProvider).not.toHaveBeenCalled()
  })

  it('requires fund admin access before testing a server-side endpoint', async () => {
    assertAdminAccess.mockResolvedValueOnce(
      NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
    )

    const response = await POST(request({
      apiKey: 'custom-secret',
      baseUrl: 'https://gateway.example/v1',
      model: 'exact-model',
    }))

    expect(response.status).toBe(403)
    expect(OpenAIProvider).not.toHaveBeenCalled()
  })

  it('rejects unsafe endpoint URLs before making a request', async () => {
    const response = await POST(request({
      apiKey: 'custom-secret',
      baseUrl: 'http://169.254.169.254/v1',
      model: 'exact-model',
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Link-local addresses are not allowed' })
    expect(OpenAIProvider).not.toHaveBeenCalled()
  })

  it('rejects protected custom parameters before making a request', async () => {
    const response = await POST(request({
      apiKey: 'custom-secret',
      baseUrl: 'https://gateway.example/v1',
      model: 'exact-model',
      requestParameters: { messages: [{ role: 'user', content: 'override' }] },
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Custom parameter "messages" is managed by Reporting or may contain credentials.',
    })
    expect(OpenAIProvider).not.toHaveBeenCalled()
  })
})

function request(body: unknown): NextRequest {
  return new NextRequest('https://reporting.example.test/api/test-custom-provider', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
