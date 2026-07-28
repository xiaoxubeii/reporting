import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/lib/types/database'

export type AnalystConversationAppendResult =
  | 'persisted'
  | 'conflict'
  | 'scope-conflict'
  | 'not-found'
  | 'limit'
  | 'failed'

interface AppendAnalystConversationTurnParams {
  admin: SupabaseClient
  conversationId: string
  fundId: string
  userId: string
  expectedMessageCount: number
  expectedCompanyId: string | null
  expectedDealId: string | null
  expectedScope: string | null
  userMessage: Json
  assistantMessage: Json
}

const KNOWN_RESULTS = new Set<AnalystConversationAppendResult>([
  'persisted',
  'conflict',
  'scope-conflict',
  'not-found',
  'limit',
])

export async function appendAnalystConversationTurn(
  params: AppendAnalystConversationTurnParams
): Promise<AnalystConversationAppendResult> {
  const { data, error } = await params.admin.rpc('append_analyst_conversation_turn', {
    p_conversation_id: params.conversationId,
    p_fund_id: params.fundId,
    p_user_id: params.userId,
    p_expected_message_count: params.expectedMessageCount,
    p_expected_company_id: params.expectedCompanyId,
    p_expected_deal_id: params.expectedDealId,
    p_expected_scope: params.expectedScope,
    p_user_message: params.userMessage,
    p_assistant_message: params.assistantMessage,
  })

  if (error || typeof data !== 'string' || !KNOWN_RESULTS.has(data as AnalystConversationAppendResult)) {
    return 'failed'
  }
  return data as AnalystConversationAppendResult
}
