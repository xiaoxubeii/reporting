-- Serialize each logical bucket so concurrent requests cannot all observe the
-- same pre-insert count. The advisory lock is transaction-scoped and therefore
-- releases automatically on success or error.
create or replace function public.rate_limit_check(
  p_key text,
  p_limit int,
  p_window_seconds int
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_window_start timestamptz;
begin
  if p_key is null or octet_length(p_key) < 1 or octet_length(p_key) > 512 then
    raise exception 'rate limit key must contain 1 to 512 bytes';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'rate limit must be between 1 and 10000';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'rate limit window must be between 1 and 86400 seconds';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_key, 0)
  );
  v_window_start := pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds);

  delete from public.rate_limit_entries
  where key = p_key and created_at < v_window_start;

  select count(*) into v_count
  from public.rate_limit_entries
  where key = p_key and created_at >= v_window_start;

  if v_count >= p_limit then
    return v_count + 1;
  end if;

  insert into public.rate_limit_entries (key, created_at)
  values (p_key, pg_catalog.now());
  return v_count + 1;
end;
$$;

revoke all on function public.rate_limit_check(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_check(text, int, int) to service_role;
