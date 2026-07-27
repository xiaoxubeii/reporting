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

insert into auth.users (id, email, email_confirmed_at)
values
  ('91000000-0000-4000-8000-000000000001', 'founder@example.test', now()),
  ('91000000-0000-4000-8000-000000000002', 'member@example.test', now()),
  ('91000000-0000-4000-8000-000000000004', 'unverified@example.test', null),
  ('91000000-0000-4000-8000-000000000005', 'expired@example.test', now()),
  ('91000000-0000-4000-8000-000000000006', 'revoked@example.test', now()),
  ('91000000-0000-4000-8000-000000000007', 'rotated@example.test', now()),
  ('91000000-0000-4000-8000-000000000008', 'delegated-admin@example.test', now()),
  ('91000000-0000-4000-8000-000000000009', 'second-founder@example.test', now()),
  ('91000000-0000-4000-8000-000000000010', 'cross-fund@example.test', now()),
  ('91000000-0000-4000-8000-000000000011', 'rollback-founder@example.test', now());

select pg_temp.expect_error(
  $sql$select * from public.bootstrap_fund_identity(
    '91000000-0000-4000-8000-000000000003',
    'Internal Identity Fund',
    'internal-identity',
    'encrypted-test-key'
  )$sql$,
  'Verified external account required'
);

select *
from public.bootstrap_fund_identity(
  '91000000-0000-4000-8000-000000000001',
  'Identity Test Fund',
  'identity-test',
  'encrypted-test-key'
);

select pg_temp.expect_error(
  $sql$select * from public.bootstrap_fund_identity(
    '91000000-0000-4000-8000-000000000009',
    'Duplicate Identity Fund',
    'identity-test',
    'encrypted-test-key'
  )$sql$,
  'duplicate key'
);

select pg_temp.assert_true(
  not exists (
    select 1 from public.funds
    where created_by = '91000000-0000-4000-8000-000000000009'
  ) and not exists (
    select 1 from public.fund_members
    where user_id = '91000000-0000-4000-8000-000000000009'
  ),
  'a failed duplicate bootstrap must leave no partial Fund or membership'
);

select pg_temp.assert_true(
  (select count(*) from public.funds where slug = 'identity-test') = 1
    and (select count(*)
         from public.fund_members
         where user_id = '91000000-0000-4000-8000-000000000001'
           and role = 'admin') = 1
    and (select count(*)
         from public.fund_email_mailboxes
         where fund_id = (select id from public.funds where slug = 'identity-test')
           and local_part in ('pitch', 'expert')) = 2,
  'bootstrap must atomically create the Fund, founder membership, and reserved mailboxes'
);

-- Retrying the exact identity is idempotent and cannot use changed inputs to
-- mutate the established Fund, founder authority, or encrypted settings.
select *
from public.bootstrap_fund_identity(
  '91000000-0000-4000-8000-000000000001',
  'Attempted Renamed Fund',
  'identity-test',
  'replacement-encryption-key',
  'replacement-claude-key',
  'replacement-postmark-token'
);

select pg_temp.assert_true(
  (select name from public.funds where slug = 'identity-test') = 'Identity Test Fund'
    and (select role
         from public.fund_members
         where user_id = '91000000-0000-4000-8000-000000000001') = 'admin'
    and (select encryption_key_encrypted
         from public.fund_settings
         where fund_id = (select id from public.funds where slug = 'identity-test'))
      = 'encrypted-test-key'
    and (select claude_api_key_encrypted
         from public.fund_settings
         where fund_id = (select id from public.funds where slug = 'identity-test')) is null
    and (select postmark_webhook_token_encrypted
         from public.fund_settings
         where fund_id = (select id from public.funds where slug = 'identity-test')) is null,
  'same-actor same-slug bootstrap retry must return the original identity without mutation'
);

-- Force a failure after funds and fund_members have been inserted. Catching
-- the statement error proves that the bootstrap's entire statement rolls back,
-- rather than only covering a conflict at the first INSERT.
create or replace function pg_temp.reject_rollback_founder_settings()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.funds
    where id = new.fund_id
      and created_by = '91000000-0000-4000-8000-000000000011'
  ) then
    raise exception 'forced post-Fund bootstrap failure';
  end if;
  return new;
end;
$$;

create trigger identity_test_reject_rollback_founder_settings
  before insert on public.fund_settings
  for each row execute function pg_temp.reject_rollback_founder_settings();

