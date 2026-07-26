import { describe, expect, it, vi } from 'vitest'
import { loadDiligenceOutputLanguage } from './output-language-store'

function query(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(async () => result),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.order.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  return chain
}

describe('loadDiligenceOutputLanguage', () => {
  it('uses the explicit persisted draft snapshot and scopes all identities', async () => {
    const draft = query({ data: { output_language: 'zh-CN' }, error: null })
    const admin = { from: vi.fn(() => draft) } as any
    const result = await loadDiligenceOutputLanguage({
      admin, fundId: 'fund-1', dealId: 'deal-1', draftId: 'draft-1',
    })
    expect(result).toBe('zh-CN')
    expect(draft.eq).toHaveBeenCalledWith('id', 'draft-1')
    expect(draft.eq).toHaveBeenCalledWith('deal_id', 'deal-1')
    expect(draft.eq).toHaveBeenCalledWith('fund_id', 'fund-1')
    expect(admin.from).toHaveBeenCalledTimes(1)
  })

  it('uses the latest active draft before the mutable deal preference', async () => {
    const draft = query({ data: { output_language: 'en' }, error: null })
    const admin = { from: vi.fn(() => draft) } as any
    expect(await loadDiligenceOutputLanguage({ admin, fundId: 'fund-1', dealId: 'deal-1' })).toBe('en')
    expect(draft.eq).toHaveBeenCalledWith('is_draft', true)
    expect(admin.from).toHaveBeenCalledTimes(1)
  })

  it('falls back to the deal preference only when no active draft exists', async () => {
    const latest = query({ data: null, error: null })
    const deal = query({ data: { output_language: 'zh-CN' }, error: null })
    const admin = { from: vi.fn().mockReturnValueOnce(latest).mockReturnValueOnce(deal) } as any
    expect(await loadDiligenceOutputLanguage({ admin, fundId: 'fund-1', dealId: 'deal-1' })).toBe('zh-CN')
    expect(admin.from).toHaveBeenNthCalledWith(1, 'diligence_memo_drafts')
    expect(admin.from).toHaveBeenNthCalledWith(2, 'diligence_deals')
  })

  it('fails closed when an explicit draft does not belong to the identities', async () => {
    const admin = { from: vi.fn(() => query({ data: null, error: null })) } as any
    await expect(loadDiligenceOutputLanguage({
      admin, fundId: 'fund-1', dealId: 'deal-1', draftId: 'cross-fund-draft',
    })).rejects.toThrow('Draft not found')
  })
})
