-- Provider-derived Discovery state belongs to the fund whose execution context
-- paid for and configured the AI work. Existing deployment-global derivatives
-- have no trustworthy fund provenance, so discard only these rebuildable rows.
begin;

-- Block legacy workers before deleting deployment-global rows. Without this
-- lock, an old worker could insert a row without fund provenance between the
-- cleanup and the NOT NULL schema change.
lock table public.explore_article_enrichments,
  public.explore_article_deal_classifications,
  public.explore_discovery_items,
  public.explore_discovery_refresh_state
  in access exclusive mode;

delete from public.explore_article_deal_classifications;
delete from public.explore_discovery_items;
delete from public.explore_article_enrichments;
delete from public.explore_discovery_refresh_state;

-- Remove every deployment-global SECURITY DEFINER entrypoint before replacing
-- it. A new parameter list creates an overload; it does not replace the old one.
drop function if exists public.claim_explore_discovery_refresh(uuid, integer, text, text);
drop function if exists public.finish_explore_discovery_refresh(uuid, bigint, timestamptz, bigint, timestamptz, text);
drop function if exists public.publish_explore_discovery_generation(uuid, uuid, jsonb, bigint, timestamptz, bigint, timestamptz, timestamptz, timestamptz);
drop function if exists public.publish_explore_discovery_generation(uuid, uuid, jsonb, text, text, bigint, timestamptz, bigint, timestamptz, timestamptz, timestamptz);

alter table public.explore_article_enrichments
  drop constraint explore_article_enrichments_collector_entry_id_key,
  drop constraint explore_article_enrichments_collector_entry_ref_key,
  add column fund_id uuid not null references public.funds(id) on delete cascade,
  add constraint explore_article_enrichments_fund_entry_id_key
    unique (fund_id, collector_entry_id),
  add constraint explore_article_enrichments_fund_entry_ref_key
    unique (fund_id, collector_entry_ref),
  add constraint explore_article_enrichments_fund_row_key
    unique (fund_id, id);

do $$
declare
  constraint_name text;
begin
  select constraint_row.conname
    into constraint_name
    from pg_catalog.pg_constraint as constraint_row
   where constraint_row.conrelid = 'public.explore_article_deal_classifications'::regclass
     and constraint_row.contype = 'u'
     and pg_catalog.pg_get_constraintdef(constraint_row.oid)
       = 'UNIQUE (enrichment_id, classifier_version)';
  if constraint_name is not null then
    execute format(
      'alter table public.explore_article_deal_classifications drop constraint %I',
      constraint_name
    );
  end if;

  select constraint_row.conname
    into constraint_name
    from pg_catalog.pg_constraint as constraint_row
   where constraint_row.conrelid = 'public.explore_article_deal_classifications'::regclass
     and constraint_row.contype = 'f'
     and pg_catalog.pg_get_constraintdef(constraint_row.oid)
       like 'FOREIGN KEY (enrichment_id) REFERENCES explore_article_enrichments(id)%';
  if constraint_name is not null then
    execute format(
      'alter table public.explore_article_deal_classifications drop constraint %I',
      constraint_name
    );
  end if;
end;
$$;

alter table public.explore_article_deal_classifications
  add column fund_id uuid not null,
  add constraint explore_article_deal_classifications_fund_id_fkey
    foreign key (fund_id) references public.funds(id) on delete cascade,
  add constraint explore_article_deal_classifications_fund_enrichment_fkey
    foreign key (fund_id, enrichment_id)
    references public.explore_article_enrichments (fund_id, id)
    on delete cascade,
  add constraint explore_article_deal_classifications_fund_enrichment_version_key
    unique (fund_id, enrichment_id, classifier_version);

do $$
declare
  constraint_name text;
begin
  select constraint_row.conname
    into constraint_name
    from pg_catalog.pg_constraint as constraint_row
   where constraint_row.conrelid = 'public.explore_discovery_items'::regclass
     and constraint_row.contype = 'u'
     and pg_catalog.pg_get_constraintdef(constraint_row.oid)
       = 'UNIQUE (generation_id, kind, result_key, strategy_version)';
  if constraint_name is not null then
    execute format(
      'alter table public.explore_discovery_items drop constraint %I',
      constraint_name
    );
  end if;
end;
$$;

alter table public.explore_discovery_items
  add column fund_id uuid not null references public.funds(id) on delete cascade,
  add constraint explore_discovery_items_fund_generation_result_key
    unique (fund_id, generation_id, kind, result_key, strategy_version);

alter table public.explore_discovery_refresh_state
  drop constraint explore_discovery_refresh_state_pkey,
  add column fund_id uuid not null references public.funds(id) on delete cascade,
  add constraint explore_discovery_refresh_state_pkey
    primary key (fund_id, scope);

