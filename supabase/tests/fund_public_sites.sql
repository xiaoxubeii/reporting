\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'public-site-admin@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'public-site-beta@example.test');
insert into public.funds (id, name, slug, created_by) values
  ('a2000000-0000-4000-8000-000000000001', 'Alpha Fund', 'alpha-public', 'a1000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000002', 'Beta Fund', 'beta-public', 'a1000000-0000-4000-8000-000000000002');
insert into public.fund_members (fund_id, user_id, role) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'admin'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'admin')
on conflict (fund_id, user_id) do update set role = excluded.role;

insert into public.fund_public_sites (fund_id, draft_template_key, draft_content, updated_by) values
  ('a2000000-0000-4000-8000-000000000001', 'focus', '{"schemaVersion":1,"marker":"ALPHA_DRAFT_SECRET"}', 'a1000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000002', 'institutional', '{"schemaVersion":1,"marker":"BETA_DRAFT_SECRET"}', 'a1000000-0000-4000-8000-000000000002');

select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.fund_public_sites', 'select')
    and not has_table_privilege('authenticated', 'public.fund_public_sites', 'select'),
  'browser roles must have no direct draft table access'
);
select pg_temp.assert_true(
  has_table_privilege('service_role', 'public.fund_public_sites', 'select')
    and has_column_privilege('service_role', 'public.fund_public_sites', 'draft_content', 'insert')
    and has_column_privilege('service_role', 'public.fund_public_sites', 'draft_content', 'update')
    and not has_column_privilege('service_role', 'public.fund_public_sites', 'published_content', 'insert')
    and not has_column_privilege('service_role', 'public.fund_public_sites', 'published_content', 'update')
    and not has_table_privilege('service_role', 'public.fund_public_sites', 'delete'),
  'service role receives only the table privileges used by the draft store'
);
select pg_temp.assert_true(
  has_function_privilege('anon', 'public.resolve_published_fund_site(text)', 'execute')
    and not has_function_privilege('anon', 'public.publish_fund_public_site(uuid,bigint,bigint,uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.publish_fund_public_site(uuid,bigint,bigint,uuid)', 'execute'),
  'anonymous may resolve but never mutate publication state'
);
select pg_temp.assert_true(
  (select count(*) from public.resolve_published_fund_site('alpha-public')) = 0,
  'an unpublished draft must not resolve'
);

select * from public.publish_fund_public_site(
  'a2000000-0000-4000-8000-000000000001', 1, 1, 'a1000000-0000-4000-8000-000000000001'
);
select pg_temp.assert_true(
  (select content ->> 'marker' = 'ALPHA_DRAFT_SECRET'
     and template_key = 'focus' and published_version = 1
   from public.resolve_published_fund_site('alpha-public')),
  'publish must expose one coherent Alpha snapshot'
);
select pg_temp.assert_true(
  (select count(*) from public.resolve_published_fund_site('beta-public')) = 0,
  'publishing Alpha must not expose Beta'
);

update public.fund_public_sites
set draft_content = '{"schemaVersion":1,"marker":"ALPHA_DRAFT_V2_SECRET"}',
    draft_template_key = 'minimal',
    draft_revision = 2
where fund_id = 'a2000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  (select content ->> 'marker' = 'ALPHA_DRAFT_SECRET' and template_key = 'focus'
   from public.resolve_published_fund_site('alpha-public')),
  'editing a draft must not change the published snapshot'
);

select * from public.unpublish_fund_public_site(
  'a2000000-0000-4000-8000-000000000001', 2, 'a1000000-0000-4000-8000-000000000001'
);
select pg_temp.assert_true(
  (select count(*) from public.resolve_published_fund_site('alpha-public')) = 0
    and (select draft_content ->> 'marker' from public.fund_public_sites where fund_id = 'a2000000-0000-4000-8000-000000000001') = 'ALPHA_DRAFT_V2_SECRET',
  'unpublish must hide the site while preserving its draft'
);

do $$
begin
  perform public.publish_fund_public_site(
    'a2000000-0000-4000-8000-000000000001', 2, 2, 'a1000000-0000-4000-8000-000000000001'
  );
  raise exception 'stale lifecycle request unexpectedly succeeded';
exception
  when serialization_failure then null;
end;
$$;

select * from public.publish_fund_public_site(
  'a2000000-0000-4000-8000-000000000001', 2, 3, 'a1000000-0000-4000-8000-000000000001'
);
do $$
begin
  perform public.unpublish_fund_public_site(
    'a2000000-0000-4000-8000-000000000001', 3, 'a1000000-0000-4000-8000-000000000001'
  );
  raise exception 'stale unpublish unexpectedly succeeded';
exception
  when serialization_failure then null;
end;
$$;

select 'Fund public site database assertions passed' as result;
rollback;
