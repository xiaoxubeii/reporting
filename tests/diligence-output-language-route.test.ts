import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const getUser = vi.hoisted(() => vi.fn())
const createAdminClient = vi.hoisted(() => vi.fn(() => ({ admin: true })))
const assertRouteAccess = vi.hoisted(() => vi.fn())
const changeDiligenceOutputLanguage = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/access/gate', () => ({ assertRouteAccess }))
vi.mock('@/lib/diligence/change-output-language', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/diligence/change-output-language')>()
  return { ...actual, changeDiligenceOutputLanguage }
})

describe('POST /api/diligence/[id]/output-language', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    assertRouteAccess.mockResolvedValue({ fundId: 'fund-1', userId: 'user-1', role: 'member' })
    changeDiligenceOutputLanguage.mockResolvedValue({
      status: 'updated', output_language: 'zh-CN', draft_id: 'draft-1', source_draft_id: null,
    })
  })

  it('requires authentication and route access', async () => {
    const { POST } = await import('@/app/api/diligence/[id]/output-language/route')
    getUser.mockResolvedValueOnce({ data: { user: null } })
    const unauthenticated = await POST(request({ output_language: 'zh-CN' }), context)
    expect(unauthenticated.status).toBe(401)

    assertRouteAccess.mockResolvedValueOnce(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    const forbidden = await POST(request({ output_language: 'zh-CN' }), context)
    expect(forbidden.status).toBe(403)
    expect(changeDiligenceOutputLanguage).not.toHaveBeenCalled()
  })

  it('rejects unsupported and injected values before the service', async () => {
    const { POST } = await import('@/app/api/diligence/[id]/output-language/route')
    for (const output_language of ['zh', 'EN', 'zh-CN; drop table', '', null]) {
      const response = await POST(request({ output_language }), context)
      expect(response.status).toBe(400)
    }
    expect(changeDiligenceOutputLanguage).not.toHaveBeenCalled()
  })

  it('delegates only server-resolved fund, deal, and user identities', async () => {
    const { POST } = await import('@/app/api/diligence/[id]/output-language/route')
    const response = await POST(request({
      output_language: 'zh-CN',
      fund_id: 'attacker-fund',
      user_id: 'attacker-user',
      source_draft_id: 'attacker-draft',
      expected_draft_id: 'not-a-uuid',
    }), context)

    expect(response.status).toBe(200)
    expect(changeDiligenceOutputLanguage).toHaveBeenCalledWith(expect.objectContaining({
      fundId: 'fund-1', dealId: 'deal-1', userId: 'user-1', outputLanguage: 'zh-CN',
      confirmVersion: false, expectedDraftId: null,
    }))
    expect(await response.json()).toMatchObject({ status: 'updated', output_language: 'zh-CN' })
  })

  it.each(['noop', 'updated', 'version_created'])(
    'returns the %s service result without changing its semantics',
    async status => {
      changeDiligenceOutputLanguage.mockResolvedValueOnce({
        status, output_language: 'en', draft_id: 'draft-2', source_draft_id: 'draft-1',
      })
      const { POST } = await import('@/app/api/diligence/[id]/output-language/route')
      const response = await POST(request({ output_language: 'en' }), context)
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ status, output_language: 'en' })
    },
  )

  it('returns an authoritative confirmation challenge and accepts only a bound UUID', async () => {
    const { DiligenceOutputLanguageChangeError } = await import('@/lib/diligence/change-output-language')
    changeDiligenceOutputLanguage.mockRejectedValueOnce(
      new DiligenceOutputLanguageChangeError(
        'Confirm creation of a new diligence language version.',
        409,
        'confirmation_required',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ),
    )
    const { POST } = await import('@/app/api/diligence/[id]/output-language/route')
    const challenge = await POST(request({ output_language: 'zh-CN' }), context)
    expect(challenge.status).toBe(409)
    expect(await challenge.json()).toMatchObject({
      confirmation_required: true,
      expected_draft_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })

    const invalidConfirmation = await POST(request({
      output_language: 'zh-CN',
      confirm_version: true,
      expected_draft_id: 'not-a-uuid',
    }), context)
    expect(invalidConfirmation.status).toBe(400)
  })
})

const context = { params: { id: 'deal-1' } }

function request(body: unknown): NextRequest {
  return new NextRequest('https://reporting.example.test/api/diligence/deal-1/output-language', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
