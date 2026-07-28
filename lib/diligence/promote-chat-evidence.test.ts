import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  mergeSessionAndExternalQAAnswers,
  promoteDiligenceChatEvidence,
  replaceDiligenceSessionQAAnswers,
} from './promote-chat-evidence'

describe('promoteDiligenceChatEvidence', () => {
  const rpc = vi.fn()

  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: 'promoted', error: null })
  })

  const input = (overrides: Record<string, unknown> = {}) => ({
    admin: { rpc } as unknown as SupabaseClient,
    fundId: 'fund-1',
    dealId: 'deal-1',
    userId: 'user-1',
    question: 'What supports the revenue claim?',
    answer: 'The operating plan supports it.',
    citations: [{ document_id: 'doc-1', summary: 'Revenue table' }],
    stableId: 'analyst-conv-1-hash',
    conversationId: 'conv-1',
    model: 'claude-sonnet-4',
    answeredAt: '2026-07-28T00:00:00.000Z',
    ...overrides,
  })

  it('delegates deduplication and append to one atomic database RPC', async () => {
    await expect(promoteDiligenceChatEvidence(input())).resolves.toBe('promoted')

    expect(rpc).toHaveBeenCalledWith('append_diligence_qa_answer', {
      p_fund_id: 'fund-1',
      p_deal_id: 'deal-1',
      p_stable_id: 'analyst-conv-1-hash',
      p_entry: {
        question_id: 'analyst-conv-1-hash',
        question_text: 'What supports the revenue claim?',
        answer_text: 'The operating plan supports it.',
        partner_id: null,
        requested_by: 'user-1',
        answered_at: '2026-07-28T00:00:00.000Z',
        generated_at: '2026-07-28T00:00:00.000Z',
        feeds_dimensions: [],
        category: 'chat_qa',
        source: 'analyst_project_chat',
        source_kind: 'assistant_derived',
        evidence_class: 'derived_answer',
        verification_status: 'unverified',
        excluded: true,
        conversation_id: 'conv-1',
        model: 'claude-sonnet-4',
        citations: [{ document_id: 'doc-1', summary: 'Revenue table' }],
      },
    })
  })

  it.each(['duplicate', 'no-draft', 'limit'] as const)('returns the database result %s', async result => {
    rpc.mockResolvedValue({ data: result, error: null })
    await expect(promoteDiligenceChatEvidence(input())).resolves.toBe(result)
  })

  it('keeps chat delivery best-effort when the RPC fails or returns an unknown value', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('write failed') })
    await expect(promoteDiligenceChatEvidence(input())).resolves.toBe('failed')

    rpc.mockResolvedValueOnce({ data: 'unexpected', error: null })
    await expect(promoteDiligenceChatEvidence(input())).resolves.toBe('failed')
  })

  it('uses a service-role-only, bounded, row-locking database function', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260728010000_atomic_diligence_qa_evidence.sql'), 'utf8')
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain('jsonb_array_length')
    expect(sql).toContain("RETURN 'duplicate'")
    expect(sql).toContain('REVOKE ALL ON FUNCTION append_diligence_qa_answer')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION append_diligence_qa_answer')
    expect(sql).toContain('TO service_role')
  })

  it('atomically replaces one QA-session slice while preserving concurrent external evidence', async () => {
    const merged = [
      { question_id: 'library_q_1', answer_text: 'Session answer' },
      { question_id: 'analyst_conv_hash', category: 'chat_qa', answer_text: 'Chat answer' },
    ]
    rpc.mockResolvedValue({ data: merged, error: null })

    await expect(replaceDiligenceSessionQAAnswers({
      admin: { rpc } as unknown as SupabaseClient,
      fundId: 'fund-1',
      dealId: 'deal-1',
      draftId: 'draft-1',
      sessionRecords: [merged[0]],
    })).resolves.toEqual(merged)

    expect(rpc).toHaveBeenCalledWith('replace_diligence_session_qa_answers', {
      p_fund_id: 'fund-1',
      p_deal_id: 'deal-1',
      p_draft_id: 'draft-1',
      p_session_ids: ['library_q_1'],
      p_session_records: [merged[0]],
    })
  })

  it('defines the QA-session replacement RPC with the same service-role and row-lock boundary', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260728010000_atomic_diligence_qa_evidence.sql'), 'utf8')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION replace_diligence_session_qa_answers')
    expect(sql).toContain('REVOKE ALL ON FUNCTION replace_diligence_session_qa_answers')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION replace_diligence_session_qa_answers')
    expect(sql.match(/FOR UPDATE/g)?.length).toBeGreaterThanOrEqual(2)
    expect(sql).toContain('octet_length(p_session_records::text) > 6291456')
    expect(sql).toContain('jsonb_array_length(merged_answers) > 400')
    expect(sql).toContain('octet_length(merged_answers::text) > 35651584')
  })
})

describe('mergeSessionAndExternalQAAnswers', () => {
  it('keeps chat, partner, and future external entries when the agent QA stage finishes', () => {
    const session = [{ question_id: 'library_q_1', answer_text: 'New session answer' }]
    const existing = [
      { question_id: 'library_q_1', answer_text: 'Stale session answer' },
      { question_id: 'partner_q_1', answer_text: 'Partner answer' },
      { question_id: 'analyst_conv_hash', category: 'chat_qa', answer_text: 'Chat answer' },
    ]

    expect(mergeSessionAndExternalQAAnswers(session, existing)).toEqual([
      session[0],
      existing[1],
      existing[2],
    ])
  })
})
