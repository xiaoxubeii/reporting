-- Minimal expert-validation loop for Diligence.
-- The application is the only supported access surface: both tables keep RLS
-- enabled and authenticated clients receive no table privileges. Internal APIs
-- use the service role after applying the existing Diligence access gate.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- Expert responses reuse the existing Diligence document/Ingest pipeline.
alter table public.diligence_documents
  drop constraint if exists diligence_documents_source_kind_check;
alter table public.diligence_documents
  add constraint diligence_documents_source_kind_check
  check (source_kind in ('upload', 'google_drive', 'affinity', 'email', 'industry_expert'));

create unique index if not exists diligence_deals_id_fund_unique
  on public.diligence_deals (id, fund_id);
create unique index if not exists diligence_documents_id_deal_fund_unique
  on public.diligence_documents (id, deal_id, fund_id);
create unique index if not exists memo_agent_jobs_active_dedupe_unique
  on public.memo_agent_jobs ((payload->>'dedupe_key'))
  where status in ('pending', 'running') and payload ? 'dedupe_key';

create or replace function public.enqueue_ingest_if_deal_idle(
  p_fund_id uuid,
  p_deal_id uuid,
  p_document_ids uuid[],
  p_enqueued_by uuid default null,
  p_dedupe_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_payload jsonb;
begin
  -- Serializes only external enqueue decisions for the same Deal. Worker
  -- continuation/follow-up inserts remain unchanged and can coexist.
  perform pg_advisory_xact_lock(hashtextextended(p_deal_id::text, 0));

  if not exists (
    select 1 from public.diligence_deals d where d.id = p_deal_id and d.fund_id = p_fund_id
  ) then
    raise exception 'diligence deal not found';
  end if;

  if exists (
    select 1 from public.memo_agent_jobs j
    where j.deal_id = p_deal_id and j.fund_id = p_fund_id
      and j.status in ('pending', 'running')
  ) then
    return jsonb_build_object('enqueued', false, 'reason', 'another agent job is already running on this deal');
  end if;

  v_payload := jsonb_build_object('document_ids', to_jsonb(p_document_ids));
  if p_dedupe_key is not null then
    v_payload := v_payload || jsonb_build_object('dedupe_key', p_dedupe_key);
  end if;

  insert into public.memo_agent_jobs (fund_id, deal_id, kind, payload, enqueued_by)
  values (p_fund_id, p_deal_id, 'ingest', v_payload, p_enqueued_by)
  returning id into v_job_id;

  return jsonb_build_object('enqueued', true, 'job_id', v_job_id);
end;
$$;

revoke all on function public.enqueue_ingest_if_deal_idle(uuid, uuid, uuid[], uuid, text) from public, anon, authenticated;
grant execute on function public.enqueue_ingest_if_deal_idle(uuid, uuid, uuid[], uuid, text) to service_role;

create table public.experts (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'fund')),
  fund_id uuid references public.funds(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  email text not null check (char_length(btrim(email)) between 3 and 320),
  title text check (title is null or char_length(title) <= 200),
  organization text check (organization is null or char_length(organization) <= 240),
  profile_text text not null check (char_length(btrim(profile_text)) between 1 and 6000),
  status text not null default 'active' check (status in ('active', 'inactive')),
  embedding extensions.vector(1536),
  embedding_model text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experts_scope_fund_check check (
    (scope = 'global' and fund_id is null)
    or (scope = 'fund' and fund_id is not null)
  ),
  constraint experts_embedding_model_check check (
    (embedding is null and embedding_model is null)
    or (embedding is not null and embedding_model is not null)
  )
);

create unique index experts_global_email_unique
  on public.experts (lower(email)) where scope = 'global';
create unique index experts_fund_email_unique
  on public.experts (fund_id, lower(email)) where scope = 'fund';
create index experts_eligibility_idx
  on public.experts (scope, fund_id, status);
create index experts_name_search_idx
  on public.experts (lower(name));

create trigger experts_set_updated_at
  before update on public.experts
  for each row execute function public.set_updated_at();

