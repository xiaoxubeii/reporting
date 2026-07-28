-- Additive account-level manual timezone preference. NULL keeps Automatic
-- device detection; application boundaries validate actual IANA support.
-- This file is a ledger-managed, one-shot Supabase migration. Replays are
-- performed by rebuilding the database from the migration ledger, not by
-- executing an already-recorded migration against the same schema.

alter table public.user_profiles
  add column time_zone text
  check (
    time_zone is null
    or (
      char_length(time_zone) between 1 and 128
      and time_zone = btrim(time_zone)
      and time_zone !~ E'[\r\n\t]'
      and time_zone !~ '[[:cntrl:]]'
    )
  );

-- Preserve the existing owner-select policy and service-only write boundary.
revoke insert, update, delete on table public.user_profiles from authenticated;
revoke all on table public.user_profiles from public, anon;

create or replace function public.update_user_time_zone(
  p_user_id uuid,
  p_time_zone text
)
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.user_profiles;
begin
  if p_time_zone is not null and (
    char_length(p_time_zone) not between 1 and 128
    or p_time_zone <> btrim(p_time_zone)
    or p_time_zone ~ E'[\r\n\t]'
    or p_time_zone ~ '[[:cntrl:]]'
  ) then
    raise exception using errcode = '22023', message = 'Invalid time zone preference';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception using errcode = 'P0002', message = 'Auth user not found';
  end if;

  insert into public.user_profiles (user_id, time_zone)
  values (p_user_id, p_time_zone)
  on conflict (user_id) do update
  set time_zone = excluded.time_zone
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.update_user_time_zone(uuid, text)
  from public, anon, authenticated;
grant execute on function public.update_user_time_zone(uuid, text)
  to service_role;
