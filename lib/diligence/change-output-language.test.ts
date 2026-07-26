import { describe, expect, it, vi } from 'vitest'
import {
  changeDiligenceOutputLanguage,
  DiligenceOutputLanguageChangeError,
} from './change-output-language'

const params = {
  fundId: 'fund-1',
  dealId: 'deal-1',
  userId: 'user-1',
  outputLanguage: 'zh-CN' as const,
}

describe('changeDiligenceOutputLanguage', () => {
  it('calls only the atomic RPC with server-resolved identity fields', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'version_created', output_language: 'zh-CN', draft_id: 'draft-2', source_draft_id: 'draft-1' },
      error: null,
    }))
    const result = await changeDiligenceOutputLanguage({ admin: { rpc } as any, ...params })

    expect(rpc).toHaveBeenCalledWith('change_diligence_output_language', {
      p_deal_id: 'deal-1',
      p_fund_id: 'fund-1',
      p_output_language: 'zh-CN',
      p_user_id: 'user-1',
      p_confirm_version: false,
      p_expected_draft_id: null,
    })
    expect(result.status).toBe('version_created')
  })

  it('surfaces an authoritative version confirmation with the expected source draft', async () => {
    const admin = {
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: 'P0001',
          message: 'DILIGENCE_LANGUAGE_CONFIRMATION_REQUIRED',
          details: 'draft-1',
        },
      })),
    } as any

    await expect(changeDiligenceOutputLanguage({ admin, ...params })).rejects.toMatchObject({
      status: 409,
      code: 'confirmation_required',
      expectedDraftId: 'draft-1',
    })
  })

  it('binds a confirmed switch to the draft the user actually confirmed', async () => {
    const rpc = vi.fn(async () => ({
      data: { status: 'version_created', output_language: 'zh-CN', draft_id: 'draft-2', source_draft_id: 'draft-1' },
      error: null,
    }))

    await changeDiligenceOutputLanguage({
      admin: { rpc } as any,
      ...params,
      confirmVersion: true,
      expectedDraftId: 'draft-1',
    })

    expect(rpc).toHaveBeenCalledWith('change_diligence_output_language', expect.objectContaining({
      p_confirm_version: true,
      p_expected_draft_id: 'draft-1',
    }))
  })

  it.each([
    ['55006', 409],
    ['P0002', 404],
    ['XX000', 500],
  ])('maps database code %s to status %s', async (code, status) => {
    const admin = { rpc: vi.fn(async () => ({ data: null, error: { code, message: 'private detail' } })) } as any
    await expect(changeDiligenceOutputLanguage({ admin, ...params })).rejects.toMatchObject({
      status,
      name: 'DiligenceOutputLanguageChangeError',
    } satisfies Partial<DiligenceOutputLanguageChangeError>)
  })

  it('fails closed on an unknown RPC response shape', async () => {
    const admin = { rpc: vi.fn(async () => ({ data: { status: 'surprise' }, error: null })) } as any
    await expect(changeDiligenceOutputLanguage({ admin, ...params })).rejects.toMatchObject({ status: 500 })
  })
})