drop index public.explore_article_enrichments_reuse_idx;
drop index public.explore_article_enrichments_processing_retry_idx;
drop index public.explore_article_enrichments_changed_idx;
drop index public.explore_article_enrichments_expires_idx;
create index explore_article_enrichments_reuse_idx
  on public.explore_article_enrichments (fund_id, content_hash, semantic_version, processing_status);
create index explore_article_enrichments_processing_retry_idx
  on public.explore_article_enrichments (fund_id, processing_status, retry_after);
create index explore_article_enrichments_changed_idx
  on public.explore_article_enrichments (fund_id, changed_at desc, collector_entry_id desc);
create index explore_article_enrichments_expires_idx
  on public.explore_article_enrichments (fund_id, expires_at);

drop index public.explore_article_deal_classifications_reuse_idx;
drop index public.explore_article_deal_classifications_retry_idx;
drop index public.explore_article_deal_classifications_expires_idx;
create index explore_article_deal_classifications_reuse_idx
  on public.explore_article_deal_classifications (fund_id, content_hash, classifier_version, classification_status);
create index explore_article_deal_classifications_retry_idx
  on public.explore_article_deal_classifications (fund_id, classification_status, retry_after);
create index explore_article_deal_classifications_expires_idx
  on public.explore_article_deal_classifications (fund_id, expires_at);

drop index public.explore_discovery_items_generation_kind_score_idx;
drop index public.explore_discovery_items_expires_idx;
create index explore_discovery_items_generation_kind_score_idx
  on public.explore_discovery_items (fund_id, generation_id, kind, score desc, result_key);
create index explore_discovery_items_expires_idx
  on public.explore_discovery_items (fund_id, expires_at);