alter table public.experts enable row level security;
revoke all on table public.experts from anon, authenticated;
grant all on table public.experts to service_role;

create table public.diligence_expert_requests (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id) on delete cascade,
  deal_id uuid not null references public.diligence_deals(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  source_kind text not null check (source_kind in ('research_gap', 'contradiction')),
  source_ref jsonb not null check (octet_length(source_ref::text) <= 30000),
  question text not null check (char_length(btrim(question)) between 1 and 4000),
  expert_profile text not null check (char_length(btrim(expert_profile)) between 1 and 6000),
  context_snapshot text not null check (char_length(btrim(context_snapshot)) between 1 and 12000),
  expert_id uuid references public.experts(id) on delete set null,
  selection_method text check (selection_method is null or selection_method in ('manual', 'auto_match')),
  expert_name text check (expert_name is null or char_length(btrim(expert_name)) between 1 and 160),
  expert_email text check (expert_email is null or char_length(btrim(expert_email)) between 3 and 320),
  expert_snapshot jsonb check (expert_snapshot is null or octet_length(expert_snapshot::text) <= 12000),
  token_hash text check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz,
  invited_at timestamptz,
  email_provider_accepted_at timestamptz,
  email_message_id text check (email_message_id is null or char_length(email_message_id) <= 500),
  email_error_code text check (email_error_code is null or char_length(email_error_code) <= 100),
  email_error_message text check (email_error_message is null or char_length(email_error_message) <= 500),
  response_markdown text check (response_markdown is null or char_length(response_markdown) between 1 and 50000),
  submitted_at timestamptz,
  document_id uuid references public.diligence_documents(id) on delete set null,
  materialization_error text check (materialization_error is null or char_length(materialization_error) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'invited', 'submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diligence_expert_request_source_ref_check check (
    jsonb_typeof(source_ref) = 'object'
    and source_ref ? 'draftId'
    and source_ref ? 'kind'
    and source_ref ? 'index'
    and source_ref ? 'snapshot'
  ),
  constraint diligence_expert_request_selection_check check (
    (expert_id is null and selection_method is null and expert_name is null and expert_email is null and expert_snapshot is null)
    or (expert_id is not null and selection_method is not null and expert_name is not null and expert_email is not null and expert_snapshot is not null)
  ),
  constraint diligence_expert_request_lifecycle_check check (
    (
      status = 'draft'
      and token_hash is null and expires_at is null and invited_at is null
      and response_markdown is null and submitted_at is null
      and email_provider_accepted_at is null and email_message_id is null
      and email_error_code is null and email_error_message is null
    )
    or (
      status = 'invited'
      and expert_id is not null
      and token_hash is not null and expires_at is not null and invited_at is not null
      and response_markdown is null and submitted_at is null
    )
    or (
      status = 'submitted'
      and expert_id is not null
      and token_hash is not null and expires_at is not null and invited_at is not null
      and response_markdown is not null and submitted_at is not null
    )
  ),
  constraint diligence_expert_request_deal_scope_fkey
    foreign key (deal_id, fund_id) references public.diligence_deals(id, fund_id) on delete cascade,
  constraint diligence_expert_request_document_scope_fkey
    foreign key (document_id, deal_id, fund_id) references public.diligence_documents(id, deal_id, fund_id)
    on delete set null (document_id)
);

create unique index diligence_expert_requests_token_hash_unique
  on public.diligence_expert_requests (token_hash) where token_hash is not null;
create unique index diligence_expert_requests_document_unique
  on public.diligence_expert_requests (document_id) where document_id is not null;
create index diligence_expert_requests_deal_idx
  on public.diligence_expert_requests (deal_id, created_at desc);
create index diligence_expert_requests_fund_idx
  on public.diligence_expert_requests (fund_id, created_at desc);
create index diligence_expert_requests_status_idx
  on public.diligence_expert_requests (deal_id, status);

