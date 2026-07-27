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
values
  ('81000000-0000-4000-8000-000000000001', 'fund-host-one@example.test'),
  ('81000000-0000-4000-8000-000000000002', 'fund-host-two@example.test'),
  ('81000000-0000-4000-8000-000000000003', 'fund-host-alpha-creator@example.test'),
  ('81000000-0000-4000-8000-000000000004', 'fund-host-beta-creator@example.test'),
  ('81000000-0000-4000-8000-000000000005', 'fund-host-generated-creator@example.test'),
  ('81000000-0000-4000-8000-000000000006', 'fund-host-invalid-creator@example.test');

insert into public.funds (id, name, slug, created_by)
values
  ('82000000-0000-4000-8000-000000000001', 'Alpha Fund', 'alpha-fund', '81000000-0000-4000-8000-000000000003'),
  ('82000000-0000-4000-8000-000000000002', 'Beta Fund', 'beta-fund', '81000000-0000-4000-8000-000000000004');

insert into public.funds (id, name, created_by)
values ('82000000-0000-4000-8000-000000000003', 'Generated Fund', '81000000-0000-4000-8000-000000000005');

select pg_temp.assert_true(
  (select slug from public.funds where id = '82000000-0000-4000-8000-000000000003')
    ~ '^generated-fund-[0-9a-f]{32}$',
  'new Funds must receive a collision-safe DNS slug'
);

select pg_temp.expect_error(
  $sql$insert into public.funds (id, name, slug, created_by) values
    ('82000000-0000-4000-8000-000000000004', 'Reserved', 'admin', '81000000-0000-4000-8000-000000000006')$sql$,
  'funds_slug_not_reserved'
);

select pg_temp.expect_error(
  $sql$insert into public.funds (id, name, slug, created_by) values
    ('82000000-0000-4000-8000-000000000005', 'Invalid', 'bad.slug', '81000000-0000-4000-8000-000000000006')$sql$,
  'funds_slug_dns_safe'
);

select pg_temp.expect_error(
  $sql$update public.funds set slug = 'renamed-fund' where id = '82000000-0000-4000-8000-000000000001'$sql$,
  'Fund slug is immutable'
);

select pg_temp.assert_true(
  (select count(*) from public.resolve_public_fund_host('alpha-fund')) = 1,
  'the exact public host resolver must find one Fund'
);

insert into public.fund_settings (fund_id, theme)
values (
  '82000000-0000-4000-8000-000000000001',
  '{"accent":"217 91% 60%","font":"hanken","radius":0.75,"provider_secret":"must-not-leak"}'::jsonb
)
on conflict (fund_id) do update set theme = excluded.theme;

select pg_temp.assert_true(
  (select theme ? 'accent' and theme ? 'font' and theme ? 'radius'
     and not theme ? 'provider_secret'
   from public.resolve_public_fund_host('alpha-fund')),
  'the anonymous descriptor must expose only allowlisted theme keys'
);

select pg_temp.assert_true(
  (select count(*) from public.resolve_public_fund_host('missing-fund')) = 0,
  'the public host resolver must fail closed for unknown slugs'
);

select pg_temp.assert_true(
  has_function_privilege('anon', 'public.resolve_public_fund_host(text)', 'execute')
    and has_function_privilege('authenticated', 'public.resolve_public_fund_host(text)', 'execute'),
  'public descriptor resolution must be executable by browser roles'
);

select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.assert_user_fund_compatible(uuid,uuid)',
    'execute'
  ),
  'internal invariant helpers must not be client-callable'
);

insert into public.lp_investors (id, fund_id, name)
values
  ('83000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'Alpha LP One'),
  ('83000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', 'Alpha LP Two'),
  ('83000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000002', 'Beta LP');

insert into public.lp_accounts (id, auth_user_id, kind, email, status)
values
  ('84000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'lp', 'lp-one@example.test', 'active'),
  ('84000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', 'authorized_user', 'lp-two@example.test', 'active'),
  ('84000000-0000-4000-8000-000000000003', null, 'lp', 'principal-alpha@example.test', 'active'),
  ('84000000-0000-4000-8000-000000000004', null, 'authorized_user', 'authorized-beta@example.test', 'active'),
  ('84000000-0000-4000-8000-000000000005', null, 'lp', 'principal-beta@example.test', 'active');

insert into public.lp_account_links (id, lp_account_id, fund_id, lp_investor_id)
values
  ('85000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001'),
  ('85000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000002'),
  ('85000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001'),
  ('85000000-0000-4000-8000-000000000004', '84000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000003');

insert into public.lp_authorized_users (
  id, authorized_user_account_id, principal_lp_account_id, lp_investor_id
) values (
  '86000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000002',
  '84000000-0000-4000-8000-000000000003',
  '83000000-0000-4000-8000-000000000001'
);

select pg_temp.expect_error(
  $sql$update public.lp_authorized_users
    set principal_lp_account_id = '84000000-0000-4000-8000-000000000005'
    where id = '86000000-0000-4000-8000-000000000001'$sql$,
  'Delegation principal must own the LP investor'
);

insert into public.fund_members (id, fund_id, user_id)
values (
  '87000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001'
);

select pg_temp.expect_error(
  $sql$update public.lp_investors
    set fund_id = '82000000-0000-4000-8000-000000000002'
    where id = '83000000-0000-4000-8000-000000000001'$sql$,
  'LP investor Fund cannot change while linked accounts or delegated users exist'
);

select pg_temp.expect_error(
  $sql$insert into public.lp_account_links (lp_account_id, fund_id, lp_investor_id) values
    ('84000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000003')$sql$,
  'LP account cannot access more than one Fund'
);

select pg_temp.expect_error(
  $sql$insert into public.lp_account_links (lp_account_id, fund_id, lp_investor_id) values
    ('84000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000001')$sql$,
  'LP account link Fund must match investor Fund'
);

select pg_temp.expect_error(
  $sql$insert into public.fund_members (fund_id, user_id) values
    ('82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001')$sql$,
  'Auth user cannot access more than one Fund'
);

select pg_temp.expect_error(
  $sql$insert into public.lp_authorized_users
    (authorized_user_account_id, principal_lp_account_id, lp_investor_id) values
    ('84000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000005', '83000000-0000-4000-8000-000000000003')$sql$,
  'LP account cannot access more than one Fund'
);

select pg_temp.expect_error(
  $sql$insert into public.lp_authorized_users
    (authorized_user_account_id, principal_lp_account_id, lp_investor_id) values
    ('84000000-0000-4000-8000-000000000004', '84000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000003')$sql$,
  'Delegation principal must own the LP investor'
);

select pg_temp.expect_error(
  $sql$delete from public.lp_account_links
    where id = '85000000-0000-4000-8000-000000000003'$sql$,
  'LP investor link cannot change while delegations exist'
);

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select pg_temp.assert_true(
  public.resolve_my_lp_fund() = '82000000-0000-4000-8000-000000000001',
  'direct LP access must resolve its single Fund'
);

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true(
  public.resolve_my_lp_fund() = '82000000-0000-4000-8000-000000000001',
  'delegated LP access must resolve its single Fund'
);

select 'fund subdomain isolation database assertions passed' as result;

rollback;