select pg_temp.expect_error(
  $sql$select * from public.bootstrap_fund_identity(
    '91000000-0000-4000-8000-000000000011',
    'Rollback Fund',
    'rollback-fund',
    'encrypted-rollback-key'
  )$sql$,
  'forced post-Fund bootstrap failure'
);

drop trigger identity_test_reject_rollback_founder_settings on public.fund_settings;

select pg_temp.assert_true(
  not exists (
    select 1 from public.funds
    where created_by = '91000000-0000-4000-8000-000000000011'
  ) and not exists (
    select 1 from public.fund_members
    where user_id = '91000000-0000-4000-8000-000000000011'
  ) and not exists (
    select 1
    from public.fund_settings as settings
    join public.funds as funds on funds.id = settings.fund_id
    where funds.created_by = '91000000-0000-4000-8000-000000000011'
  ) and not exists (
    select 1
    from public.fund_email_mailboxes as mailboxes
    join public.funds as funds on funds.id = mailboxes.fund_id
    where funds.created_by = '91000000-0000-4000-8000-000000000011'
  ),
  'post-Fund bootstrap failure must roll back Fund, membership, settings, and mailboxes'
);

select pg_temp.expect_error(
  $sql$update public.funds
    set created_by = '91000000-0000-4000-8000-000000000002'
    where slug = 'identity-test'$sql$,
  'Fund founder is immutable'
);

select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.funds', 'insert')
    and not has_table_privilege('authenticated', 'public.fund_members', 'insert')
    and not has_table_privilege('authenticated', 'public.fund_member_invitations', 'select'),
  'browser roles must not bypass service-owned onboarding and invitation APIs'
);

select pg_temp.expect_error(
  $sql$select * from public.bootstrap_fund_identity(
    '91000000-0000-4000-8000-000000000001',
    'Renamed Fund',
    'renamed-fund',
    'encrypted-test-key'
  )$sql$,
  'Account already owns a Fund'
);

create temporary table invitation_context (id uuid primary key);

create or replace function pg_temp.confirm_invitation(p_token_hash text)
returns void
language sql
as $$
  select null::void
  from public.confirm_fund_member_invitation_delivery(
    (select id from public.fund_member_invitations where token_hash = p_token_hash),
    (select id from public.funds where slug = 'identity-test'),
    '91000000-0000-4000-8000-000000000001'
  );
$$;

insert into invitation_context (id)
select (public.create_fund_member_invitation(
  (select id from public.funds where slug = 'identity-test'),
  'member@example.test',
  'member',
  repeat('a', 64),
  now() + interval '1 day',
  '91000000-0000-4000-8000-000000000001'
)).id;

select pg_temp.assert_true(
  (select count(*) from public.resolve_fund_member_invitation(repeat('a', 64))) = 0,
  'an invitation must remain inert until delivery is confirmed'
);
select pg_temp.confirm_invitation(repeat('a', 64));

select pg_temp.assert_true(
  (select count(*) from public.resolve_fund_member_invitation(repeat('a', 64))) = 1
    and (select email_masked
         from public.resolve_fund_member_invitation(repeat('a', 64))) = 'm***@example.test',
  'a live hashed invitation must resolve only a masked invitee identity'
);

select pg_temp.expect_error(
  $sql$select * from public.accept_fund_member_invitation(
    repeat('a', 64),
    '91000000-0000-4000-8000-000000000003'
  )$sql$,
  'Verified invitation email required'
);

select * from public.accept_fund_member_invitation(
  repeat('a', 64),
  '91000000-0000-4000-8000-000000000002'
);

select pg_temp.assert_true(
  (select count(*)
   from public.fund_members
   where user_id = '91000000-0000-4000-8000-000000000002'
     and role = 'member') = 1
    and (select accepted_by
         from public.fund_member_invitations
         where id = (select id from invitation_context))
      = '91000000-0000-4000-8000-000000000002',
  'acceptance must bind the verified exact-email user and consume the invitation'
);

-- Unverified, expired, revoked, and replaced invitation authorities all fail
-- without creating membership.
select public.create_fund_member_invitation(
  (select id from public.funds where slug = 'identity-test'),
  'unverified@example.test', 'member', repeat('b', 64),
  now() + interval '1 day', '91000000-0000-4000-8000-000000000001'
);
select pg_temp.confirm_invitation(repeat('b', 64));
select pg_temp.expect_error(
  $sql$select * from public.accept_fund_member_invitation(
    repeat('b', 64), '91000000-0000-4000-8000-000000000004'
  )$sql$,
  'Verified invitation email required'
);

