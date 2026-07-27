-- External-login identity, immutable Fund onboarding, exact invitations, and
-- claim-once Fund business mailboxes.

-- ---------------------------------------------------------------------------
-- Global personal profile (never an authorization or tenant selector).
-- ---------------------------------------------------------------------------

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (full_name is null or (char_length(full_name) between 1 and 120 and full_name !~ E'[\r\n]')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy user_profiles_owner_select
  on public.user_profiles for select to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on table public.user_profiles from authenticated;
grant select on table public.user_profiles to authenticated, service_role;

create trigger set_updated_at_user_profiles
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- One auth identity is already constrained to one Fund. Preserve the first
-- useful legacy display name, and never overwrite a previously saved profile.
insert into public.user_profiles (user_id, full_name)
select distinct on (members.user_id)
  members.user_id,
  left(btrim(members.display_name), 120)
from public.fund_members as members
where members.display_name is not null
  and btrim(members.display_name) <> ''
  and members.display_name !~ E'[\r\n]'
order by members.user_id, members.created_at nulls last
on conflict (user_id) do update
set full_name = coalesce(public.user_profiles.full_name, excluded.full_name);

-- ---------------------------------------------------------------------------
-- Service-owned exact-email invitation capabilities.
-- ---------------------------------------------------------------------------

create table public.fund_member_invitations (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id) on delete cascade,
  email_normalized text not null check (
    email_normalized = lower(btrim(email_normalized))
    and char_length(email_normalized) between 3 and 320
    and email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+$'
    and email_normalized !~ E'[\r\n]'
  ),
  role text not null check (role in ('admin', 'member')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  delivery_confirmed_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  replaced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (accepted_at is not null and revoked_at is not null)),
  check (accepted_at is null or accepted_by is not null)
);

create unique index fund_member_invitations_one_live_email
  on public.fund_member_invitations (fund_id, email_normalized)
  where accepted_at is null and revoked_at is null and replaced_at is null;

create index fund_member_invitations_live_lookup
  on public.fund_member_invitations (token_hash, expires_at)
  where delivery_confirmed_at is not null
    and accepted_at is null and revoked_at is null and replaced_at is null;

alter table public.fund_member_invitations enable row level security;
revoke all on table public.fund_member_invitations from public, anon, authenticated;
grant select, insert, update, delete on table public.fund_member_invitations to service_role;

create trigger set_updated_at_fund_member_invitations
  before update on public.fund_member_invitations
  for each row execute function public.set_updated_at();

create or replace function public.create_fund_member_invitation(
  p_fund_id uuid,
  p_email_normalized text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_invited_by uuid
)
returns public.fund_member_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.fund_member_invitations;
  v_email text := lower(btrim(coalesce(p_email_normalized, '')));
  v_domain text := split_part(lower(btrim(coalesce(p_email_normalized, ''))), '@', 2);
begin
  if p_role not in ('admin', 'member')
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_expires_at <= now()
    or char_length(v_email) not between 3 and 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+$'
    or v_domain = 'fundworkspace.com'
    or v_domain like '%.fundworkspace.com'
  then
    raise exception using errcode = '22023', message = 'Invalid Fund invitation';
  end if;

  perform 1
  from public.fund_members as members
  where members.fund_id = p_fund_id
    and members.user_id = p_invited_by
    and members.role = 'admin'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Fund administrator access required';
  end if;

  if p_role = 'admin' and not exists (
    select 1 from public.funds as funds
    where funds.id = p_fund_id and funds.created_by = p_invited_by
  ) then
    raise exception using errcode = '42501', message = 'Only the Fund founder can invite administrators';
  end if;

  if exists (
    select 1
    from public.fund_members as members
    join auth.users as users on users.id = members.user_id
    where members.fund_id = p_fund_id
      and lower(btrim(users.email)) = v_email
  ) then
    raise exception using errcode = '23505', message = 'Fund member already exists';
  end if;

  insert into public.fund_member_invitations (
    fund_id, email_normalized, role, token_hash, expires_at, invited_by
  ) values (
    p_fund_id, v_email, p_role, p_token_hash, p_expires_at, p_invited_by
  ) returning * into v_invitation;

  return v_invitation;
