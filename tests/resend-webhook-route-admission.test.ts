import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  admin: { kind: 'admin' },
  runtime: { kind: 'runtime' },
  createAdminClient: vi.fn(),
  createResendWebhookRuntime: vi.fn(),
  handleResendInboundWebhook: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/email/resend-webhook-runtime', () => ({
  createResendWebhookRuntime: mocks.createResendWebhookRuntime,
}))

vi.mock('@/lib/email/resend-webhook', () => ({
  handleResendInboundWebhook: mocks.handleResendInboundWebhook,
}))

import { POST } from '@/app/api/inbound-email/resend/[routeToken]/route'

const ORIGINAL_ROOT_DOMAIN = process.env.FUND_WORKSPACE_ROOT_DOMAIN
const CONTEXT = { params: { routeToken: 'route-token' } }

function request(hostname: string) {
  return new NextRequest(
    `https://${hostname}/api/inbound-email/resend/${CONTEXT.params.routeToken}`,
    { method: 'POST', body: '{}' },
  )
}

describe('Resend webhook route Host admission', () => {
  beforeEach(() => {
    process.env.FUND_WORKSPACE_ROOT_DOMAIN = 'fundworkspace.com'
    mocks.createAdminClient.mockReset().mockReturnValue(mocks.admin)
    mocks.createResendWebhookRuntime.mockReset().mockReturnValue(mocks.runtime)
    mocks.handleResendInboundWebhook.mockReset().mockResolvedValue({
      status: 200,
      body: { ok: true },
    })
  })

  afterEach(() => {
    if (ORIGINAL_ROOT_DOMAIN === undefined) delete process.env.FUND_WORKSPACE_ROOT_DOMAIN
    else process.env.FUND_WORKSPACE_ROOT_DOMAIN = ORIGINAL_ROOT_DOMAIN
  })

  it('rejects a tenant Host before constructing the privileged webhook runtime', async () => {
    const response = await POST(request('alpha.fundworkspace.com'), CONTEXT)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.createResendWebhookRuntime).not.toHaveBeenCalled()
    expect(mocks.handleResendInboundWebhook).not.toHaveBeenCalled()
  })

  it.each(['fundworkspace.com', 'hooks.fundworkspace.com'])(
    'continues to the signed webhook handler on %s',
    async hostname => {
      const inboundRequest = request(hostname)
      const response = await POST(inboundRequest, CONTEXT)

      expect(response.status).toBe(200)
      expect(mocks.createAdminClient).toHaveBeenCalledOnce()
      expect(mocks.createResendWebhookRuntime).toHaveBeenCalledWith(mocks.admin)
      expect(mocks.handleResendInboundWebhook).toHaveBeenCalledWith(
        inboundRequest,
        CONTEXT.params.routeToken,
        mocks.runtime,
      )
    },
  )
})
