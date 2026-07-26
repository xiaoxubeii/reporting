\set ON_ERROR_STOP on

begin;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  v_fund_id uuid;
  v_user_id uuid;
  v_candidate_id uuid := gen_random_uuid();
  v_expert_id uuid;
  v_repeat_id uuid;
  v_rejected_id uuid := gen_random_uuid();
  v_other_fund_id uuid := gen_random_uuid();
  v_other_expert_id uuid := gen_random_uuid();
  v_other_user_id uuid := gen_random_uuid();
begin
  select members.fund_id, members.user_id into v_fund_id, v_user_id
  from public.fund_members members
  where members.role = 'admin'
  order by members.created_at
  limit 1;
  if v_fund_id is null then raise exception 'admin fixture required'; end if;

  insert into public.expert_candidates (
    id, fund_id, identity_fingerprint, discovery_query, name, organization,
    profile_text, source_evidence, discovered_by
  ) values (
    v_candidate_id, v_fund_id, encode(digest(v_candidate_id::text, 'sha256'), 'hex'),
    'migration test', 'Migration Test Expert', 'Test Hospital', 'Clinical investigator',
    '[{"sourceId":"pubmed","recordId":"1","recordTitle":"Test","url":"https://pubmed.ncbi.nlm.nih.gov/1/","role":"Author"}]',
    v_user_id
  );

  v_expert_id := public.confirm_expert_candidate(
    v_candidate_id, v_fund_id, v_user_id, 'migration-test@example.test',
    'Migration Test Expert', 'Investigator', 'Test Hospital', 'Clinical investigator'
  );
  v_repeat_id := public.confirm_expert_candidate(
    v_candidate_id, v_fund_id, v_user_id, 'migration-test@example.test',
    'Migration Test Expert', 'Investigator', 'Test Hospital', 'Clinical investigator'
  );
  if v_expert_id is distinct from v_repeat_id then raise exception 'confirmation is not idempotent'; end if;
  if not exists (
    select 1 from public.experts
    where id = v_expert_id and fund_id = v_fund_id and scope = 'fund'
      and source_type = 'discovery' and verification_type = 'fund_confirmed'
  ) then raise exception 'confirmed expert trust contract is invalid'; end if;
  if not exists (
    select 1 from public.expert_candidates
    where id = v_candidate_id and status = 'confirmed' and confirmed_expert_id = v_expert_id
  ) then raise exception 'candidate was not confirmed'; end if;

  insert into auth.users (id, email)
  values (v_other_user_id, 'other-fund-owner@example.test');
  insert into public.funds (id, name, created_by)
  values (v_other_fund_id, 'Other fund tenant test', v_other_user_id);
  insert into public.experts (
    id, scope, fund_id, name, email, profile_text, status, created_by,
    verification_type, source_type, verified_at, verified_by
  ) values (
    v_other_expert_id, 'fund', v_other_fund_id, 'Other Fund Expert',
    'other-fund-expert@example.test', 'Other tenant expert', 'active', v_other_user_id,
    'fund_confirmed', 'manual', now(), v_other_user_id
  );
  begin
    update public.expert_candidates
    set confirmed_expert_id = v_other_expert_id
    where id = v_candidate_id;
    raise exception 'cross-fund candidate link was accepted';
  exception when foreign_key_violation then null;
  end;

  insert into public.expert_candidates (
    id, fund_id, identity_fingerprint, discovery_query, name, profile_text,
    source_evidence, discovered_by, status, reviewed_by, reviewed_at, rejection_reason
  ) values (
    v_rejected_id, v_fund_id, encode(digest(v_rejected_id::text, 'sha256'), 'hex'),
    'migration test', 'Rejected Expert', 'Rejected profile', '[]', v_user_id,
    'rejected', v_user_id, now(), 'not relevant'
  );
  begin
    perform public.confirm_expert_candidate(
      v_rejected_id, v_fund_id, v_user_id, 'rejected@example.test',
      'Rejected Expert', '', '', 'Rejected profile'
    );
    raise exception 'rejected candidate was confirmed';
  exception when sqlstate '22023' then null;
  end;

  if has_table_privilege('authenticated', 'public.expert_candidates', 'select') then
    raise exception 'authenticated client can read candidates';
  end if;
  if has_function_privilege('authenticated', 'public.confirm_expert_candidate(uuid,uuid,uuid,text,text,text,text,text)', 'execute') then
    raise exception 'authenticated client can confirm candidates';
  end if;
end;
$$;

rollback;
