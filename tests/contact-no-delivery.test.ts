import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const sendPlatformEmail = vi.hoisted(() => vi.fn())

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: () => '203.0.113.11',
  rateLimit: () => Promise.resolve(null),
}))
vi.mock('@/lib/email/system', () => ({ sendPlatformEmail }))

import { POST } from '@/app/api/contact/route'

beforeEach(() => sendPlatformEmail.mockReset())

describe('Contact E2E no-delivery boundary', () => {
  it('accepts and discards the honeypot request without invoking the mail provider', async () => {
    const request = new NextRequest('https://fundworkspace.example/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E no delivery',
        email: 'reporting-e2e@example.invalid',
        message: 'This request must never reach a real inbox.',
        website: 'e2e-no-delivery',
        t: Date.now() - 3_000,
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(sendPlatformEmail).not.toHaveBeenCalled()
  })
})
