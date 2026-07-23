create table if not exists public.miniflux_provisioning_leases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_id uuid not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.miniflux_provisioning_leases enable row level security;
revoke all on public.miniflux_provisioning_leases from public, anon, authenticated;
grant select, insert, update, delete on public.miniflux_provisioning_leases to service_role;

create or replace function public.try_claim_miniflux_provisioning_lease(
  p_user_id uuid,
  p_owner_id uuid,
  p_ttl_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean := false;
begin
  if p_ttl_seconds < 5 or p_ttl_seconds > 120 then
    raise exception using errcode = '22023', message = 'Invalid provisioning lease duration';
  end if;

  insert into public.miniflux_provisioning_leases (user_id, owner_id, expires_at, updated_at)
  values (p_user_id, p_owner_id, now() + make_interval(secs => p_ttl_seconds), now())
  on conflict (user_id) do update
  set owner_id = excluded.owner_id,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  where public.miniflux_provisioning_leases.expires_at <= now()
     or public.miniflux_provisioning_leases.owner_id = excluded.owner_id
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;

create or replace function public.release_miniflux_provisioning_lease(
  p_user_id uuid,
  p_owner_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.miniflux_provisioning_leases
  where user_id = p_user_id and owner_id = p_owner_id;
$$;

revoke all on function public.try_claim_miniflux_provisioning_lease(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_miniflux_provisioning_lease(uuid, uuid) from public, anon, authenticated;
grant execute on function public.try_claim_miniflux_provisioning_lease(uuid, uuid, integer) to service_role;
grant execute on function public.release_miniflux_provisioning_lease(uuid, uuid) to service_role;