end;
$$;

create or replace function public.rotate_fund_member_invitation(
  p_invitation_id uuid,
  p_fund_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_actor_user_id uuid
)
returns public.fund_member_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.fund_member_invitations;
  v_replacement public.fund_member_invitations;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_expires_at <= now() then
    raise exception using errcode = '22023', message = 'Invalid Fund invitation rotation';
  end if;

  select * into v_current
  from public.fund_member_invitations
  where id = p_invitation_id and fund_id = p_fund_id
  for update;

  if v_current.id is null
    or v_current.accepted_at is not null
    or v_current.revoked_at is not null
    or v_current.replaced_at is not null
  then
    raise exception using errcode = 'P0002', message = 'Fund invitation is unavailable';
  end if;

  perform 1
  from public.fund_members as members
  where members.fund_id = p_fund_id
    and members.user_id = p_actor_user_id
    and members.role = 'admin'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Fund administrator access required';
  end if;

  if v_current.role = 'admin' and not exists (
    select 1 from public.funds as funds
    where funds.id = p_fund_id and funds.created_by = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'Only the Fund founder can invite administrators';
  end if;

  update public.fund_member_invitations
  set replaced_at = now(), updated_at = now()
  where id = v_current.id;

  insert into public.fund_member_invitations (
    fund_id, email_normalized, role, token_hash, expires_at, invited_by
  ) values (
    v_current.fund_id,
    v_current.email_normalized,
    v_current.role,
    p_token_hash,
    p_expires_at,
    p_actor_user_id
  ) returning * into v_replacement;

  return v_replacement;
end;
$$;

create or replace function public.revoke_fund_member_invitation(
  p_invitation_id uuid,
  p_fund_id uuid,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.fund_member_invitations;
begin
  select * into v_current
  from public.fund_member_invitations as invitations
  where invitations.id = p_invitation_id
    and invitations.fund_id = p_fund_id
  for update;

  if v_current.id is null
    or v_current.accepted_at is not null
    or v_current.revoked_at is not null
    or v_current.replaced_at is not null
  then
    return false;
  end if;

  perform 1
  from public.fund_members as members
  where members.fund_id = p_fund_id
    and members.user_id = p_actor_user_id
    and members.role = 'admin'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Fund administrator access required';
  end if;

  if v_current.role = 'admin' and not exists (
    select 1 from public.funds as funds
    where funds.id = p_fund_id and funds.created_by = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'Only the Fund founder can revoke administrator invitations';
  end if;

  update public.fund_member_invitations
  set revoked_at = now(), updated_at = now()
  where id = p_invitation_id
    and fund_id = p_fund_id
    and accepted_at is null
    and revoked_at is null
    and replaced_at is null;

  return found;
end;
$$;

create or replace function public.confirm_fund_member_invitation_delivery(
  p_invitation_id uuid,
  p_fund_id uuid,
  p_actor_user_id uuid
)
returns public.fund_member_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.fund_member_invitations;
begin
  select * into v_invitation
  from public.fund_member_invitations as invitations
  where invitations.id = p_invitation_id
    and invitations.fund_id = p_fund_id
  for update;

  if v_invitation.id is null
    or v_invitation.invited_by <> p_actor_user_id
    or v_invitation.accepted_at is not null
    or v_invitation.revoked_at is not null
    or v_invitation.replaced_at is not null
  then
    raise exception using errcode = 'P0002', message = 'Fund invitation is unavailable';
  end if;

  perform 1
  from public.fund_members as members
  where members.fund_id = p_fund_id
    and members.user_id = p_actor_user_id
    and members.role = 'admin'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Fund administrator access required';
  end if;

  update public.fund_member_invitations
  set delivery_confirmed_at = coalesce(delivery_confirmed_at, now()),
      updated_at = now()
  where id = v_invitation.id
  returning * into v_invitation;

  return v_invitation;
end;
$$;

create or replace function public.resolve_fund_member_invitation(p_token_hash text)
returns table (
  invitation_id uuid,
  fund_id uuid,
  email_masked text,
  role text,
  expires_at timestamptz,
  fund_name text,
  fund_slug text
)
language sql
security definer
stable
set search_path = public
as $$
  select invitations.id,
         invitations.fund_id,
         left(split_part(invitations.email_normalized, '@', 1), 1)
           || '***@'
           || split_part(invitations.email_normalized, '@', 2),
         invitations.role,
         invitations.expires_at,
         funds.name,
         funds.slug
  from public.fund_member_invitations as invitations
  join public.funds as funds on funds.id = invitations.fund_id
  where invitations.token_hash = p_token_hash
    and invitations.delivery_confirmed_at is not null
    and invitations.accepted_at is null
    and invitations.revoked_at is null
    and invitations.replaced_at is null
    and invitations.expires_at > now()
    and p_token_hash ~ '^[a-f0-9]{64}$';
$$;

create or replace function public.accept_fund_member_invitation(
  p_token_hash text,
  p_user_id uuid
)
returns table (invitation_id uuid, fund_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.fund_member_invitations;
  v_user auth.users%rowtype;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'Fund invitation is unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('auth-user:' || p_user_id::text, 0));

  select * into v_invitation
  from public.fund_member_invitations as invitations
  where invitations.token_hash = p_token_hash
  for update;

  if v_invitation.accepted_at is not null
    and v_invitation.accepted_by = p_user_id
  then
    return query select v_invitation.id, v_invitation.fund_id, v_invitation.role;
    return;
  end if;

  if v_invitation.id is null
    or v_invitation.delivery_confirmed_at is null
    or v_invitation.accepted_at is not null
    or v_invitation.revoked_at is not null
    or v_invitation.replaced_at is not null
    or v_invitation.expires_at <= now()
  then
    raise exception using errcode = 'P0002', message = 'Fund invitation is unavailable';
  end if;

  select * into v_user
  from auth.users
  where id = p_user_id
    and email_confirmed_at is not null
  for update;
  if v_user.id is null
    or lower(btrim(v_user.email)) <> v_invitation.email_normalized
  then
    raise exception using errcode = '42501', message = 'Verified invitation email required';
  end if;

  perform public.assert_user_fund_compatible(p_user_id, v_invitation.fund_id);

  insert into public.fund_members (fund_id, user_id, invited_by, role)
  values (v_invitation.fund_id, p_user_id, v_invitation.invited_by, v_invitation.role);

  update public.fund_member_invitations
  set accepted_at = now(), accepted_by = p_user_id, updated_at = now()
  where id = v_invitation.id;

  return query select v_invitation.id, v_invitation.fund_id, v_invitation.role;
end;
$$;

-- ---------------------------------------------------------------------------
-- Claim-once mailbox identity. Historical local parts are never released.
-- ---------------------------------------------------------------------------

alter table public.fund_email_mailboxes
  add column claimed_by_user_id uuid,
  add column claimed_at timestamptz;

-- The base mailbox migration already created this invariant. Reassert it here
-- so restored or partially upgraded installations cannot silently release a
-- historical address for reuse.
alter table public.fund_email_mailboxes
  drop constraint if exists fund_email_mailboxes_fund_id_local_part_key,
  add constraint fund_email_mailboxes_fund_id_local_part_key unique (fund_id, local_part);

update public.fund_email_mailboxes
set claimed_by_user_id = user_id,
    claimed_at = coalesce(created_at, now())
where kind = 'user' and claimed_at is null;

alter table public.fund_email_mailboxes
  drop constraint if exists fund_email_mailboxes_owner_check;

alter table public.fund_email_mailboxes
  add constraint fund_email_mailboxes_owner_check check (
    (
      kind = 'user'
      and claimed_by_user_id is not null
      and claimed_at is not null
      and local_part not in ('pitch', 'expert')
      and (user_id is null or claimed_by_user_id = user_id)
    )
    or (
      kind <> 'user'
      and user_id is null
      and claimed_by_user_id is null
      and claimed_at is null
    )
  );

create or replace function public.fund_email_mailbox_identity_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.fund_id is distinct from old.fund_id
    or new.local_part is distinct from old.local_part
    or new.kind is distinct from old.kind
    or new.claimed_by_user_id is distinct from old.claimed_by_user_id
    or new.claimed_at is distinct from old.claimed_at
  then
    raise exception using errcode = '23514', message = 'Fund mailbox identity is immutable';
  end if;
  return new;
end;
$$;

create trigger fund_email_mailbox_identity_immutable
  before update on public.fund_email_mailboxes
  for each row execute function public.fund_email_mailbox_identity_immutable();

create or replace function public.fund_email_set_user_mailbox(
  p_fund_id uuid,
  p_user_id uuid,
  p_local_part text,
  p_display_name text
)
returns public.fund_email_mailboxes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mailbox public.fund_email_mailboxes;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('fund-mailbox:' || p_fund_id::text || ':' || p_user_id::text, 0)
  );

  if not exists (
    select 1 from public.fund_members as members
    where members.fund_id = p_fund_id and members.user_id = p_user_id
  ) then
    raise exception using errcode = '42501', message = 'Fund membership is required';
  end if;

  if p_local_part is null
    or p_local_part <> lower(p_local_part)
    or char_length(p_local_part) not between 1 and 64
    or p_local_part !~ '^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$'
    or p_local_part like '%..%'
    or p_local_part like '%._%'
    or p_local_part like '%_.%'
    or p_local_part in (
      'abuse', 'admin', 'expert', 'mail', 'no-reply', 'noreply',
      'pitch', 'postmaster', 'security', 'support', 'system'
    )
    or p_display_name is null
    or char_length(btrim(p_display_name)) not between 1 and 120
    or p_display_name ~ E'[\r\n]'
  then
    raise exception using errcode = '22023', message = 'Invalid Fund mailbox';
  end if;

  select * into v_mailbox
  from public.fund_email_mailboxes as mailboxes
  where mailboxes.fund_id = p_fund_id
    and mailboxes.kind = 'user'
    and mailboxes.claimed_by_user_id = p_user_id
  for update;

  if v_mailbox.id is not null then
    if v_mailbox.local_part <> p_local_part then
      -- Fund mailbox local part is immutable.
      raise exception using errcode = '23505', message = 'Fund mailbox local part is immutable';
    end if;
    update public.fund_email_mailboxes
    set user_id = p_user_id,
        display_name = btrim(p_display_name),
        active = true,
        updated_at = now()
    where id = v_mailbox.id
    returning * into v_mailbox;
    return v_mailbox;
  end if;

  insert into public.fund_email_mailboxes (
    fund_id, local_part, kind, user_id, claimed_by_user_id,
    claimed_at, display_name, active
  ) values (
    p_fund_id, p_local_part, 'user', p_user_id, p_user_id,
    now(), btrim(p_display_name), true
  ) returning * into v_mailbox;

  return v_mailbox;
end;
$$;

create or replace function public.fund_email_update_user_mailbox_display_name(
  p_fund_id uuid,
  p_user_id uuid,
  p_display_name text
)
returns public.fund_email_mailboxes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mailbox public.fund_email_mailboxes;
begin
  if p_display_name is null
    or char_length(btrim(p_display_name)) not between 1 and 120
    or p_display_name ~ E'[\r\n]'
  then
    raise exception using errcode = '22023', message = 'Invalid Fund mailbox display name';
  end if;

  if not exists (
    select 1 from public.fund_members as members
    where members.fund_id = p_fund_id and members.user_id = p_user_id
  ) then
    raise exception using errcode = '42501', message = 'Fund membership is required';
  end if;

  update public.fund_email_mailboxes as mailboxes
  set display_name = btrim(p_display_name), updated_at = now()
  where mailboxes.fund_id = p_fund_id
    and mailboxes.user_id = p_user_id
    and mailboxes.claimed_by_user_id = p_user_id
    and mailboxes.kind = 'user'
    and mailboxes.active is true
  returning * into v_mailbox;

  if v_mailbox.id is null then
    raise exception using errcode = 'P0002', message = 'Active Fund mailbox not found';
  end if;

  return v_mailbox;
end;
$$;

-- Server-owned profile mutation keeps the global real name and the active
-- Fund mailbox display header in one transaction without changing mailbox or
-- membership identity.
create or replace function public.update_user_profile(
  p_user_id uuid,
  p_full_name text
)
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.user_profiles;
begin
  if p_full_name is null
    or char_length(btrim(p_full_name)) not between 1 and 120
    or p_full_name ~ E'[\r\n]'
  then
    raise exception using errcode = '22023', message = 'Invalid personal profile';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception using errcode = 'P0002', message = 'Auth user not found';
  end if;

  insert into public.user_profiles (user_id, full_name)
  values (p_user_id, btrim(p_full_name))
  on conflict (user_id) do update
  set full_name = excluded.full_name,
      updated_at = now()
  returning * into v_profile;

  update public.fund_email_mailboxes as mailboxes
  set display_name = v_profile.full_name,
      updated_at = now()
  where mailboxes.kind = 'user'
    and mailboxes.claimed_by_user_id = p_user_id
    and mailboxes.user_id = p_user_id
    and mailboxes.active is true
    and exists (
      select 1 from public.fund_members as members
      where members.fund_id = mailboxes.fund_id
        and members.user_id = p_user_id
    );

  return v_profile;
end;
$$;

create or replace function public.fund_email_detach_deleted_member_mailbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.fund_email_mailboxes
  set claimed_by_user_id = old.user_id,
      user_id = null,
      active = false,
      updated_at = now()
  where fund_id = old.fund_id
    and user_id = old.user_id
    and kind = 'user';
  return old;
end;
$$;

drop trigger if exists fund_members_detach_email_mailbox on public.fund_members;
drop trigger if exists fund_email_detach_deleted_member_mailbox on public.fund_members;
create trigger fund_email_detach_deleted_member_mailbox
  before delete on public.fund_members
  for each row execute function public.fund_email_detach_deleted_member_mailbox();

-- ---------------------------------------------------------------------------
-- Atomic Fund bootstrap and unconditional identity immutability.
-- ---------------------------------------------------------------------------

create or replace function public.fund_slug_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception using errcode = '23514', message = 'Fund slug is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.fund_founder_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception using errcode = '23514', message = 'Fund founder is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists fund_founder_immutable on public.funds;
create trigger fund_founder_immutable
  before update of created_by on public.funds
  for each row execute function public.fund_founder_immutable();

-- The bootstrap owns creator membership; direct Fund inserts no longer use a
-- trigger that would create membership outside this explicit transaction.
drop trigger if exists fund_creator_member on public.funds;

create or replace function public.bootstrap_fund_identity(
  p_actor_user_id uuid,
  p_name text,
  p_slug text,
  p_encryption_key_encrypted text,
  p_claude_api_key_encrypted text default null,
  p_postmark_webhook_token_encrypted text default null
)
returns table (fund_id uuid, slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fund public.funds;
begin
  perform pg_advisory_xact_lock(hashtextextended('auth-user:' || p_actor_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('fund-slug:' || coalesce(p_slug, ''), 0));

  if not exists (
    select 1 from auth.users as users
    where users.id = p_actor_user_id
      and users.email_confirmed_at is not null
      and split_part(lower(btrim(users.email)), '@', 2) <> 'fundworkspace.com'
      and split_part(lower(btrim(users.email)), '@', 2) not like '%.fundworkspace.com'
  ) then
    raise exception using errcode = '42501', message = 'Verified external account required';
  end if;

  if p_name is null
    or char_length(btrim(p_name)) not between 1 and 160
    or p_name ~ E'[\r\n]'
    or p_slug is null
    or p_slug <> lower(p_slug)
    or char_length(p_slug) not between 3 and 63
    or p_slug !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
    or p_slug ~ '^xn--'
    or p_slug in (
      'abuse', 'admin', 'api', 'app', 'auth', 'billing', 'docs',
      'fundworkspace', 'hooks', 'internal', 'mail', 'postmaster',
      'security', 'smtp', 'status', 'support', 'www'
    )
    or p_encryption_key_encrypted is null
    or btrim(p_encryption_key_encrypted) = ''
  then
    raise exception using errcode = '22023', message = 'Invalid Fund identity';
  end if;

  select funds.* into v_fund
  from public.funds as funds
  where funds.created_by = p_actor_user_id
  for update;

  if v_fund.id is not null then
    if v_fund.slug = p_slug then
      return query select v_fund.id, v_fund.slug;
      return;
    end if;
    raise exception using errcode = '23505', message = 'Account already owns a Fund';
  end if;

  if exists (select 1 from public.fund_members where user_id = p_actor_user_id) then
    raise exception using errcode = '23505', message = 'Account already belongs to a Fund';
  end if;

  insert into public.funds (name, created_by, slug, email_subdomain, email_domain)
  values (btrim(p_name), p_actor_user_id, p_slug, p_slug, null)
  returning * into v_fund;

  insert into public.fund_members (fund_id, user_id, invited_by, role)
  values (v_fund.id, p_actor_user_id, p_actor_user_id, 'admin');

  insert into public.fund_settings (
    fund_id,
    encryption_key_encrypted,
    claude_api_key_encrypted,
    postmark_webhook_token_encrypted
  ) values (
    v_fund.id,
    p_encryption_key_encrypted,
    p_claude_api_key_encrypted,
    p_postmark_webhook_token_encrypted
  );

  perform public.fund_email_ensure_reserved_mailboxes(v_fund.id);

  return query select v_fund.id, v_fund.slug;
end;
$$;

-- New Funds already have equal identities. Preserve every existing immutable
-- identity, including labels that became reserved later. A legacy Fund missing
-- its email identity keeps its Host slug and receives that slug only when it is
-- safe across both namespaces; otherwise use a deterministic UUID-derived
-- fallback that cannot collide with a reserved label.
do $$
declare
  missing record;
  candidate text;
  base_candidate text;
  suffix text;
  attempt integer;
begin
  for missing in
    select id, lower(slug) as slug
    from public.funds
    where email_subdomain is null
    order by id
    for update
  loop
    candidate := missing.slug;
    if candidate is null
      or char_length(candidate) not between 3 and 63
      or candidate !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
      or candidate ~ '^xn--'
      or candidate in (
        'abuse', 'admin', 'api', 'app', 'auth', 'billing', 'docs',
        'fundworkspace', 'hooks', 'internal', 'mail', 'postmaster',
        'security', 'smtp', 'status', 'support', 'www'
      )
      or exists (
        select 1 from public.funds as existing
        where existing.id <> missing.id
          and (
            lower(existing.slug) = candidate
            or lower(existing.email_subdomain) = candidate
          )
      )
    then
      base_candidate := 'f-' || replace(missing.id::text, '-', '');
      attempt := 0;
      loop
        suffix := case when attempt = 0 then '' else '-' || attempt::text end;
        candidate := left(base_candidate, 63 - char_length(suffix)) || suffix;
        exit when not exists (
          select 1 from public.funds as existing
          where existing.id <> missing.id
            and (
              lower(existing.slug) = candidate
              or lower(existing.email_subdomain) = candidate
            )
        );
        attempt := attempt + 1;
        if attempt > 100 then
          raise exception using errcode = '23505', message = 'Unable to assign legacy Fund email identity';
        end if;
      end loop;
    end if;

    update public.funds
    set email_subdomain = candidate
    where id = missing.id;
  end loop;
end;
$$;

alter table public.funds alter column email_subdomain set not null;

create or replace function public.fund_email_subdomain_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.email_subdomain is distinct from old.email_subdomain then
    raise exception using errcode = '23514', message = 'Fund email subdomain is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists funds_email_subdomain_immutable on public.funds;
create trigger funds_email_subdomain_immutable
  before update of email_subdomain on public.funds
  for each row execute function public.fund_email_subdomain_immutable();

-- A Fund identity is a durable namespace reservation. Hard deletion would
-- release both its tenant Host and its historical inbound mailbox addresses.
drop policy if exists "Fund owners can delete their fund" on public.funds;
drop policy if exists "Fund creator can delete their fund" on public.funds;
revoke delete on table public.funds from authenticated;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'funds' and cmd = 'DELETE'
  ) then
    raise exception using errcode = '42501', message = 'Fund DELETE policy must be removed';
  end if;
end;
$$;

create or replace function public.fund_identity_delete_forbidden()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception using errcode = '23514', message = 'Fund identity cannot be deleted';
end;
$$;

drop trigger if exists fund_identity_delete_forbidden on public.funds;
create trigger fund_identity_delete_forbidden
  before delete on public.funds
  for each row execute function public.fund_identity_delete_forbidden();

-- ---------------------------------------------------------------------------
-- Auth signup hook: allow exact live invitations and reject internal mailboxes
-- before wildcard allowlists, including direct Supabase Auth API calls.
-- ---------------------------------------------------------------------------

create or replace function public.reject_internal_auth_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  candidate_domain text;
begin
  foreach candidate in array array[new.email, nullif(new.email_change, '')]
  loop
    candidate := lower(btrim(candidate));
    candidate_domain := split_part(coalesce(candidate, ''), '@', 2);
    if candidate_domain = 'fundworkspace.com' or candidate_domain like '%.fundworkspace.com' then
      raise exception using errcode = '42501', message = 'Internal Fund email cannot authenticate';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists reject_internal_auth_email on auth.users;
create trigger reject_internal_auth_email
  before insert or update of email, email_change on auth.users
  for each row execute function public.reject_internal_auth_email();

revoke all on function public.reject_internal_auth_email() from public, anon, authenticated;

-- Install the guard before inspecting legacy rows so concurrent Auth writes
-- cannot land between the preflight and trigger creation. If preflight fails,
-- the surrounding migration transaction rolls the trigger back as well.
do $$
begin
  if exists (
    select 1
    from auth.users
    where split_part(lower(btrim(coalesce(email, ''))), '@', 2) = 'fundworkspace.com'
       or split_part(lower(btrim(coalesce(email, ''))), '@', 2) like '%.fundworkspace.com'
       or split_part(lower(btrim(coalesce(nullif(email_change, ''), ''))), '@', 2) = 'fundworkspace.com'
       or split_part(lower(btrim(coalesce(nullif(email_change, ''), ''))), '@', 2) like '%.fundworkspace.com'
  ) then
    raise exception using errcode = '42501',
      message = 'Existing internal Auth identities must be migrated to external email first';
  end if;
end;
$$;

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email text;
  email_domain text;
  is_allowed boolean;
begin
  user_email := lower(btrim(event->'user'->>'email'));
  if user_email is null or user_email = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Email is required.'));
  end if;

  email_domain := split_part(user_email, '@', 2);
  if email_domain = 'fundworkspace.com' or email_domain like '%.fundworkspace.com' then
    return jsonb_build_object(
      'error',
      jsonb_build_object('http_code', 403, 'message', 'Internal Fund email cannot authenticate.')
    );
  end if;

  select
    exists (
      select 1 from public.allowed_signups
      where email_pattern = user_email or email_pattern = '*@' || email_domain
    )
    or exists (
      select 1 from public.lp_accounts where lower(btrim(email)) = user_email
    )
    or exists (
      select 1 from public.fund_member_invitations
      where email_normalized = user_email
        and delivery_confirmed_at is not null
        and accepted_at is null
        and revoked_at is null
        and replaced_at is null
        and expires_at > now()
    )
  into is_allowed;

  if not is_allowed then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'This email is not authorized to sign up.'));
  end if;
  return '{}'::jsonb;
end;
$$;

-- ---------------------------------------------------------------------------
-- Remove direct Data API bypasses and expose only service-role transactions.
-- ---------------------------------------------------------------------------

drop policy if exists "Authenticated users can create a fund" on public.funds;
drop policy if exists "Fund members can update their fund" on public.funds;
drop policy if exists "Fund admins can invite others" on public.fund_members;
drop policy if exists "Authenticated users can create join requests" on public.fund_join_requests;
drop policy if exists "Fund admins can update join requests" on public.fund_join_requests;

revoke insert on table public.funds from authenticated;
revoke insert on table public.fund_members from authenticated;
revoke insert, update, delete on table public.fund_join_requests from authenticated, service_role;

create policy "Fund admins can update their fund"
  on public.funds for update to authenticated
  using (public.is_fund_admin(id))
  with check (public.is_fund_admin(id));

revoke delete on table public.fund_email_mailboxes from service_role;

revoke execute on function public.claim_fund_join_request_approval(uuid, uuid, uuid, uuid) from service_role;
revoke execute on function public.release_fund_join_request_approval(uuid, uuid) from service_role;
revoke execute on function public.approve_fund_join_request(uuid, uuid, uuid, uuid) from service_role;
revoke execute on function public.reject_fund_join_request(uuid, uuid, uuid) from service_role;

revoke all on function public.create_fund_member_invitation(uuid, text, text, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.create_fund_member_invitation(uuid, text, text, text, timestamptz, uuid)
  to service_role;

revoke all on function public.rotate_fund_member_invitation(uuid, uuid, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.rotate_fund_member_invitation(uuid, uuid, text, timestamptz, uuid)
  to service_role;

revoke all on function public.confirm_fund_member_invitation_delivery(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_fund_member_invitation_delivery(uuid, uuid, uuid)
  to service_role;

revoke all on function public.revoke_fund_member_invitation(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.revoke_fund_member_invitation(uuid, uuid, uuid)
  to service_role;

revoke all on function public.resolve_fund_member_invitation(text)
  from public, anon, authenticated;
grant execute on function public.resolve_fund_member_invitation(text)
  to service_role;

revoke all on function public.accept_fund_member_invitation(text, uuid)
  from public, anon, authenticated;
grant execute on function public.accept_fund_member_invitation(text, uuid)
  to service_role;

revoke all on function public.update_user_profile(uuid, text)
  from public, anon, authenticated;
grant execute on function public.update_user_profile(uuid, text)
  to service_role;

revoke all on function public.bootstrap_fund_identity(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.bootstrap_fund_identity(uuid, text, text, text, text, text)
  to service_role;

revoke all on function public.fund_email_set_user_mailbox(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.fund_email_set_user_mailbox(uuid, uuid, text, text)
  to service_role;

revoke all on function public.fund_email_update_user_mailbox_display_name(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fund_email_update_user_mailbox_display_name(uuid, uuid, text)
  to service_role;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant select on table public.fund_member_invitations to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
