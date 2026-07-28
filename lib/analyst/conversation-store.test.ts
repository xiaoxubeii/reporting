import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { appendAnalystConversationTurn } from './conversation-store'

describe('appendAnalystConversationTurn', () => {
  it('uses one scope-safe CAS RPC instead of overwriting the full message array', async () => {
    const rpc = vi.fn(async () => ({ data: 'persisted', error: null }))

    await expect(appendAnalystConversationTurn({
      admin: { rpc } as unknown as SupabaseClient,
      conversationId: '11111111-1111-4111-8111-111111111111',
      fundId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      expectedMessageCount: 4,
      expectedCompanyId: null,
      expectedDealId: null,
      expectedScope: 'diligence:44444444-4444-4444-8444-444444444444',
      userMessage: { role: 'user', content: 'Question' },
      assistantMessage: { role: 'assistant', content: 'Answer' },
    })).resolves.toBe('persisted')

    expect(rpc).toHaveBeenCalledWith('append_analyst_conversation_turn', {
      p_conversation_id: '11111111-1111-4111-8111-111111111111',
      p_fund_id: '22222222-2222-4222-8222-222222222222',
      p_user_id: '33333333-3333-4333-8333-333333333333',
      p_expected_message_count: 4,
      p_expected_company_id: null,
      p_expected_deal_id: null,
      p_expected_scope: 'diligence:44444444-4444-4444-8444-444444444444',
      p_user_message: { role: 'user', content: 'Question' },
      p_assistant_message: { role: 'assistant', content: 'Answer' },
    })
  })

  it.each(['conflict', 'scope-conflict', 'not-found', 'limit'] as const)(
    'returns the fail-closed database result %s',
    async result => {
      const rpc = vi.fn(async () => ({ data: result, error: null }))
      await expect(appendAnalystConversationTurn({
        admin: { rpc } as unknown as SupabaseClient,
        conversationId: 'conversation-1',
        fundId: 'fund-1',
        userId: 'user-1',
        expectedMessageCount: 0,
        expectedCompanyId: null,
        expectedDealId: null,
        expectedScope: null,
        userMessage: { role: 'user', content: 'Question' },
        assistantMessage: { role: 'assistant', content: 'Answer' },
      })).resolves.toBe(result)
    },
  )

  it('defines a bounded, service-role-only, scope-safe row-locking RPC', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260728030000_atomic_analyst_conversation_append.sql'),
      'utf8',
    )
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain('p_expected_message_count')
    expect(sql).toContain('p_expected_scope')
    expect(sql).toContain("RETURN 'conflict'")
    expect(sql).toContain("RETURN 'scope-conflict'")
    expect(sql).toContain("SET search_path = ''")
    expect(sql).toContain('REVOKE ALL ON FUNCTION append_analyst_conversation_turn')
    expect(sql).toContain('TO service_role')
  })
})
