\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'assertion failed: %', message;
  end if;
end;
$$;

create or replace function pg_temp.expect_error(command text, expected_message text)
returns void
language plpgsql
as $$
begin
  begin
    execute command;
  exception when others then
    if position(expected_message in sqlerrm) = 0 then
      raise exception 'expected error containing %, got %', expected_message, sqlerrm;
    end if;
    return;
  end;
  raise exception 'expected command to fail: %', command;
end;
$$;

create or replace function pg_temp.test_vector(x double precision, y double precision)
returns extensions.vector
language sql
immutable
as $$
  select ('[' || x::text || ',' || y::text || ',' || repeat('0,', 1533) || '0]')::extensions.vector;
$$;

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'owner-one@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'owner-two@example.test');

insert into public.funds (id, name, created_by)
values
  ('10000000-0000-0000-0000-000000000001', 'Fund One', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', 'Fund Two', '00000000-0000-0000-0000-000000000002');

insert into public.diligence_deals (id, fund_id, name)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Deal One'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Deal Two');

insert into public.experts
  (id, scope, fund_id, name, email, profile_text, status, embedding, embedding_model)
values
  ('30000000-0000-0000-0000-000000000001', 'global', null, 'Global Best', 'global@example.test', 'Global operator', 'active', pg_temp.test_vector(1, 0), 'test-model'),
  ('30000000-0000-0000-0000-000000000002', 'fund', '10000000-0000-0000-0000-000000000001', 'Fund One A', 'a@example.test', 'A operator', 'active', pg_temp.test_vector(.99, .01), 'test-model'),
  ('30000000-0000-0000-0000-000000000003', 'fund', '10000000-0000-0000-0000-000000000001', 'Fund One B', 'b@example.test', 'B operator', 'active', pg_temp.test_vector(.95, .05), 'test-model'),
  ('30000000-0000-0000-0000-000000000004', 'fund', '10000000-0000-0000-0000-000000000001', 'Fund One C', 'c@example.test', 'C operator', 'active', pg_temp.test_vector(.90, .10), 'test-model'),
  ('30000000-0000-0000-0000-000000000005', 'fund', '10000000-0000-0000-0000-000000000001', 'Fund One D', 'd@example.test', 'D operator', 'active', pg_temp.test_vector(.80, .20), 'test-model'),
  ('30000000-0000-0000-0000-000000000006', 'fund', '10000000-0000-0000-0000-000000000001', 'Fund One E', 'e@example.test', 'E operator', 'active', pg_temp.test_vector(.70, .30), 'test-model'),
  ('30000000-0000-0000-0000-000000000007', 'fund', '10000000-0000-0000-0000-000000000001', 'Fund One F', 'f@example.test', 'F operator', 'active', pg_temp.test_vector(.60, .40), 'test-model'),
  ('30000000-0000-0000-0000-000000000008', 'fund', '10000000-0000-0000-0000-000000000002', 'Other Fund', 'other@example.test', 'Other fund operator', 'active', pg_temp.test_vector(1, 0), 'test-model'),
  ('30000000-0000-0000-0000-000000000009', 'fund', '10000000-0000-0000-0000-000000000001', 'Inactive', 'inactive@example.test', 'Inactive operator', 'inactive', pg_temp.test_vector(1, 0), 'test-model'),
  ('30000000-0000-0000-0000-000000000010', 'fund', '10000000-0000-0000-0000-000000000001', 'No Vector', 'novector@example.test', 'No vector operator', 'active', null, null);

do $$
declare
  matched_ids uuid[];
  result_signature text;
begin
  select array_agg(m.id order by m.ordinality)
    into matched_ids
  from public.match_experts(
    '10000000-0000-0000-0000-000000000001',
    pg_temp.test_vector(1, 0),
    20
  ) with ordinality as m(id, scope, name, title, organization, profile_text, similarity, ordinality);

  perform pg_temp.assert_true(cardinality(matched_ids) = 5, 'matching must clamp results to Top 5');
  perform pg_temp.assert_true(matched_ids[1] = '30000000-0000-0000-0000-000000000001', 'exact cosine must put the identical global vector first');
  perform pg_temp.assert_true(not ('30000000-0000-0000-0000-000000000008' = any(matched_ids)), 'another Fund expert must be excluded');
  perform pg_temp.assert_true(not ('30000000-0000-0000-0000-000000000009' = any(matched_ids)), 'inactive experts must be excluded');
  perform pg_temp.assert_true(not ('30000000-0000-0000-0000-000000000010' = any(matched_ids)), 'experts without embeddings must be excluded');

  select pg_get_function_result('public.match_experts(uuid,extensions.vector,integer)'::regprocedure)
    into result_signature;
  perform pg_temp.assert_true(position('email' in lower(result_signature)) = 0, 'matching result must not expose email');
  perform pg_temp.assert_true(not has_table_privilege('authenticated', 'public.experts', 'select'), 'authenticated clients must not read expert emails directly');
  perform pg_temp.assert_true(not has_function_privilege('authenticated', 'public.match_experts(uuid,extensions.vector,integer)', 'execute'), 'authenticated clients must not invoke matching directly');
  perform pg_temp.assert_true(to_regclass('public.expert_candidates') is null, 'candidate persistence is out of scope');
  perform pg_temp.assert_true(to_regclass('public.expert_matching_runs') is null, 'matching-run persistence is out of scope');
end;
$$;

