ALTER TABLE public.analyst_conversations
  ADD COLUMN IF NOT EXISTS server_trusted_at timestamptz;

CREATE OR REPLACE FUNCTION append_analyst_conversation_turn(
  p_conversation_id uuid,
  p_fund_id uuid,
  p_user_id uuid,
  p_expected_message_count integer,
  p_expected_company_id uuid,
  p_expected_deal_id uuid,
  p_expected_scope text,
  p_user_message jsonb,
  p_assistant_message jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_messages jsonb;
  current_message_count integer;
  current_company_id uuid;
  current_deal_id uuid;
  current_scope text;
  trusted_at timestamptz;
  next_messages jsonb;
BEGIN
  IF p_expected_message_count < 0
    OR p_expected_message_count > 198
    OR jsonb_typeof(p_user_message) IS DISTINCT FROM 'object'
    OR p_user_message ->> 'role' IS DISTINCT FROM 'user'
    OR jsonb_typeof(p_user_message -> 'content') IS DISTINCT FROM 'string'
    OR length(coalesce(p_user_message ->> 'content', '')) = 0
    OR jsonb_typeof(p_assistant_message) IS DISTINCT FROM 'object'
    OR p_assistant_message ->> 'role' IS DISTINCT FROM 'assistant'
    OR jsonb_typeof(p_assistant_message -> 'content') IS DISTINCT FROM 'string'
    OR length(coalesce(p_assistant_message ->> 'content', '')) = 0
    OR octet_length(p_user_message::text) > 262144
    OR octet_length(p_assistant_message::text) > 262144 THEN
    RETURN 'limit';
  END IF;

  SELECT messages, message_count, company_id, deal_id, scope, server_trusted_at
    INTO current_messages, current_message_count, current_company_id, current_deal_id, current_scope, trusted_at
  FROM public.analyst_conversations
  WHERE id = p_conversation_id
    AND fund_id = p_fund_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not-found';
  END IF;

  IF current_company_id IS DISTINCT FROM p_expected_company_id
    OR current_deal_id IS DISTINCT FROM p_expected_deal_id
    OR current_scope IS DISTINCT FROM p_expected_scope
    OR (p_expected_scope LIKE 'diligence:%' AND trusted_at IS NULL) THEN
    RETURN 'scope-conflict';
  END IF;

  IF jsonb_typeof(current_messages) IS DISTINCT FROM 'array'
    OR current_message_count IS DISTINCT FROM jsonb_array_length(current_messages)
    OR current_message_count IS DISTINCT FROM p_expected_message_count THEN
    RETURN 'conflict';
  END IF;

  IF current_message_count + 2 > 200 THEN
    RETURN 'limit';
  END IF;

  next_messages := current_messages || jsonb_build_array(p_user_message, p_assistant_message);
  IF octet_length(next_messages::text) > 2097152 THEN
    RETURN 'limit';
  END IF;

  UPDATE public.analyst_conversations
  SET messages = next_messages,
      message_count = current_message_count + 2,
      updated_at = now()
  WHERE id = p_conversation_id
    AND fund_id = p_fund_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN 'conflict';
  END IF;
  RETURN 'persisted';
END;
$$;

REVOKE ALL ON FUNCTION append_analyst_conversation_turn(uuid, uuid, uuid, integer, uuid, uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION append_analyst_conversation_turn(uuid, uuid, uuid, integer, uuid, uuid, text, jsonb, jsonb)
  TO service_role;
