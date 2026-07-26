-- Deployment-scoped derived intelligence for the public Explore collector.
-- Miniflux remains authoritative for article content and all reader state.

create table public.explore_article_enrichments (
  id                    uuid primary key default gen_random_uuid(),
  collector_entry_id    bigint not null check (collector_entry_id > 0),
  collector_entry_ref   text not null check (char_length(collector_entry_ref) between 1 and 2048),
  content_hash          text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  canonical_url         text check (canonical_url is null or char_length(canonical_url) between 1 and 2048),
  title                 text not null check (char_length(title) between 1 and 1000),
  source_ref            text not null check (char_length(source_ref) between 1 and 2048),
  source_title          text not null check (char_length(source_title) between 1 and 500),
  category_ref          text check (category_ref is null or char_length(category_ref) between 1 and 2048),
  published_at          timestamptz,
  changed_at            timestamptz,

  processing_status     text not null default 'pending' check (
                          processing_status in ('pending', 'enriched', 'skipped', 'failed')
                        ),
  semantic_version      text not null check (char_length(semantic_version) between 1 and 100),
  semantic_payload      jsonb check (
                          semantic_payload is null
                          or (
                            jsonb_typeof(semantic_payload) = 'object'
                            and octet_length(semantic_payload::text) <= 65536
                          )
                        ),
  semantic_provider     text check (semantic_provider is null or char_length(semantic_provider) <= 32),
  semantic_model        text check (semantic_model is null or char_length(semantic_model) <= 200),
  input_tokens          integer check (input_tokens is null or input_tokens >= 0),
  output_tokens         integer check (output_tokens is null or output_tokens >= 0),

  failure_code          text check (failure_code is null or char_length(failure_code) <= 64),
  retry_count           integer not null default 0 check (retry_count between 0 and 10),
  retry_after           timestamptz,
  processed_at          timestamptz,
  expires_at            timestamptz not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  check (expires_at > created_at),
  unique (collector_entry_id),
  unique (collector_entry_ref)
);

create index explore_article_enrichments_reuse_idx
  on public.explore_article_enrichments (content_hash, semantic_version, processing_status);
create index explore_article_enrichments_processing_retry_idx
  on public.explore_article_enrichments (processing_status, retry_after);
create index explore_article_enrichments_changed_idx
  on public.explore_article_enrichments (changed_at desc, collector_entry_id desc);
create index explore_article_enrichments_expires_idx
  on public.explore_article_enrichments (expires_at);

create table public.explore_article_deal_classifications (
  id                    uuid primary key default gen_random_uuid(),
  enrichment_id         uuid not null references public.explore_article_enrichments(id) on delete cascade,
  content_hash          text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  classification_status text not null default 'pending' check (
                          classification_status in ('pending', 'classified', 'skipped', 'failed')
                        ),
  classifier_version    text not null check (char_length(classifier_version) between 1 and 100),
  classification_payload jsonb check (
                          classification_payload is null
                          or (
                            jsonb_typeof(classification_payload) = 'object'
                            and octet_length(classification_payload::text) <= 32768
                          )
                        ),
  classifier_provider   text check (classifier_provider is null or char_length(classifier_provider) <= 32),
  classifier_model      text check (classifier_model is null or char_length(classifier_model) <= 200),
  input_tokens          integer check (input_tokens is null or input_tokens >= 0),
  output_tokens         integer check (output_tokens is null or output_tokens >= 0),
  failure_code          text check (failure_code is null or char_length(failure_code) <= 64),
  retry_count           integer not null default 0 check (retry_count between 0 and 10),
  retry_after           timestamptz,
  classified_at         timestamptz,
  expires_at            timestamptz not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  check (expires_at > created_at),
  unique (enrichment_id, classifier_version)
);

create index explore_article_deal_classifications_reuse_idx
  on public.explore_article_deal_classifications (content_hash, classifier_version, classification_status);
create index explore_article_deal_classifications_retry_idx
  on public.explore_article_deal_classifications (classification_status, retry_after);
create index explore_article_deal_classifications_expires_idx
  on public.explore_article_deal_classifications (expires_at);

create table public.explore_discovery_items (
  id                    uuid primary key default gen_random_uuid(),
  generation_id         uuid not null,
  kind                  text not null check (kind in ('trending', 'deal_signal')),
  result_key            text not null check (char_length(result_key) between 1 and 300),
  title                 text not null check (char_length(title) between 1 and 1000),
  summary               text not null default '' check (char_length(summary) <= 4000),
  score                 double precision not null check (score >= 0 and score <= 100),
  source_entry_refs     jsonb not null check (
                          jsonb_typeof(source_entry_refs) = 'array'
                          and jsonb_array_length(source_entry_refs) between 1 and 100
                          and octet_length(source_entry_refs::text) <= 65536
                        ),
  evidence_json         jsonb not null default '[]'::jsonb check (
                          jsonb_typeof(evidence_json) = 'array'
                          and jsonb_array_length(evidence_json) <= 12
                          and octet_length(evidence_json::text) <= 16384
                        ),
  metadata_json         jsonb not null default '{}'::jsonb check (
                          jsonb_typeof(metadata_json) = 'object'
                          and octet_length(metadata_json::text) <= 65536
                        ),
  strategy_version      text not null check (char_length(strategy_version) between 1 and 100),
  generated_at          timestamptz not null,
  updated_at            timestamptz not null default now(),
  expires_at            timestamptz not null,

  check (expires_at > generated_at),
  unique (generation_id, kind, result_key, strategy_version)
);

