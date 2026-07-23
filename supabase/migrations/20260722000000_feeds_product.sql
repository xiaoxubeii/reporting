-- Feeds v1 uses Miniflux as the only store for feeds, categories,
-- subscriptions, entries, and per-user read/starred state. Reporting stores
-- only the encrypted credential that maps one Reporting user to one
-- non-admin Miniflux user.

create table public.miniflux_connections (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  api_token_encrypted     text not null,
  external_user_id        bigint not null unique check (external_user_id > 0),
  username                text not null,
  last_verified_at        timestamptz,
  last_error              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (length(username) > 0)
);

grant select, insert, update, delete on public.miniflux_connections to service_role;
revoke all on public.miniflux_connections from public, anon, authenticated;
alter table public.miniflux_connections enable row level security;

comment on table public.miniflux_connections is
  'Server-only mapping from a Reporting user to their dedicated non-admin Miniflux account. Feed data remains exclusively in Miniflux.';