select pg_temp.expect_error(
  $sql$
    insert into public.diligence_expert_requests
      (fund_id, deal_id, source_kind, source_ref, question, expert_profile, context_snapshot,
       expert_id, selection_method, expert_name, expert_email, expert_snapshot)
    values
      ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
       'research_gap', '{"draftId":"draft-1","kind":"research_gap","index":0,"snapshot":{}}',
       'Cross-fund question?', 'Operator', 'Sanitized context',
       '30000000-0000-0000-0000-000000000008', 'manual', 'Other Fund', 'other@example.test', '{}')
  $sql$,
  'selected expert is outside the request fund scope'
);

select pg_temp.expect_error(
  $sql$
    insert into public.diligence_expert_requests
      (fund_id, deal_id, source_kind, source_ref, question, expert_profile, context_snapshot)
    values
      ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
       'research_gap', '{"draftId":"draft-1","kind":"research_gap","index":0,"snapshot":{}}',
       'Wrong deal scope?', 'Operator', 'Sanitized context')
  $sql$,
  'diligence_expert_request_deal_scope_fkey'
);

insert into public.diligence_expert_requests
  (id, fund_id, deal_id, source_kind, source_ref, question, expert_profile, context_snapshot,
   expert_id, selection_method, expert_name, expert_email, expert_snapshot)
values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'research_gap', '{"draftId":"draft-1","kind":"research_gap","index":0,"snapshot":{"gap":"yield"}}',
   'What yield is achievable?', 'Factory operator', 'Sanitized yield context',
   '30000000-0000-0000-0000-000000000002', 'manual', 'Fund One A', 'a@example.test', '{"profileText":"A operator"}'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'contradiction', '{"draftId":"draft-1","kind":"contradiction","index":0,"snapshot":{"claim":"margin"}}',
   'Which margin claim is credible?', 'Market operator', 'Sanitized margin context',
   '30000000-0000-0000-0000-000000000003', 'auto_match', 'Fund One B', 'b@example.test', '{"profileText":"B operator"}');

select pg_temp.expect_error(
  $sql$
    update public.diligence_expert_requests
    set status = 'submitted', response_markdown = 'Skipped invitation', submitted_at = now()
    where id = '40000000-0000-0000-0000-000000000002'
  $sql$,
  'invalid expert request state transition'
);

update public.diligence_expert_requests
set status = 'invited', token_hash = repeat('a', 64), expires_at = now() + interval '1 day', invited_at = now()
where id = '40000000-0000-0000-0000-000000000002';

select pg_temp.expect_error(
  $sql$
    update public.diligence_expert_requests
    set status = 'draft', token_hash = null, expires_at = null, invited_at = null
    where id = '40000000-0000-0000-0000-000000000002'
  $sql$,
  'invalid expert request state transition'
);

update public.diligence_expert_requests
set token_hash = repeat('b', 64), expires_at = now() + interval '2 days', invited_at = now()
where id = '40000000-0000-0000-0000-000000000002'
  and status = 'invited' and token_hash = repeat('a', 64);

select pg_temp.assert_true(
  not exists (select 1 from public.diligence_expert_requests where token_hash = repeat('a', 64)),
  'rotating an invitation must invalidate the previous token hash'
);

update public.diligence_expert_requests
set status = 'submitted', response_markdown = 'Immutable expert answer', submitted_at = now()
where id = '40000000-0000-0000-0000-000000000002'
  and status = 'invited' and token_hash = repeat('b', 64) and expires_at > now() and response_markdown is null;

select pg_temp.expect_error(
  $sql$
    update public.diligence_expert_requests
    set response_markdown = 'Mutated answer'
    where id = '40000000-0000-0000-0000-000000000002'
  $sql$,
  'submitted expert response is immutable'
);

select pg_temp.expect_error(
  $sql$
    update public.diligence_expert_requests
    set token_hash = repeat('c', 64)
    where id = '40000000-0000-0000-0000-000000000002'
  $sql$,
  'submitted expert request credential is immutable'
);

insert into public.diligence_documents
  (id, deal_id, fund_id, storage_path, file_name, file_format, source_kind)
values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 'deal-1/expert-validation/request-2.md',
   'expert-validation-request-2.md', 'md', 'industry_expert'),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 'deal-1/expert-validation/other.md',
   'expert-validation-other.md', 'md', 'industry_expert');

update public.diligence_expert_requests
set document_id = '50000000-0000-0000-0000-000000000001'
where id = '40000000-0000-0000-0000-000000000002';

select pg_temp.expect_error(
  $sql$
    update public.diligence_expert_requests
    set document_id = '50000000-0000-0000-0000-000000000002'
    where id = '40000000-0000-0000-0000-000000000002'
  $sql$,
  'materialized expert document link is immutable'
);

select pg_temp.assert_true(
  (select (public.enqueue_ingest_if_deal_idle(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    array['50000000-0000-0000-0000-000000000001'::uuid],
    null,
    'expert-validation:request-2'
  )->>'enqueued')::boolean),
  'the first per-Deal Ingest enqueue must succeed'
);

select pg_temp.assert_true(
  not (select (public.enqueue_ingest_if_deal_idle(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    array['50000000-0000-0000-0000-000000000001'::uuid],
    null,
    'expert-validation:request-2'
  )->>'enqueued')::boolean),
  'an active Deal job must prevent a second enqueue'
);

update public.memo_agent_jobs set status = 'success' where deal_id = '20000000-0000-0000-0000-000000000001';

select pg_temp.assert_true(
  (select count(*) from public.diligence_expert_requests where id = '40000000-0000-0000-0000-000000000001' and status = 'draft') = 1,
  'the concurrency fixture must remain a selected draft request'
);

select 'expert validation database assertions passed' as result;