create trigger diligence_expert_requests_set_updated_at
  before update on public.diligence_expert_requests
  for each row execute function public.set_updated_at();

create or replace function public.guard_diligence_expert_request_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.expert_id is not null and not exists (
    select 1 from public.experts e
    where e.id = new.expert_id
      and (e.scope = 'global' or (e.scope = 'fund' and e.fund_id = new.fund_id))
  ) then
    raise exception 'selected expert is outside the request fund scope';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.fund_id is distinct from old.fund_id or new.deal_id is distinct from old.deal_id then
    raise exception 'expert request tenant scope is immutable';
  end if;

  if (old.status = 'draft' and new.status not in ('draft', 'invited'))
    or (old.status = 'invited' and new.status not in ('invited', 'submitted'))
    or (old.status = 'submitted' and new.status <> 'submitted') then
    raise exception 'invalid expert request state transition';
  end if;

  if old.status in ('invited', 'submitted') then
    if new.source_kind is distinct from old.source_kind
      or new.source_ref is distinct from old.source_ref
      or new.question is distinct from old.question
      or new.expert_profile is distinct from old.expert_profile
      or new.context_snapshot is distinct from old.context_snapshot
      or new.expert_id is distinct from old.expert_id
      or new.expert_name is distinct from old.expert_name
      or new.expert_email is distinct from old.expert_email
      or new.expert_snapshot is distinct from old.expert_snapshot then
      raise exception 'invited expert request snapshots are immutable';
    end if;
  end if;

  if old.status = 'submitted' and (
    new.token_hash is distinct from old.token_hash
    or new.expires_at is distinct from old.expires_at
    or new.invited_at is distinct from old.invited_at
  ) then
    raise exception 'submitted expert request credential is immutable';
  end if;

  if old.response_markdown is not null
    and (new.response_markdown is distinct from old.response_markdown
      or new.submitted_at is distinct from old.submitted_at) then
    raise exception 'submitted expert response is immutable';
  end if;

  if old.document_id is not null and new.document_id is not null
    and new.document_id is distinct from old.document_id then
    raise exception 'materialized expert document link is immutable';
  end if;

  return new;
end;
$$;

create trigger diligence_expert_requests_guard_write
  before insert or update on public.diligence_expert_requests
  for each row execute function public.guard_diligence_expert_request_write();

alter table public.diligence_expert_requests enable row level security;

create policy diligence_expert_requests_select_fund
  on public.diligence_expert_requests for select
  using (fund_id = any(public.get_my_fund_ids()));
create policy diligence_expert_requests_insert_fund
  on public.diligence_expert_requests for insert
  with check (fund_id = any(public.get_my_fund_ids()));
create policy diligence_expert_requests_update_fund
  on public.diligence_expert_requests for update
  using (fund_id = any(public.get_my_fund_ids()))
  with check (fund_id = any(public.get_my_fund_ids()));

revoke all on table public.diligence_expert_requests from anon, authenticated;
grant all on table public.diligence_expert_requests to service_role;

create or replace function public.match_experts(
  p_fund_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 5
)
returns table (
  id uuid,
  scope text,
  name text,
  title text,
  organization text,
  profile_text text,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    e.id,
    e.scope,
    e.name,
    e.title,
    e.organization,
    e.profile_text,
    1 - (e.embedding <=> p_query_embedding) as similarity
  from public.experts e
  where e.status = 'active'
    and nullif(btrim(e.email), '') is not null
    and e.embedding is not null
    and (e.scope = 'global' or e.fund_id = p_fund_id)
  order by e.embedding <=> p_query_embedding, e.id
  limit least(greatest(coalesce(p_match_count, 5), 1), 5);
$$;

revoke all on function public.match_experts(uuid, extensions.vector, integer) from public, anon, authenticated;
grant execute on function public.match_experts(uuid, extensions.vector, integer) to service_role;

comment on table public.experts is 'Server-mediated global and fund-private expert directory.';
comment on table public.diligence_expert_requests is 'One question, one selected expert, one invitation and immutable response lifecycle.';
