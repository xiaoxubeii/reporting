import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { createAdminClient } from '@/lib/supabase/admin'
import { matchExperts, saveExpert, selectExpert, toDirectoryEntry } from './service'

const createExpertEmbedding = vi.hoisted(() => vi.fn())

vi.mock('./embedding', async () => {
  const actual = await vi.importActual<typeof import('./embedding')>('./embedding')
  return { ...actual, createExpertEmbedding }
})

type Admin = ReturnType<typeof createAdminClient>

beforeEach(() => {
  createExpertEmbedding.mockReset()
})

describe('expert directory service', () => {
  it('redacts contact data from directory DTOs', () => {
    const entry = toDirectoryEntry({
      id: 'expert-1', scope: 'global', name: 'Ada', title: 'COO', organization: 'Factory',
      profile_text: 'Scaled regulated production', status: 'active', embedding: '[1,0]',
    })
    expect(entry).toEqual({
      id: 'expert-1', scope: 'global', name: 'Ada', title: 'COO', organization: 'Factory',
      profileText: 'Scaled regulated production', status: 'active', hasEmbedding: true,
    })
    expect(entry).not.toHaveProperty('email')
  })

  it('saves the profile without a vector when embedding generation fails', async () => {
    createExpertEmbedding.mockRejectedValueOnce(new Error('provider unavailable'))
    let inserted: Record<string, unknown> | null = null
    const returned = {
      id: 'expert-1', scope: 'fund', name: 'Ada', title: null, organization: null,
      profile_text: 'Factory operations', status: 'active', embedding: null,
    }
    const write = {
      select: () => write,
      single: async () => ({ data: returned, error: null }),
    }
    const admin = {
      from: () => ({
        insert: (values: Record<string, unknown>) => {
          inserted = values
          return write
        },
      }),
    } as unknown as Admin

    const result = await saveExpert({
      admin,
      fundId: 'fund-1',
      userId: 'user-1',
      input: {
        scope: 'fund', name: 'Ada', email: 'ada@example.test', title: null,
        organization: null, profileText: 'Factory operations', status: 'active',
      },
    })

    expect(inserted).toMatchObject({ embedding: null, embedding_model: null, fund_id: 'fund-1' })
    expect(result.expert.hasEmbedding).toBe(false)
    expect(result.embeddingWarning).toContain('automatic matching is unavailable')
  })

  it('uses only question and profile for one exact Top 5 RPC request', async () => {
    createExpertEmbedding.mockResolvedValueOnce([1, ...Array.from({ length: 1535 }, () => 0)])
    const rpc = vi.fn(async () => ({
      data: [{
        id: 'expert-1', scope: 'global', name: 'Ada', title: null, organization: null,
        profile_text: 'Operator', similarity: 0.98,
      }],
      error: null,
    }))
    const admin = { rpc } as unknown as Admin

    const result = await matchExperts({
      admin,
      fundId: 'fund-1',
      question: 'Can the plant reach 92% yield?',
      expertProfile: 'Semiconductor fab operator',
    })

    expect(createExpertEmbedding).toHaveBeenCalledTimes(1)
    expect(createExpertEmbedding.mock.calls[0]?.[2]).toBe(
      'Validation question:\nCan the plant reach 92% yield?\n\nRequired expert profile:\nSemiconductor fab operator',
    )
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('match_experts', expect.objectContaining({ p_fund_id: 'fund-1', p_match_count: 5 }))
    expect(result).toHaveLength(1)
    expect(result[0]).not.toHaveProperty('email')
  })

  it.each(['manual', 'auto_match'] as const)('uses the shared confirmation write for %s selection', async selectionMethod => {
    let updateValues: Record<string, unknown> | null = null
    const expert = {
      id: 'expert-1', scope: 'fund', fund_id: 'fund-1', name: 'Ada', email: 'ada@example.test',
      title: 'COO', organization: 'Factory', profile_text: 'Operations', status: 'active',
    }
    const expertQuery = chainResult(expert)
    const requestQuery = {
      update: (values: Record<string, unknown>) => {
        updateValues = values
        return chainResult(requestRow({ ...values, selection_method: selectionMethod }))
      },
    }
    const admin = {
      from: (table: string) => table === 'experts' ? expertQuery : requestQuery,
    } as unknown as Admin

    const result = await selectExpert({
      admin,
      fundId: 'fund-1',
      dealId: 'deal-1',
      requestId: 'request-1',
      expertId: 'expert-1',
      selectionMethod,
    })

    expect(updateValues).toMatchObject({
      expert_id: 'expert-1', expert_name: 'Ada', expert_email: 'ada@example.test', selection_method: selectionMethod,
    })
    expect(result.selectionMethod).toBe(selectionMethod)
    expect(result.status).toBe('draft')
  })
})

function chainResult(data: unknown) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data, error: null }),
  }
  return chain
}

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1', fund_id: 'fund-1', deal_id: 'deal-1', created_by: 'user-1',
    source_kind: 'research_gap', source_ref: { draftId: 'draft-1', kind: 'research_gap', index: 0, snapshot: {} },
    question: 'Question?', expert_profile: 'Operator', context_snapshot: 'Context',
    expert_id: null, selection_method: null, expert_name: null, expert_email: null, expert_snapshot: null,
    token_hash: null, expires_at: null, invited_at: null, email_provider_accepted_at: null,
    email_message_id: null, email_error_code: null, email_error_message: null,
    response_markdown: null, submitted_at: null, document_id: null, materialization_error: null,
    status: 'draft', created_at: '2030-01-01T00:00:00.000Z', updated_at: '2030-01-01T00:00:00.000Z',
    ...overrides,
  }
}