select public.create_fund_member_invitation(
  (select id from public.funds where slug = 'identity-test'),
  'expired@example.test', 'member', repeat('c', 64),
  now() + interval '1 day', '91000000-0000-4000-8000-000000000001'
);
select pg_temp.confirm_invitation(repeat('c', 64));
update public.fund_member_invitations set expires_at = now() - interval '1 second'
where token_hash = repeat('c', 64);
select pg_temp.expect_error(
  $sql$select * from public.accept_fund_member_invitation(
    repeat('c', 64), '91000000-0000-4000-8000-000000000005'
  )$sql$,
  'Fund invitation is unavailable'
);

select public.create_fund_member_invitation(
  (select id from public.funds where slug = 'identity-test'),
  'revoked@example.test', 'member', repeat('d', 64),
  now() + interval '1 day', '91000000-0000-4000-8000-000000000001'
);
select pg_temp.confirm_invitation(repeat('d', 64));
select pg_temp.assert_true(
  public.revoke_fund_member_invitation(
    (select id from public.fund_member_invitations where token_hash = repeat('d', 64)),
    (select id from public.funds where slug = 'identity-test'),
    '91000000-0000-4000-8000-000000000001'
  ),
  'the founder must be able to revoke a live invitation'
);
select pg_temp.expect_error(
  $sql$select * from public.accept_fund_member_invitation(
    repeat('d', 64), '91000000-0000-4000-8000-000000000006'
  )$sql$,
  'Fund invitation is unavailable'
);

select public.create_fund_member_invitation(
  (select id from public.funds where slug = 'identity-test'),
  'rotated@example.test', 'member', repeat('e', 64),
  now() + interval '1 day', '91000000-0000-4000-8000-000000000001'
);
select pg_temp.confirm_invitation(repeat('e', 64));
select public.rotate_fund_member_invitation(
  (select id from public.fund_member_invitations where token_hash = repeat('e', 64)),
  (select id from public.funds where slug = 'identity-test'),
  repeat('f', 64), now() + interval '2 days',
  '91000000-0000-4000-8000-000000000001'
);
select pg_temp.confirm_invitation(repeat('f', 64));
select pg_temp.assert_true(
  (select count(*) from public.resolve_fund_member_invitation(repeat('e', 64))) = 0
    and (select count(*) from public.resolve_fund_member_invitation(repeat('f', 64))) = 1,
  'rotation must retire the old hash and expose only the replacement'
);

-- A delegated admin may invite members, but only funds.created_by may grant
-- the admin role.
insert into public.fund_members (fund_id, user_id, invited_by, role)
values (
  (select id from public.funds where slug = 'identity-test'),
  '91000000-0000-4000-8000-000000000008',
  '91000000-0000-4000-8000-000000000001',
  'admin'
);
select pg_temp.expect_error(
  $sql$select public.create_fund_member_invitation(
    (select id from public.funds where slug = 'identity-test'),
    'future-admin@example.test', 'admin', repeat('1', 64),
    now() + interval '1 day', '91000000-0000-4000-8000-000000000008'
  )$sql$,
  'Only the Fund founder can invite administrators'
);

-- An auth identity already attached to another Fund cannot consume an invite.
select * from public.bootstrap_fund_identity(
  '91000000-0000-4000-8000-000000000009',
  'Cross Fund', 'cross-fund', 'encrypted-test-key'
);
insert into public.fund_members (fund_id, user_id, invited_by, role)
values (
  (select id from public.funds where slug = 'cross-fund'),
  '91000000-0000-4000-8000-000000000010',
  '91000000-0000-4000-8000-000000000009',
  'member'
);
select public.create_fund_member_invitation(
  (select id from public.funds where slug = 'identity-test'),
  'cross-fund@example.test', 'member', repeat('2', 64),
  now() + interval '1 day', '91000000-0000-4000-8000-000000000001'
);
select pg_temp.confirm_invitation(repeat('2', 64));
select pg_temp.expect_error(
  $sql$select * from public.accept_fund_member_invitation(
    repeat('2', 64), '91000000-0000-4000-8000-000000000010'
  )$sql$,
  'Auth user cannot access more than one Fund'
);

