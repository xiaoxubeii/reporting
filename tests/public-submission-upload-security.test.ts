import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rateLimit: vi.fn(),
  scanFileAsync: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}))
vi.mock('@/lib/rate-limit', () => ({
  getClientIp: () => '203.0.113.10',
  rateLimit: mocks.rateLimit,
}))
vi.mock('@/lib/tenancy/request', () => ({
  fundMatchesTrustedRequestTenant: () => Promise.resolve(true),
}))
vi.mock('@/lib/security/scan-file', () => ({
  scanFileAsync: mocks.scanFileAsync,
}))

import { POST } from '@/app/api/public/submit/[token]/route'

const TEST_ROUTE_SEGMENT = 'public-fixture'

function fundSettingsQuery() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: {
            fund_id: 'fund-security-test',
            deal_intake_enabled: true,
            deal_submission_token: TEST_ROUTE_SEGMENT,
          },
          error: null,
        }),
      }),
    }),
  }
}

function pitchBody(attachment: { name: string; contentType: string; data: string }) {
  return {
    companyName: 'Security Test Co',
    founderName: 'Founder',
    founderEmail: 'founder@example.test',
    pitch: 'A sufficiently detailed public pitch used to test upload security boundaries.',
    attachment,
  }
}

beforeEach(() => {
  mocks.from.mockReset()
  mocks.from.mockImplementation(() => fundSettingsQuery())
  mocks.rateLimit.mockReset()
  mocks.rateLimit.mockResolvedValue(null)
  mocks.scanFileAsync.mockReset()
})

describe('public Pitch upload security', () => {
  it('rejects an oversized JSON envelope before decoding an attachment', async () => {
    const request = new NextRequest(`https://alpha.example.test/api/public/submit/${TEST_ROUTE_SEGMENT}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(15 * 1024 * 1024),
      },
      body: '{}',
    })

    const response = await POST(request, { params: { token: TEST_ROUTE_SEGMENT } })

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({ error: 'Submission is too large' })
    expect(mocks.scanFileAsync).not.toHaveBeenCalled()
  })

  it('runs the asynchronous file scanner and rejects unsafe or zip-bomb content before persistence', async () => {
    const bytes = Buffer.from('PK\u0003\u0004 compressed attack fixture')
    mocks.scanFileAsync.mockResolvedValue({ safe: false, reason: 'ZIP compression ratio too high' })
    const request = new NextRequest(`https://alpha.example.test/api/public/submit/${TEST_ROUTE_SEGMENT}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(pitchBody({
        name: 'pitch.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        data: bytes.toString('base64'),
      })),
    })

    const response = await POST(request, { params: { token: TEST_ROUTE_SEGMENT } })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Attachment failed security scan' })
    expect(mocks.scanFileAsync).toHaveBeenCalledWith(
      bytes,
      'pitch.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })
})
