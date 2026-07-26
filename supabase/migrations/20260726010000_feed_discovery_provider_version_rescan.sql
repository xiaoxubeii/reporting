-- Reset only scan cursors when provider-backed AI cache versions change.
-- The active generation stays visible until the replacement backfill publishes.
create or replace function public.claim_explore_discovery_refresh(
  p_lease_id uuid,
  p_lease_seconds integer,
  p_semantic_version text,
  p_classifier_version text
)
returns table (
  acquired boolean,
  lease_until timestamptz,
  entry_watermark bigint,
  changed_watermark timestamptz,
  changed_entry_id bigint,
  changed_scan_cutoff timestamptz,
  active_generation uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lease_id is null
    or p_lease_seconds not between 30 and 3600
    or p_semantic_version is null
    or char_length(p_semantic_version) not between 1 and 100
    or p_classifier_version is null
    or char_length(p_classifier_version) not between 1 and 100 then
    raise exception 'invalid discovery refresh claim';
  end if;

  return query
  with claimed as (
    update public.explore_discovery_refresh_state as state
       set watermark_entry_id = case
             when state.target_semantic_version is distinct from p_semantic_version
               or state.target_classifier_version is distinct from p_classifier_version then 0
             else state.watermark_entry_id
           end,
           watermark_changed_at = case
             when state.target_semantic_version is distinct from p_semantic_version
               or state.target_classifier_version is distinct from p_classifier_version then now() - interval '30 days'
             else state.watermark_changed_at
           end,
           watermark_changed_entry_id = case
             when state.target_semantic_version is distinct from p_semantic_version
               or state.target_classifier_version is distinct from p_classifier_version then 0
             else state.watermark_changed_entry_id
           end,
           watermark_changed_scan_cutoff = case
             when state.target_semantic_version is distinct from p_semantic_version
               or state.target_classifier_version is distinct from p_classifier_version then null
             else state.watermark_changed_scan_cutoff
           end,
           lease_id = p_lease_id,
           lease_expires_at = now() + make_interval(secs => p_lease_seconds),
           target_semantic_version = p_semantic_version,
           target_classifier_version = p_classifier_version,
           last_attempt_at = now(),
           last_error_code = null,
           updated_at = now()
     where state.scope = 'public_explore'
       and (state.lease_id is null or state.lease_expires_at < now())
     returning state.lease_expires_at,
               state.watermark_entry_id,
               state.watermark_changed_at,
               state.watermark_changed_entry_id,
               state.watermark_changed_scan_cutoff,
               state.active_generation_id
  )
  select true,
         claimed.lease_expires_at,
         claimed.watermark_entry_id,
         claimed.watermark_changed_at,
         claimed.watermark_changed_entry_id,
         claimed.watermark_changed_scan_cutoff,
         claimed.active_generation_id
    from claimed
  union all
  select false,
         state.lease_expires_at,
         state.watermark_entry_id,
         state.watermark_changed_at,
         state.watermark_changed_entry_id,
         state.watermark_changed_scan_cutoff,
         state.active_generation_id
    from public.explore_discovery_refresh_state as state
   where state.scope = 'public_explore'
     and not exists (select 1 from claimed);
end;
$$;

revoke all on function public.claim_explore_discovery_refresh(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.claim_explore_discovery_refresh(uuid, integer, text, text) to service_role;

-- Publish only the provider-backed versions fenced by the current lease. The
-- original overload remains internal so this wrapper can reuse the reviewed
-- insertion/active-generation transaction without exposing an unfenced path.
revoke execute on function public.publish_explore_discovery_generation(uuid, uuid, jsonb, bigint, timestamptz, bigint, timestamptz, timestamptz, timestamptz) from service_role;

create or replace function public.publish_explore_discovery_generation(
  p_lease_id uuid,
  p_generation_id uuid,
  p_items jsonb,
  p_semantic_version text,
  p_classifier_version text,
  p_watermark_entry_id bigint,
  p_watermark_changed_at timestamptz,
  p_watermark_changed_entry_id bigint,
  p_watermark_changed_scan_cutoff timestamptz,
  p_generated_at timestamptz,
  p_expires_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_matches boolean;
begin
  if p_semantic_version is null
    or char_length(p_semantic_version) not between 1 and 100
    or p_classifier_version is null
    or char_length(p_classifier_version) not between 1 and 100 then
    raise exception 'invalid discovery provider versions';
  end if;

  select true
    into version_matches
    from public.explore_discovery_refresh_state as state
   where state.scope = 'public_explore'
     and state.lease_id = p_lease_id
     and state.lease_expires_at >= now()
     and state.target_semantic_version = p_semantic_version
     and state.target_classifier_version = p_classifier_version
   for update;

  if version_matches is distinct from true then
    raise exception 'stale discovery provider configuration';
  end if;

  return public.publish_explore_discovery_generation(
    p_lease_id,
    p_generation_id,
    p_items,
    p_watermark_entry_id,
    p_watermark_changed_at,
    p_watermark_changed_entry_id,
    p_watermark_changed_scan_cutoff,
    p_generated_at,
    p_expires_at
  );
end;
$$;

revoke all on function public.publish_explore_discovery_generation(uuid, uuid, jsonb, text, text, bigint, timestamptz, bigint, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.publish_explore_discovery_generation(uuid, uuid, jsonb, text, text, bigint, timestamptz, bigint, timestamptz, timestamptz, timestamptz) to service_role;
