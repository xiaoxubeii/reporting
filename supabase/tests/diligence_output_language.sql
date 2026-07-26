\set ON_ERROR_STOP on

begin;

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

insert into auth.users (id, email)
values ('71000000-0000-4000-8000-000000000001', 'diligence-language@example.test');

insert into public.funds (id, name, created_by)
values (
  '72000000-0000-4000-8000-000000000001',
  'Diligence language test fund',
  '71000000-0000-4000-8000-000000000001'
);

insert into public.diligence_deals (id, fund_id, name)
values (
  '73000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  'Diligence language test deal'
);

select pg_temp.assert_true(
  (public.change_diligence_output_language(
    '73000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    'zh-CN',
    '71000000-0000-4000-8000-000000000001',
    false,
    null
  )->>'status') = 'updated',
  'a deal without a draft must update in place'
);

insert into public.diligence_memo_drafts (
  id, deal_id, fund_id, draft_version, agent_version, output_language, created_by
) values (
  '74000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  'test-v1',
  'test-agent',
  'zh-CN',
  '71000000-0000-4000-8000-000000000001'
);

select pg_temp.assert_true(
  (public.change_diligence_output_language(
    '73000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    'en',
    '71000000-0000-4000-8000-000000000001',
    false,
    null
  )->>'status') = 'updated',
  'an empty draft must update in place'
);

update public.diligence_memo_drafts
set memo_draft_output = '{"paragraphs":[{"section_id":"summary","content":"preserve me"}]}'::jsonb
where id = '74000000-0000-4000-8000-000000000001';

select pg_temp.expect_error(
  $sql$
    select public.change_diligence_output_language(
      '73000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000001',
      'zh-CN',
      '71000000-0000-4000-8000-000000000001',
      false,
      null
    )
  $sql$,
  'DILIGENCE_LANGUAGE_CONFIRMATION_REQUIRED'
);

select pg_temp.expect_error(
  $sql$
    select public.change_diligence_output_language(
      '73000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000001',
      'zh-CN',
      '71000000-0000-4000-8000-000000000001',
      true,
      '74000000-0000-4000-8000-000000000099'
    )
  $sql$,
  'DILIGENCE_LANGUAGE_VERSION_STALE'
);

select pg_temp.assert_true(
  (public.change_diligence_output_language(
    '73000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    'zh-CN',
    '71000000-0000-4000-8000-000000000001',
    true,
    '74000000-0000-4000-8000-000000000001'
  )->>'status') = 'version_created',
  'a confirmed generated draft must create a version'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.diligence_memo_drafts
    where deal_id = '73000000-0000-4000-8000-000000000001'
      and output_language = 'zh-CN'
      and source_draft_id = '74000000-0000-4000-8000-000000000001'
      and memo_draft_output is null
  ),
  'the new language version must link to an untouched source draft'
);

select pg_temp.assert_true(
  (select memo_draft_output->'paragraphs'->0->>'content'
   from public.diligence_memo_drafts
   where id = '74000000-0000-4000-8000-000000000001') = 'preserve me',
  'the source artifact must remain unchanged'
);

select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.change_diligence_output_language(uuid,uuid,text,uuid,boolean,uuid)',
    'execute'
  ),
  'authenticated clients must not invoke the atomic switch directly'
);

select pg_temp.assert_true(
  exists (
    select 1
    from pg_trigger
    where tgname = 'memo_agent_jobs_diligence_language_lock'
      and tgenabled <> 'D'
  ),
  'memo-agent enqueues must share the language-switch lock'
);

select 'diligence output language database assertions passed' as result;

rollback;
