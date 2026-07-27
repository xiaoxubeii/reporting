-- Structured, revisioned Fund public sites. Drafts stay private; anonymous
-- callers can resolve only the complete published snapshot through one RPC.

create table public.fund_public_sites (
  fund_id uuid primary key references public.funds(id) on delete cascade,
  draft_template_key text not null default 'focus'
    check (draft_template_key in ('focus', 'institutional', 'minimal')),
  draft_content jsonb not null,
  draft_revision bigint not null default 1 check (draft_revision > 0),
  lifecycle_revision bigint not null default 1 check (lifecycle_revision > 0),
  published_template_key text
    check (published_template_key is null or published_template_key in ('focus', 'institutional', 'minimal')),
  published_content jsonb,
  published_version bigint not null default 0 check (published_version >= 0),
  published_from_draft_revision bigint,
  is_published boolean not null default false,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint fund_public_sites_draft_object check (
    jsonb_typeof(draft_content) = 'object'
    and draft_content ->> 'schemaVersion' = '1'
    and pg_column_size(draft_content) <= 50000
  ),
  constraint fund_public_sites_published_tuple check (
    (published_template_key is null and published_content is null
      and published_from_draft_revision is null and published_at is null
      and published_version = 0 and is_published = false)
    or
    (published_template_key is not null and published_content is not null
      and published_from_draft_revision is not null and published_at is not null
      and published_version > 0
      and jsonb_typeof(published_content) = 'object'
      and published_content ->> 'schemaVersion' = '1'
      and pg_column_size(published_content) <= 50000)
  )
);

alter table public.fund_public_sites enable row level security;
alter table public.fund_public_sites force row level security;
revoke all on table public.fund_public_sites from public, anon, authenticated;
grant select on table public.fund_public_sites to service_role;
grant insert (fund_id, draft_template_key, draft_content, updated_by)
  on table public.fund_public_sites to service_role;
grant update (draft_template_key, draft_content, draft_revision, updated_at, updated_by)
  on table public.fund_public_sites to service_role;

create or replace function public.resolve_published_fund_site(p_slug text)
returns table (
  fund_id uuid,
  slug text,
  name text,
  logo_url text,
  template_key text,
  content jsonb,
  published_version bigint,
  published_at timestamptz
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select
    funds.id,
    funds.slug,
    funds.name,
    funds.logo_url,
    sites.published_template_key,
    sites.published_content,
    sites.published_version,
    sites.published_at
  from public.funds as funds
  join public.fund_public_sites as sites on sites.fund_id = funds.id
  where funds.slug = p_slug
    and sites.is_published = true
    and sites.published_template_key is not null
    and sites.published_content is not null
  limit 1;
$$;

revoke all on function public.resolve_published_fund_site(text) from public;
grant execute on function public.resolve_published_fund_site(text) to anon, authenticated, service_role;

create or replace function public.publish_fund_public_site(
  p_fund_id uuid,
  p_expected_draft_revision bigint,
  p_expected_lifecycle_revision bigint,
  p_user_id uuid
)
returns table (
  draft_revision bigint,
  published_version bigint,
  published_from_draft_revision bigint,
  is_published boolean,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  site public.fund_public_sites%rowtype;
begin
  select * into site
  from public.fund_public_sites
  where fund_id = p_fund_id
  for update;

  if not found
    or site.draft_revision <> p_expected_draft_revision
    or site.lifecycle_revision <> p_expected_lifecycle_revision then
    raise exception using errcode = '40001', message = 'stale public site state';
  end if;

  if site.draft_template_key not in ('focus', 'institutional', 'minimal')
    or jsonb_typeof(site.draft_content) <> 'object'
    or site.draft_content ->> 'schemaVersion' <> '1'
    or pg_column_size(site.draft_content) > 50000 then
    raise exception using errcode = '22023', message = 'invalid public site draft';
  end if;

  update public.fund_public_sites
  set published_template_key = site.draft_template_key,
      published_content = site.draft_content,
      published_version = site.published_version + 1,
      lifecycle_revision = site.lifecycle_revision + 1,
      published_from_draft_revision = site.draft_revision,
      is_published = true,
      published_at = statement_timestamp(),
      published_by = p_user_id,
      updated_at = statement_timestamp(),
      updated_by = p_user_id
  where fund_id = p_fund_id
  returning fund_public_sites.draft_revision,
            fund_public_sites.published_version,
            fund_public_sites.published_from_draft_revision,
            fund_public_sites.is_published,
            fund_public_sites.published_at
  into draft_revision, published_version, published_from_draft_revision, is_published, published_at;
  return next;
end;
$$;

revoke all on function public.publish_fund_public_site(uuid, bigint, bigint, uuid) from public, anon, authenticated;
grant execute on function public.publish_fund_public_site(uuid, bigint, bigint, uuid) to service_role;

create or replace function public.unpublish_fund_public_site(
  p_fund_id uuid,
  p_expected_lifecycle_revision bigint,
  p_user_id uuid
)
returns table (
  draft_revision bigint,
  published_version bigint,
  published_from_draft_revision bigint,
  is_published boolean,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  site public.fund_public_sites%rowtype;
begin
  select * into site
  from public.fund_public_sites
  where fund_id = p_fund_id
  for update;

  if not found or site.lifecycle_revision <> p_expected_lifecycle_revision then
    raise exception using errcode = '40001', message = 'stale public site state';
  end if;

  update public.fund_public_sites
  set is_published = false,
      lifecycle_revision = site.lifecycle_revision + 1,
      updated_at = statement_timestamp(),
      updated_by = p_user_id
  where fund_id = p_fund_id
  returning fund_public_sites.draft_revision,
            fund_public_sites.published_version,
            fund_public_sites.published_from_draft_revision,
            fund_public_sites.is_published,
            fund_public_sites.published_at
  into draft_revision, published_version, published_from_draft_revision, is_published, published_at;
  return next;
end;
$$;

revoke all on function public.unpublish_fund_public_site(uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.unpublish_fund_public_site(uuid, bigint, uuid) to service_role;
