-- Atomically append one chat-derived Q&A record to the latest live memo draft.
-- The service role is the only caller; application handlers perform user authorization first.
CREATE OR REPLACE FUNCTION append_diligence_qa_answer(
  p_fund_id uuid,
  p_deal_id uuid,
  p_stable_id text,
  p_entry jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_id uuid;
  current_answers jsonb;
BEGIN
  IF p_stable_id IS NULL
    OR jsonb_typeof(p_entry) IS DISTINCT FROM 'object'
    OR p_entry ->> 'question_id' IS DISTINCT FROM p_stable_id
    OR length(p_stable_id) = 0
    OR length(p_stable_id) > 256
    OR octet_length(p_entry::text) > 131072 THEN
    RAISE EXCEPTION 'invalid QA evidence entry';
  END IF;

  SELECT id, coalesce(qa_answers, '[]'::jsonb)
    INTO target_id, current_answers
  FROM public.diligence_memo_drafts
  WHERE fund_id = p_fund_id
    AND deal_id = p_deal_id
    AND is_draft = true
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF target_id IS NULL THEN
    RETURN 'no-draft';
  END IF;

  IF jsonb_typeof(current_answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'existing QA evidence must be an array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(current_answers) AS item
    WHERE item ->> 'question_id' = p_stable_id
  ) THEN
    RETURN 'duplicate';
  END IF;

  IF jsonb_array_length(current_answers) >= 200 THEN
    RETURN 'limit';
  END IF;

  UPDATE public.diligence_memo_drafts
  SET qa_answers = current_answers || jsonb_build_array(p_entry)
  WHERE id = target_id
    AND fund_id = p_fund_id
    AND deal_id = p_deal_id
    AND is_draft = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft changed while appending QA evidence';
  END IF;

  RETURN 'promoted';
END;
$$;

REVOKE ALL ON FUNCTION append_diligence_qa_answer(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION append_diligence_qa_answer(uuid, uuid, text, jsonb) TO service_role;

-- Atomically replace only the records owned by the current memo-agent QA session, preserving
-- partner-authored and Analyst-derived entries appended by other transactions.
CREATE OR REPLACE FUNCTION replace_diligence_session_qa_answers(
  p_fund_id uuid,
  p_deal_id uuid,
  p_draft_id uuid,
  p_session_ids text[],
  p_session_records jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_answers jsonb;
  preserved_answers jsonb;
  merged_answers jsonb;
BEGIN
  IF jsonb_typeof(p_session_records) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_session_records) > 200
    OR octet_length(p_session_records::text) > 6291456
    OR coalesce(cardinality(p_session_ids), 0) > 200
    OR EXISTS (SELECT 1 FROM unnest(coalesce(p_session_ids, ARRAY[]::text[])) AS id WHERE id IS NULL OR length(id) = 0 OR length(id) > 256)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_session_records) AS item
      WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
        OR length(coalesce(item ->> 'question_id', '')) = 0
        OR length(item ->> 'question_id') > 256
        OR octet_length(item::text) > 1200000
    ) THEN
    RAISE EXCEPTION 'session records must be a JSON array';
  END IF;

  SELECT coalesce(qa_answers, '[]'::jsonb)
    INTO current_answers
  FROM public.diligence_memo_drafts
  WHERE id = p_draft_id
    AND fund_id = p_fund_id
    AND deal_id = p_deal_id
    AND is_draft = true
  FOR UPDATE;

  IF current_answers IS NULL THEN
    RAISE EXCEPTION 'draft not found or already finalized';
  END IF;

  IF jsonb_typeof(current_answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'existing QA evidence must be an array';
  END IF;

  SELECT coalesce(jsonb_agg(item), '[]'::jsonb)
    INTO preserved_answers
  FROM jsonb_array_elements(current_answers) AS item
  WHERE NOT ((item ->> 'question_id') = ANY(coalesce(p_session_ids, ARRAY[]::text[])));

  merged_answers := p_session_records || preserved_answers;
  IF jsonb_array_length(merged_answers) > 400
    OR octet_length(merged_answers::text) > 35651584 THEN
    RAISE EXCEPTION 'QA evidence limit exceeded';
  END IF;

  UPDATE public.diligence_memo_drafts
  SET qa_answers = merged_answers
  WHERE id = p_draft_id
    AND fund_id = p_fund_id
    AND deal_id = p_deal_id
    AND is_draft = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft changed while replacing QA evidence';
  END IF;

  RETURN merged_answers;
END;
$$;

REVOKE ALL ON FUNCTION replace_diligence_session_qa_answers(uuid, uuid, uuid, text[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replace_diligence_session_qa_answers(uuid, uuid, uuid, text[], jsonb) TO service_role;

CREATE OR REPLACE FUNCTION set_diligence_qa_answer_excluded(
  p_fund_id uuid,
  p_deal_id uuid,
  p_draft_id uuid,
  p_question_id text,
  p_excluded boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_answers jsonb;
  next_answers jsonb;
BEGIN
  IF p_question_id IS NULL OR length(p_question_id) = 0 OR length(p_question_id) > 256 THEN
    RAISE EXCEPTION 'invalid question id';
  END IF;
  SELECT coalesce(qa_answers, '[]'::jsonb)
    INTO current_answers
  FROM public.diligence_memo_drafts
  WHERE id = p_draft_id AND fund_id = p_fund_id AND deal_id = p_deal_id AND is_draft = true
  FOR UPDATE;

  IF current_answers IS NULL THEN RETURN 'no-draft'; END IF;
  IF jsonb_typeof(current_answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'existing QA evidence must be an array';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(current_answers) AS item
    WHERE item ->> 'question_id' = p_question_id
  ) THEN RETURN 'not-found'; END IF;

  SELECT jsonb_agg(
    CASE WHEN item ->> 'question_id' = p_question_id
      THEN jsonb_set(item, '{excluded}', to_jsonb(p_excluded), true)
      ELSE item END
  ) INTO next_answers
  FROM jsonb_array_elements(current_answers) AS item;

  UPDATE public.diligence_memo_drafts SET qa_answers = next_answers
  WHERE id = p_draft_id AND fund_id = p_fund_id AND deal_id = p_deal_id AND is_draft = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft changed while updating QA evidence'; END IF;
  RETURN 'updated';
END;
$$;

REVOKE ALL ON FUNCTION set_diligence_qa_answer_excluded(uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_diligence_qa_answer_excluded(uuid, uuid, uuid, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION delete_diligence_qa_answer(
  p_fund_id uuid,
  p_deal_id uuid,
  p_draft_id uuid,
  p_question_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_answers jsonb;
  next_answers jsonb;
BEGIN
  IF p_question_id IS NULL OR length(p_question_id) = 0 OR length(p_question_id) > 256 THEN
    RAISE EXCEPTION 'invalid question id';
  END IF;
  SELECT coalesce(qa_answers, '[]'::jsonb)
    INTO current_answers
  FROM public.diligence_memo_drafts
  WHERE id = p_draft_id AND fund_id = p_fund_id AND deal_id = p_deal_id AND is_draft = true
  FOR UPDATE;

  IF current_answers IS NULL THEN RETURN 'no-draft'; END IF;
  IF jsonb_typeof(current_answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'existing QA evidence must be an array';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(current_answers) AS item
    WHERE item ->> 'question_id' = p_question_id
  ) THEN RETURN 'not-found'; END IF;

  SELECT coalesce(jsonb_agg(item), '[]'::jsonb) INTO next_answers
  FROM jsonb_array_elements(current_answers) AS item
  WHERE item ->> 'question_id' IS DISTINCT FROM p_question_id;

  UPDATE public.diligence_memo_drafts SET qa_answers = next_answers
  WHERE id = p_draft_id AND fund_id = p_fund_id AND deal_id = p_deal_id AND is_draft = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft changed while deleting QA evidence'; END IF;
  RETURN 'deleted';
END;
$$;

REVOKE ALL ON FUNCTION delete_diligence_qa_answer(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_diligence_qa_answer(uuid, uuid, uuid, text) TO service_role;
