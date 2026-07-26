-- Stable Fund host identity and least-privilege tenant resolution.

alter table public.funds
  add column if not exists slug text;

create or replace function public.generated_fund_slug(p_name text, p_id uuid)
returns text
language sql
immutable
set search_path = public
as $$
  select left(
    coalesce(
      nullif(trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g')), ''),
      'fund'
    ),
    28
  ) || '-' || replace(p_id::text, '-', '');
$$;

update public.funds
set slug = public.generated_fund_slug(name, id)
where slug is null;

alter table public.funds
  alter column slug set not null,
  add constraint funds_slug_dns_safe check (
    length(slug) between 3 and 63
    and slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
    and slug !~ '^xn--'
  ),
  add constraint funds_slug_not_reserved check (
    slug not in ('www', 'api', 'auth', 'admin', 'hooks', 'internal', 'support', 'fundworkspace')
  ),
  add constraint funds_slug_key unique (slug);

create or replace function public.fund_slug_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.slug is null then
    new.slug := public.generated_fund_slug(new.name, new.id);
  end if;
  return new;
end;
$$;

create trigger fund_slug_default
  before insert on public.funds
  for each row execute function public.fund_slug_default();

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

create trigger fund_slug_immutable
  before update on public.funds
  for each row execute function public.fund_slug_immutable();

-- A single auth identity and a single LP account may resolve to exactly one
-- Fund across GP membership, direct LP links, and delegated LP access. The
-- advisory locks make the read-before-write checks safe under concurrent
-- provisioning requests.
create or replace function public.assert_lp_account_fund_compatible(
  p_lp_account_id uuid,
  p_fund_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lp-account:' || p_lp_account_id::text, 0)
  );

  if exists (
    select 1
    from public.lp_account_links as links
    where links.lp_account_id = p_lp_account_id
      and links.fund_id <> p_fund_id
    union all
    select 1
    from public.lp_authorized_users as authorized
    join public.lp_investors as investors on investors.id = authorized.lp_investor_id
    where authorized.authorized_user_account_id = p_lp_account_id
      and investors.fund_id <> p_fund_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'LP account cannot access more than one Fund';
  end if;
end;
$$;

create or replace function public.assert_user_fund_compatible(
  p_user_id uuid,
  p_fund_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('auth-user:' || p_user_id::text, 0)
  );

  if exists (
    select 1
    from public.fund_members as members
    where members.user_id = p_user_id
      and members.fund_id <> p_fund_id
    union all
    select 1
    from public.lp_accounts as accounts
    join public.lp_account_links as links on links.lp_account_id = accounts.id
    where accounts.auth_user_id = p_user_id
      and links.fund_id <> p_fund_id
    union all
    select 1
    from public.lp_accounts as accounts
    join public.lp_authorized_users as authorized
      on authorized.authorized_user_account_id = accounts.id
    join public.lp_investors as investors on investors.id = authorized.lp_investor_id
    where accounts.auth_user_id = p_user_id
      and investors.fund_id <> p_fund_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Auth user cannot access more than one Fund';
  end if;
end;
$$;

revoke all on function public.assert_lp_account_fund_compatible(uuid, uuid) from public, anon, authenticated;
revoke all on function public.assert_user_fund_compatible(uuid, uuid) from public, anon, authenticated;

do $$
declare
  conflicting_user uuid;
  conflicting_link uuid;
begin
  select links.id
  into conflicting_link
  from public.lp_account_links as links
  join public.lp_investors as investors on investors.id = links.lp_investor_id
  where links.fund_id <> investors.fund_id
  limit 1;

  if conflicting_link is not null then
    raise exception using
      errcode = '23514',
      message = 'Existing LP account link has mismatched Fund and investor';
  end if;

  select user_funds.user_id
  into conflicting_user
  from (
    select members.user_id, members.fund_id
    from public.fund_members as members
    union
    select accounts.auth_user_id, links.fund_id
    from public.lp_accounts as accounts
    join public.lp_account_links as links on links.lp_account_id = accounts.id
    where accounts.auth_user_id is not null
    union
    select accounts.auth_user_id, investors.fund_id
    from public.lp_accounts as accounts
    join public.lp_authorized_users as authorized
      on authorized.authorized_user_account_id = accounts.id
    join public.lp_investors as investors on investors.id = authorized.lp_investor_id
    where accounts.auth_user_id is not null
  ) as user_funds
  group by user_funds.user_id
  having count(distinct user_funds.fund_id) > 1
  limit 1;

  if conflicting_user is not null then
    raise exception using
      errcode = '23514',
      message = 'Existing auth user can access more than one Fund';
  end if;
end;
$$;

create or replace function public.enforce_fund_member_single_fund()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_user_fund_compatible(new.user_id, new.fund_id);
  return new;
end;
$$;

create trigger fund_members_single_fund
  before insert or update of user_id, fund_id on public.fund_members
  for each row execute function public.enforce_fund_member_single_fund();

create or replace function public.enforce_lp_account_link_single_fund()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  investor_fund_id uuid;
  linked_user_id uuid;
begin
  select investors.fund_id
  into investor_fund_id
  from public.lp_investors as investors
  where investors.id = new.lp_investor_id;

  if investor_fund_id is null or investor_fund_id <> new.fund_id then
    raise exception using
      errcode = '23514',
      message = 'LP account link Fund must match investor Fund';
  end if;

  perform public.assert_lp_account_fund_compatible(new.lp_account_id, new.fund_id);

  select accounts.auth_user_id
  into linked_user_id
  from public.lp_accounts as accounts
  where accounts.id = new.lp_account_id;

  if linked_user_id is not null then
    perform public.assert_user_fund_compatible(linked_user_id, new.fund_id);
  end if;
  return new;
end;
$$;

create trigger lp_account_links_single_fund
  before insert or update of lp_account_id, fund_id, lp_investor_id
  on public.lp_account_links
  for each row execute function public.enforce_lp_account_link_single_fund();

create or replace function public.enforce_lp_authorized_user_single_fund()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  investor_fund_id uuid;
  linked_user_id uuid;
begin
  select investors.fund_id
  into investor_fund_id
  from public.lp_investors as investors
  where investors.id = new.lp_investor_id;

  if investor_fund_id is null then
    raise exception using errcode = '23503', message = 'LP investor does not exist';
  end if;

  perform public.assert_lp_account_fund_compatible(
    new.authorized_user_account_id,
    investor_fund_id
  );

  select accounts.auth_user_id
  into linked_user_id
  from public.lp_accounts as accounts
  where accounts.id = new.authorized_user_account_id;

  if linked_user_id is not null then
    perform public.assert_user_fund_compatible(linked_user_id, investor_fund_id);
  end if;
  return new;
end;
$$;

create trigger lp_authorized_users_single_fund
  before insert or update of authorized_user_account_id, lp_investor_id
  on public.lp_authorized_users
  for each row execute function public.enforce_lp_authorized_user_single_fund();

create or replace function public.enforce_lp_investor_fund_immutable_while_linked()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.fund_id = old.fund_id then
    return new;
  end if;

  if exists (
    select 1
    from public.lp_account_links as links
    where links.lp_investor_id = old.id
  ) or exists (
    select 1
    from public.lp_authorized_users as authorized
    where authorized.lp_investor_id = old.id
  ) then
    raise exception using
      errcode = '23514',
      message = 'LP investor Fund cannot change while linked accounts or delegated users exist';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_lp_investor_fund_immutable_while_linked() from public, anon, authenticated;

create trigger lp_investors_fund_immutable_while_linked
  before update of fund_id on public.lp_investors
  for each row execute function public.enforce_lp_investor_fund_immutable_while_linked();

create or replace function public.enforce_lp_account_auth_user_single_fund()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  account_fund_id uuid;
  account_fund_count integer;
begin
  if new.auth_user_id is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lp-account:' || new.id::text, 0)
  );

  select count(distinct funds.fund_id), (array_agg(distinct funds.fund_id))[1]
  into account_fund_count, account_fund_id
  from (
    select links.fund_id
    from public.lp_account_links as links
    where links.lp_account_id = new.id
    union
    select investors.fund_id
    from public.lp_authorized_users as authorized
    join public.lp_investors as investors on investors.id = authorized.lp_investor_id
    where authorized.authorized_user_account_id = new.id
  ) as funds;

  if account_fund_count > 1 then
    raise exception using
      errcode = '23514',
      message = 'LP account cannot access more than one Fund';
  end if;

  if account_fund_id is not null then
    perform public.assert_user_fund_compatible(new.auth_user_id, account_fund_id);
  end if;
  return new;
end;
$$;

create trigger lp_accounts_auth_user_single_fund
  before insert or update of auth_user_id on public.lp_accounts
  for each row execute function public.enforce_lp_account_auth_user_single_fund();

create or replace function public.resolve_public_fund_host(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  logo_url text,
  theme jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  select
    funds.id,
    funds.slug,
    funds.name,
    funds.logo_url,
    case
      when fund_settings.theme is null then null
      else jsonb_strip_nulls(jsonb_build_object(
        'accent', fund_settings.theme -> 'accent',
        'font', fund_settings.theme -> 'font',
        'radius', fund_settings.theme -> 'radius'
      ))
    end
  from public.funds as funds
  left join public.fund_settings as fund_settings on fund_settings.fund_id = funds.id
  where funds.slug = p_slug
  limit 1;
$$;

revoke all on function public.resolve_public_fund_host(text) from public;
grant execute on function public.resolve_public_fund_host(text) to anon, authenticated, service_role;

create or replace function public.resolve_my_lp_fund()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  with my_account as (
    select id
    from public.lp_accounts
    where auth_user_id = auth.uid() and status = 'active'
  ),
  accessible_funds as (
    select links.fund_id
    from public.lp_account_links as links
    join my_account on my_account.id = links.lp_account_id
    union
    select investors.fund_id
    from public.lp_authorized_users as authorized
    join my_account on my_account.id = authorized.authorized_user_account_id
    join public.lp_accounts as principal
      on principal.id = authorized.principal_lp_account_id and principal.status = 'active'
    join public.lp_investors as investors on investors.id = authorized.lp_investor_id
  )
  select case
    when count(distinct fund_id) = 1 then (array_agg(distinct fund_id))[1]
    else null
  end
  from accessible_funds;
$$;

revoke all on function public.resolve_my_lp_fund() from public, anon;
grant execute on function public.resolve_my_lp_fund() to authenticated, service_role;
