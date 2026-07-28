import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const rateLimit = vi.hoisted(() => vi.fn())

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: () => '203.0.113.8',
  rateLimit,
}))

import { POST } from '@/app/api/public/submit/[token]/route'

beforeEach(() => {
  rateLimit.mockReset()
  rateLimit.mockResolvedValue(NextResponse.json({ error: 'limited' }, { status: 429 }))
})

describe('public Pitch submission rate limiting', () => {
  it('uses the trusted platform client IP instead of a caller-controlled forwarded chain', async () => {
    const request = new NextRequest('https://alpha.example.test/api/public/submit/token', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.99' },
      body: '{}',
    })

    const response = await POST(request, { params: { token: 'token' } })

    expect(response.status).toBe(429)
    expect(rateLimit).toHaveBeenCalledWith({
      key: 'public-submit:203.0.113.8',
      limit: 5,
      windowSeconds: 3600,
    })
  })
})
