import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { QAConcurrentSessionError, QAResponseLimitError, recordResponses, startQASession } from './qa'

describe('atomic partner QA response append', () => {
  it('binds the append to the exact Fund, deal, session, and partner', async () => {
    const rpc = vi.fn(async () => ({ data: 'recorded', error: null }))
    const result = await recordResponses({
      admin: { rpc } as never,
      fundId: 'fund-1',
      dealId: 'deal-1',
      draftId: 'draft-1',
      sessionId: 'session-1',
      partnerId: 'partner-1',
      answers: [{ question_id: 'q1', answer_text: 'answer' }],
    })

    expect(result).toEqual({ recorded: 1 })
    expect(rpc).toHaveBeenCalledWith('append_diligence_partner_answers', {
      p_fund_id: 'fund-1',
      p_deal_id: 'deal-1',
      p_draft_id: 'draft-1',
      p_session_id: 'session-1',
      p_partner_id: 'partner-1',
      p_answers: [{ question_id: 'q1', answer_text: 'answer' }],
    })
  })

  it('defines a bounded service-role-only row-locking function', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260728040000_atomic_diligence_partner_answers.sql'),
      'utf8',
    )
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain("SET search_path = ''")
    expect(sql).toContain('p_deal_id')
    expect(sql).toContain("AND stage = 'qa'")
    expect(sql).toContain('CREATE OR REPLACE FUNCTION append_diligence_qa_session_messages')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION finish_diligence_qa_session')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION start_diligence_qa_session')
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('p_expected_message_count')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS draft_id')
    expect(sql).toContain('AND draft_id = p_draft_id')
    expect(sql).toContain("count(DISTINCT answer ->> 'question_id')")
    expect(sql).toContain('REVOKE ALL ON FUNCTION append_diligence_partner_answers')
    expect(sql).toContain('TO service_role')
  })

  it('maps database size limits to a typed request error', async () => {
    const rpc = vi.fn(async () => ({ data: 'limit', error: null }))
    await expect(recordResponses({
      admin: { rpc } as never,
      fundId: 'fund-1',
      dealId: 'deal-1',
      draftId: 'draft-1',
      sessionId: 'session-1',
      partnerId: 'partner-1',
      answers: [{ question_id: 'q1', answer_text: 'answer' }],
    })).rejects.toBeInstanceOf(QAResponseLimitError)
  })

  it('maps a stale Partner append to a retryable concurrency error', async () => {
    const rpc = vi.fn(async () => ({ data: 'stale-draft', error: null }))
    await expect(recordResponses({
      admin: { rpc } as never,
      fundId: 'fund-1',
      dealId: 'deal-1',
      draftId: 'draft-1',
      sessionId: 'session-1',
      partnerId: 'partner-1',
      answers: [{ question_id: 'q1', answer_text: 'answer' }],
    })).rejects.toBeInstanceOf(QAConcurrentSessionError)
  })

  it('does not replace the whole session message snapshot after an AI call', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/memo-agent/stages/qa.ts'), 'utf8')
    expect(source).toContain("admin.rpc('append_diligence_qa_session_messages'")
    expect(source).toContain(".eq('draft_id', draftId)")
    expect(source).not.toContain('.update({ messages:')
  })

  it('starts or reuses an open QA session through one atomic database function', async () => {
    const rpc = vi.fn(async () => ({ data: 'session-1', error: null }))
    await expect(startQASession({
      admin: { rpc } as never,
      fundId: 'fund-1',
      dealId: 'deal-1',
      draftId: 'draft-1',
      userId: 'user-1',
    })).resolves.toBe('session-1')
    expect(rpc).toHaveBeenCalledWith('start_diligence_qa_session', {
      p_fund_id: 'fund-1',
      p_deal_id: 'deal-1',
      p_draft_id: 'draft-1',
      p_user_id: 'user-1',
    })
  })

  it('maps a stale session start to a retryable concurrency error', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    await expect(startQASession({
      admin: { rpc } as never,
      fundId: 'fund-1',
      dealId: 'deal-1',
      draftId: 'draft-1',
      userId: 'user-1',
    })).rejects.toBeInstanceOf(QAConcurrentSessionError)
  })
})
