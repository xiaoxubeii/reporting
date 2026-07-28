import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  rateLimit: vi.fn(),
}))

vi.mock('@/lib/tenancy/system-request', () => ({
  admitsRegisteredSystemRequest: () => true,
}))
vi.mock('@/lib/rate-limit', () => ({
  getClientIp: () => '203.0.113.9',
  rateLimit: mocks.rateLimit,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

import { POST as postPostmark } from '@/app/api/inbound-email/route'
import { POST as postMailgun } from '@/app/api/inbound-email/mailgun/route'

beforeEach(() => {
  mocks.createAdminClient.mockReset()
  mocks.rateLimit.mockReset()
  mocks.rateLimit.mockResolvedValue(null)
})

describe('provider webhook body limits', () => {
  it('acknowledges a missing Postmark token before creating storage access', async () => {
    const request = new NextRequest('https://hooks.example.test/api/inbound-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    })

    const response = await postPostmark(request)

    expect(response.status).toBe(200)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('acknowledges an oversized Postmark request without parsing or persistence', async () => {
    const request = new NextRequest('https://hooks.example.test/api/inbound-email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(41 * 1024 * 1024),
      },
      body: '{}',
    })

    const response = await postPostmark(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('acknowledges an oversized Mailgun request without multipart parsing or persistence', async () => {
    const request = new NextRequest('https://hooks.example.test/api/inbound-email/mailgun', {
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=e2e',
        'content-length': String(33 * 1024 * 1024),
      },
      body: '--e2e--\r\n',
    })

    const response = await postMailgun(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
})
