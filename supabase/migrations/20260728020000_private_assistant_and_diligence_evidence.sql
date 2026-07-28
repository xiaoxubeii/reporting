-- Keep private Analyst threads and diligence evidence behind server-side authorization.
-- API routes use the service role only after checking membership, live feature access, exact Fund,
-- and (for conversations) the owning user. Direct Data API access would bypass those checks.

REVOKE ALL ON TABLE public.analyst_conversations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.analyst_conversations TO service_role;

DROP POLICY IF EXISTS "Fund members can manage analyst conversations" ON public.analyst_conversations;
DROP POLICY IF EXISTS "Fund members manage analyst conversations" ON public.analyst_conversations;
DROP POLICY IF EXISTS "Fund members can read analyst conversations" ON public.analyst_conversations;
DROP POLICY IF EXISTS "Fund writers can insert analyst conversations" ON public.analyst_conversations;
DROP POLICY IF EXISTS "Fund writers can update analyst conversations" ON public.analyst_conversations;
DROP POLICY IF EXISTS "Fund writers can delete analyst conversations" ON public.analyst_conversations;
DROP POLICY IF EXISTS analyst_conversations_owner_select ON public.analyst_conversations;
DROP POLICY IF EXISTS analyst_conversations_owner_insert ON public.analyst_conversations;
DROP POLICY IF EXISTS analyst_conversations_owner_update ON public.analyst_conversations;
DROP POLICY IF EXISTS analyst_conversations_owner_delete ON public.analyst_conversations;

-- Defense in depth if a future migration restores authenticated grants: a signed-in user can only
-- address their own thread and must still belong to its Fund.
CREATE POLICY analyst_conversations_owner_select ON public.analyst_conversations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND fund_id = ANY(public.get_my_fund_ids()));
CREATE POLICY analyst_conversations_owner_insert ON public.analyst_conversations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND fund_id = ANY(public.get_my_fund_ids()));
CREATE POLICY analyst_conversations_owner_update ON public.analyst_conversations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND fund_id = ANY(public.get_my_fund_ids()))
  WITH CHECK (user_id = auth.uid() AND fund_id = ANY(public.get_my_fund_ids()));
CREATE POLICY analyst_conversations_owner_delete ON public.analyst_conversations
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND fund_id = ANY(public.get_my_fund_ids()));

-- Legacy Q&A history is read only through the compatibility API. Memo drafts are generated and
-- edited through gated server routes. Neither table needs a browser Data API capability.
REVOKE ALL ON TABLE public.diligence_qa_chats FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.diligence_qa_chats TO service_role;
DROP POLICY IF EXISTS diligence_qa_chats_insert ON public.diligence_qa_chats;
DROP POLICY IF EXISTS diligence_qa_chats_select ON public.diligence_qa_chats;
DROP POLICY IF EXISTS diligence_qa_chats_update ON public.diligence_qa_chats;
DROP POLICY IF EXISTS diligence_qa_chats_delete ON public.diligence_qa_chats;

REVOKE ALL ON TABLE public.diligence_memo_drafts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.diligence_memo_drafts TO service_role;
DROP POLICY IF EXISTS diligence_memo_drafts_all ON public.diligence_memo_drafts;

-- QA session messages contain Partner responses and are mutated only through the bounded,
-- draft-bound service functions. Browser access would bypass their locks and limits.
REVOKE ALL ON TABLE public.diligence_agent_sessions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.diligence_agent_sessions TO service_role;
DROP POLICY IF EXISTS diligence_agent_sessions_all ON public.diligence_agent_sessions;