create index explore_discovery_items_generation_kind_score_idx
  on public.explore_discovery_items (generation_id, kind, score desc, result_key);
create index explore_discovery_items_expires_idx
  on public.explore_discovery_items (expires_at);

create table public.explore_discovery_refresh_state (
  scope                   text primary key default 'public_explore' check (scope = 'public_explore'),
  lease_id                uuid,
  lease_expires_at        timestamptz,
  watermark_entry_id      bigint not null default 0 check (watermark_entry_id >= 0),
  watermark_changed_at    timestamptz,
  watermark_changed_entry_id bigint not null default 0 check (watermark_changed_entry_id >= 0),
  watermark_changed_scan_cutoff timestamptz,
  target_semantic_version text check (target_semantic_version is null or char_length(target_semantic_version) between 1 and 100),
  target_classifier_version text check (target_classifier_version is null or char_length(target_classifier_version) between 1 and 100),
  active_generation_id    uuid,
  last_attempt_at         timestamptz,
  last_success_at         timestamptz,
  last_error_code         text check (last_error_code is null or char_length(last_error_code) <= 64),
  updated_at              timestamptz not null default now(),

  check (
    (lease_id is null and lease_expires_at is null)
    or (lease_id is not null and lease_expires_at is not null)
  ),
  check (
    (watermark_changed_entry_id = 0 and watermark_changed_scan_cutoff is null)
    or (watermark_changed_entry_id > 0 and watermark_changed_scan_cutoff is not null)
  )
);

insert into public.explore_discovery_refresh_state (scope)
values ('public_explore')
on conflict (scope) do nothing;

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
       set lease_id = p_lease_id,
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

create or replace function public.finish_explore_discovery_refresh(
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
  if p_lease_id is null
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
   where scope = 'public_explore'
     and lease_id = p_lease_id
     and lease_expires_at >= now();

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;

create or replace function public.publish_explore_discovery_generation(
  p_lease_id uuid,
  p_generation_id uuid,
  p_items jsonb,
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
  lease_matches boolean;
begin
  if p_lease_id is null
    or p_generation_id is null
    or p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) > 500
    or octet_length(p_items::text) > 1048576
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
    into lease_matches
    from public.explore_discovery_refresh_state as state
   where state.scope = 'public_explore'
     and state.lease_id = p_lease_id
     and state.lease_expires_at >= now()
   for update;

  if lease_matches is distinct from true then
    raise exception 'discovery refresh lease lost';
  end if;

  insert into public.explore_discovery_items (
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
  select p_generation_id,
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
  on conflict (generation_id, kind, result_key, strategy_version) do nothing;

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
   where state.scope = 'public_explore'
     and state.lease_id = p_lease_id;

  if not found then
    raise exception 'discovery refresh lease lost';
  end if;

  return inserted_count;
end;
$$;

alter table public.explore_article_enrichments enable row level security;
alter table public.explore_article_deal_classifications enable row level security;
alter table public.explore_discovery_items enable row level security;
alter table public.explore_discovery_refresh_state enable row level security;

revoke all on table public.explore_article_enrichments from anon, authenticated;
revoke all on table public.explore_article_deal_classifications from anon, authenticated;
revoke all on table public.explore_discovery_items from anon, authenticated;
revoke all on table public.explore_discovery_refresh_state from anon, authenticated;

grant select, insert, update, delete on table public.explore_article_enrichments to service_role;
grant select, insert, update, delete on table public.explore_article_deal_classifications to service_role;
grant select, insert, update, delete on table public.explore_discovery_items to service_role;
grant select, insert, update, delete on table public.explore_discovery_refresh_state to service_role;

revoke all on function public.claim_explore_discovery_refresh(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.finish_explore_discovery_refresh(uuid, bigint, timestamptz, bigint, timestamptz, text) from public, anon, authenticated;
revoke all on function public.publish_explore_discovery_generation(uuid, uuid, jsonb, bigint, timestamptz, bigint, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.claim_explore_discovery_refresh(uuid, integer, text, text) to service_role;
grant execute on function public.finish_explore_discovery_refresh(uuid, bigint, timestamptz, bigint, timestamptz, text) to service_role;
grant execute on function public.publish_explore_discovery_generation(uuid, uuid, jsonb, bigint, timestamptz, bigint, timestamptz, timestamptz, timestamptz) to service_role;

comment on table public.explore_article_enrichments is
  'Bounded, versioned semantic derivatives for public Explore entries; full article bodies remain in Miniflux.';
comment on table public.explore_article_deal_classifications is
  'Independent, bounded, versioned Deal Signal classifications for public Explore enrichments.';
comment on table public.explore_discovery_items is
  'Immutable generation rows for public Trending and evidence-gated Deal Signals.';
comment on table public.explore_discovery_refresh_state is
  'Singleton fenced lease, watermarks, and active generation for public Explore discovery.';