select pg_temp.assert_true(
  (select count(*)
   from public.accept_fund_member_invitation(
     repeat('a', 64),
     '91000000-0000-4000-8000-000000000002'
   )) = 1
    and (select count(*)
         from public.fund_members
         where user_id = '91000000-0000-4000-8000-000000000002') = 1,
  'a completed retry by the same accepted user must be idempotent'
);

select pg_temp.expect_error(
  $sql$select public.fund_email_set_user_mailbox(
    (select id from public.funds where slug = 'identity-test'),
    '91000000-0000-4000-8000-000000000008',
    'bad._name',
    'Delegated Admin'
  )$sql$,
  'Invalid Fund mailbox'
);

select public.fund_email_set_user_mailbox(
  (select id from public.funds where slug = 'identity-test'),
  '91000000-0000-4000-8000-000000000002',
  'alice',
  'Alice Member'
);

select public.update_user_profile(
  '91000000-0000-4000-8000-000000000002',
  'Alice Updated'
);

select pg_temp.assert_true(
  (select full_name from public.user_profiles
   where user_id = '91000000-0000-4000-8000-000000000002') = 'Alice Updated'
    and (select display_name from public.fund_email_mailboxes
         where claimed_by_user_id = '91000000-0000-4000-8000-000000000002') = 'Alice Updated',
  'profile updates must atomically propagate safe display names without changing mailbox identity'
);

select pg_temp.expect_error(
  $sql$update public.fund_email_mailboxes
    set local_part = 'address-takeover'
    where local_part = 'alice'$sql$,
  'Fund mailbox identity is immutable'
);

select pg_temp.assert_true(
  not has_table_privilege('service_role', 'public.fund_email_mailboxes', 'delete'),
  'service workflows must not delete claimed mailbox identities'
);

select pg_temp.expect_error(
  $sql$select public.fund_email_set_user_mailbox(
    (select id from public.funds where slug = 'identity-test'),
    '91000000-0000-4000-8000-000000000002',
    'alice-renamed',
    'Alice Member'
  )$sql$,
  'Fund mailbox local part is immutable'
);

delete from public.fund_members
where user_id = '91000000-0000-4000-8000-000000000002';

select pg_temp.assert_true(
  (select claimed_by_user_id = '91000000-0000-4000-8000-000000000002'
            and user_id is null
            and active is false
   from public.fund_email_mailboxes
   where local_part = 'alice'),
  'deleted members must leave an inactive historical mailbox claim'
);

insert into public.fund_members (fund_id, user_id, invited_by, role)
values (
  (select id from public.funds where slug = 'identity-test'),
  '91000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000001',
  'member'
);
select public.fund_email_set_user_mailbox(
  (select id from public.funds where slug = 'identity-test'),
  '91000000-0000-4000-8000-000000000002',
  'alice',
  'Alice Restored'
);
select pg_temp.assert_true(
  (select count(*) from public.fund_email_mailboxes where local_part = 'alice') = 1
    and (select user_id = '91000000-0000-4000-8000-000000000002'
                and claimed_by_user_id = '91000000-0000-4000-8000-000000000002'
                and active is true
         from public.fund_email_mailboxes where local_part = 'alice'),
  'restoring the same member must reactivate only the same historical mailbox'
);

select pg_temp.assert_true(
  public.hook_before_user_created(
    '{"user":{"email":"alice@identity-test.fundworkspace.com"}}'::jsonb
  ) #>> '{error,message}' = 'Internal Fund email cannot authenticate.',
  'internal Fund mailboxes must be rejected by the Auth signup hook'
);

select pg_temp.expect_error(
  $sql$update auth.users
    set email_change = 'alice@identity-test.fundworkspace.com'
    where id = '91000000-0000-4000-8000-000000000002'$sql$,
  'Internal Fund email cannot authenticate'
);

select pg_temp.expect_error(
  $sql$delete from public.funds where slug = 'identity-test'$sql$,
  'Fund identity cannot be deleted'
);

select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.user_profiles', 'insert')
    and not has_table_privilege('authenticated', 'public.user_profiles', 'update')
    and not has_table_privilege('authenticated', 'public.funds', 'delete'),
  'authenticated users must not bypass profile RPCs or delete Fund identities'
);

select 'fund identity onboarding database assertions passed' as result;

rollback;