create function public.claim_explore_discovery_refresh(
  p_fund_id uuid,
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
  if p_fund_id is null
    or p_lease_id is null
    or p_lease_seconds not between 30 and 3600
    or p_semantic_version is null
    or char_length(p_semantic_version) not between 1 and 100
    or p_classifier_version is null
    or char_length(p_classifier_version) not between 1 and 100 then
    raise exception 'invalid discovery refresh claim';
  end if;

  insert into public.explore_discovery_refresh_state (fund_id, scope)
  values (p_fund_id, 'public_explore')
  on conflict (fund_id, scope) do nothing;

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
     where state.fund_id = p_fund_id
       and state.scope = 'public_explore'
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
   where state.fund_id = p_fund_id
     and state.scope = 'public_explore'
     and not exists (select 1 from claimed);
end;
$$;

create function public.finish_explore_discovery_refresh(
  p_fund_id uuid,
  p_lease_id uuid,
  p_watermark_entry_id bigint,
  p_watermark_changed_at timestamptz,
  p_watermark_changed_entry_id bigint,
  p_watermark_changed_scan_cutoff timestamptz,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  if p_fund_id is null
    or p_lease_id is null
    or p_watermark_entry_id < 0
    or p_watermark_changed_entry_id is null
    or p_watermark_changed_entry_id < 0
    or (p_watermark_changed_entry_id = 0 and p_watermark_changed_scan_cutoff is not null)
    or (p_watermark_changed_entry_id > 0 and p_watermark_changed_scan_cutoff is null)
    or (p_error_code is not null and char_length(p_error_code) > 64) then
    raise exception 'invalid discovery refresh finish';
  end if;

  update public.explore_discovery_refresh_state as state
     set watermark_entry_id = greatest(state.watermark_entry_id, p_watermark_entry_id),
         watermark_changed_at = case
           when p_watermark_changed_at is null then state.watermark_changed_at
           when state.watermark_changed_at is null then p_watermark_changed_at
           else greatest(state.watermark_changed_at, p_watermark_changed_at)
         end,
         watermark_changed_entry_id = p_watermark_changed_entry_id,
         watermark_changed_scan_cutoff = p_watermark_changed_scan_cutoff,
         last_error_code = p_error_code,
         lease_id = null,
         lease_expires_at = null,
         updated_at = now()
   where state.fund_id = p_fund_id
     and state.scope = 'public_explore'
     and state.lease_id = p_lease_id
     and state.lease_expires_at >= now();

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;

create function public.publish_explore_discovery_generation(
  p_fund_id uuid,
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
  inserted_count integer;
  version_matches boolean;
begin
  if p_fund_id is null
    or p_lease_id is null
    or p_generation_id is null
    or p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) > 500
    or octet_length(p_items::text) > 1048576
    or p_semantic_version is null
    or char_length(p_semantic_version) not between 1 and 100
    or p_classifier_version is null
    or char_length(p_classifier_version) not between 1 and 100
    or p_watermark_entry_id < 0
    or p_watermark_changed_entry_id is null
    or p_watermark_changed_entry_id < 0
    or (p_watermark_changed_entry_id = 0 and p_watermark_changed_scan_cutoff is not null)
    or (p_watermark_changed_entry_id > 0 and p_watermark_changed_scan_cutoff is null)
    or p_generated_at is null
    or p_expires_at <= p_generated_at then
    raise exception 'invalid discovery generation';
  end if;

  select true
    into version_matches
    from public.explore_discovery_refresh_state as state
   where state.fund_id = p_fund_id
     and state.scope = 'public_explore'
     and state.lease_id = p_lease_id
     and state.lease_expires_at >= now()
     and state.target_semantic_version = p_semantic_version
     and state.target_classifier_version = p_classifier_version
   for update;

  if version_matches is distinct from true then
    raise exception 'stale discovery provider configuration';
  end if;

  insert into public.explore_discovery_items (
    fund_id,
    generation_id,
    kind,
    result_key,
    title,
    summary,
    score,
    source_entry_refs,
    evidence_json,
    metadata_json,
    strategy_version,
    generated_at,
    expires_at
  )
  select p_fund_id,
         p_generation_id,
         item.kind,
         item.result_key,
         item.title,
         coalesce(item.summary, ''),
         item.score,
         item.source_entry_refs,
         coalesce(item.evidence_json, '[]'::jsonb),
         coalesce(item.metadata_json, '{}'::jsonb),
         item.strategy_version,
         p_generated_at,
         p_expires_at
    from jsonb_to_recordset(p_items) as item(
      kind text,
      result_key text,
      title text,
      summary text,
      score double precision,
      source_entry_refs jsonb,
      evidence_json jsonb,
      metadata_json jsonb,
      strategy_version text
    )
  on conflict (fund_id, generation_id, kind, result_key, strategy_version) do nothing;

  get diagnostics inserted_count = row_count;

  update public.explore_discovery_refresh_state as state
     set active_generation_id = p_generation_id,
         watermark_entry_id = greatest(state.watermark_entry_id, p_watermark_entry_id),
         watermark_changed_at = case
           when p_watermark_changed_at is null then state.watermark_changed_at
           when state.watermark_changed_at is null then p_watermark_changed_at
           else greatest(state.watermark_changed_at, p_watermark_changed_at)
         end,
         watermark_changed_entry_id = p_watermark_changed_entry_id,
         watermark_changed_scan_cutoff = p_watermark_changed_scan_cutoff,
         last_success_at = p_generated_at,
         last_error_code = null,
         lease_id = null,
         lease_expires_at = null,
         updated_at = now()
   where state.fund_id = p_fund_id
     and state.scope = 'public_explore'
     and state.lease_id = p_lease_id;

  if not found then
    raise exception 'discovery refresh lease lost';
  end if;

  return inserted_count;
end;
$$;

-- RLS remains enabled from the base migration. Data API roles stay denied and
-- only reviewed server-side service-role paths can use fund-scoped persistence.
revoke all on table public.explore_article_enrichments from anon, authenticated;
revoke all on table public.explore_article_deal_classifications from anon, authenticated;
revoke all on table public.explore_discovery_items from anon, authenticated;
revoke all on table public.explore_discovery_refresh_state from anon, authenticated;

grant select, insert, update, delete on table public.explore_article_enrichments to service_role;
grant select, insert, update, delete on table public.explore_article_deal_classifications to service_role;
grant select, insert, update, delete on table public.explore_discovery_items to service_role;
grant select, insert, update, delete on table public.explore_discovery_refresh_state to service_role;

revoke all on function public.claim_explore_discovery_refresh(uuid, uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.finish_explore_discovery_refresh(uuid, uuid, bigint, timestamptz, bigint, timestamptz, text) from public, anon, authenticated;
revoke all on function public.publish_explore_discovery_generation(uuid, uuid, uuid, jsonb, text, text, bigint, timestamptz, bigint, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.claim_explore_discovery_refresh(uuid, uuid, integer, text, text) to service_role;
grant execute on function public.finish_explore_discovery_refresh(uuid, uuid, bigint, timestamptz, bigint, timestamptz, text) to service_role;
grant execute on function public.publish_explore_discovery_generation(uuid, uuid, uuid, jsonb, text, text, bigint, timestamptz, bigint, timestamptz, timestamptz, timestamptz) to service_role;

comment on table public.explore_discovery_refresh_state is
  'One fund-scoped fenced lease, watermarks, and active generation per public Explore collector.';

commit;
