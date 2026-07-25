-- Generic service-owned background jobs with attempt-fenced HTTP execution.

create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{0,63}$'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  fund_id uuid not null references public.funds(id) on delete cascade,
  actor_type text not null check (actor_type in ('user', 'system')),
  actor_user_id uuid references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 240),
  available_at timestamptz not null default now(),
  attempt_id uuid,
  lease_expires_at timestamptz,
  worker_claimed_attempt_id uuid,
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 20),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  lease_seconds integer not null default 300 check (lease_seconds between 30 and 1800),
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint background_jobs_actor_check check (
    (actor_type = 'user' and actor_user_id is not null)
    or (actor_type = 'system' and actor_user_id is null)
  ),
  constraint background_jobs_pending_attempt_check check (
    status <> 'pending' or (attempt_id is null and lease_expires_at is null)
  ),
  constraint background_jobs_running_attempt_check check (
    status <> 'running' or (attempt_id is not null and lease_expires_at is not null)
  )
);

create or replace function public.background_jobs_reject_immutable_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind is distinct from old.kind
    or new.payload is distinct from old.payload
    or new.fund_id is distinct from old.fund_id
    or new.actor_type is distinct from old.actor_type
    or new.actor_user_id is distinct from old.actor_user_id
    or new.dedupe_key is distinct from old.dedupe_key
    or new.max_attempts is distinct from old.max_attempts
    or new.lease_seconds is distinct from old.lease_seconds
  then
    raise exception using errcode = '22023', message = 'Background job immutable columns cannot change';
  end if;
  return new;
end;
$$;

create trigger background_jobs_immutable_columns
before update on public.background_jobs
for each row execute function public.background_jobs_reject_immutable_update();

create index background_jobs_due_idx
  on public.background_jobs (available_at, created_at)
  where status = 'pending';

create index background_jobs_lease_idx
  on public.background_jobs (lease_expires_at)
  where status = 'running';

create index background_jobs_fund_created_idx
  on public.background_jobs (fund_id, created_at desc);

create unique index background_jobs_active_dedupe_idx
  on public.background_jobs (kind, dedupe_key)
  where status in ('pending', 'running');

create table public.background_job_tool_calls (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.background_jobs(id) on delete cascade,
  attempt_id uuid not null,
  tool_name text not null check (tool_name ~ '^[a-z][a-z0-9_]{0,63}$'),
  tool_call_id text not null check (char_length(tool_call_id) between 1 and 200),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, attempt_id, tool_name, tool_call_id),
  check (response is null or octet_length(response::text) <= 131072)
);

create index background_job_tool_calls_attempt_idx
  on public.background_job_tool_calls (job_id, attempt_id, tool_name, created_at);

alter table public.background_jobs enable row level security;
alter table public.background_job_tool_calls enable row level security;
revoke all on public.background_jobs from public, anon, authenticated;
revoke all on public.background_job_tool_calls from public, anon, authenticated;
grant select, insert, update, delete on public.background_jobs to service_role;
grant select, insert, update, delete on public.background_job_tool_calls to service_role;

create or replace function public.background_job_enqueue(
  p_kind text,
  p_payload jsonb,
  p_fund_id uuid,
  p_actor_type text,
  p_actor_user_id uuid,
  p_dedupe_key text,
  p_max_attempts integer default 3,
  p_lease_seconds integer default 300,
  p_available_at timestamptz default now()
)
returns public.background_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.background_jobs;
begin
  if p_kind is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid background job';
  end if;

  insert into public.background_jobs (
    kind, payload, fund_id, actor_type, actor_user_id, dedupe_key,
    max_attempts, lease_seconds, available_at
  ) values (
    p_kind, p_payload, p_fund_id, p_actor_type, p_actor_user_id, p_dedupe_key,
    p_max_attempts, p_lease_seconds, coalesce(p_available_at, now())
  )
  on conflict (kind, dedupe_key) where status in ('pending', 'running')
  do nothing
  returning * into v_job;

  if v_job.id is null then
    select * into v_job
    from public.background_jobs
    where kind = p_kind
      and dedupe_key = p_dedupe_key
      and status in ('pending', 'running')
    order by created_at desc
    limit 1;
  end if;

  if v_job.id is null then
    raise exception using errcode = '40001', message = 'Active background job could not be resolved';
  end if;
  if v_job.fund_id is distinct from p_fund_id
    or v_job.actor_type is distinct from p_actor_type
    or v_job.actor_user_id is distinct from p_actor_user_id
    or v_job.payload is distinct from p_payload
    or v_job.max_attempts is distinct from p_max_attempts
    or v_job.lease_seconds is distinct from p_lease_seconds
  then
    raise exception using errcode = '23505', message = 'Active background job authority conflict';
  end if;

  return v_job;
end;
$$;

create or replace function public.background_job_enqueue_inserted_deal_research()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.research_status = 'pending' then
    perform public.background_job_enqueue(
      'deal_research',
      jsonb_build_object('dealId', new.id),
      new.fund_id,
      'system',
      null,
      'deal_research:' || new.id::text,
      3,
      300,
      now()
    );
  end if;
  return new;
end;
$$;

create trigger enqueue_inserted_deal_research
after insert on public.inbound_deals
for each row execute function public.background_job_enqueue_inserted_deal_research();

-- Domain projections belong in domain-owned hooks, not in the generic claim or
-- finalize lifecycle. This trigger keeps Deal Research UI state synchronized
-- when a leased attempt reaches a terminal failure before the worker can write.
create or replace function public.background_job_project_deal_research_failure()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.kind = 'deal_research'
    and new.status in ('failed', 'cancelled')
    and old.status is distinct from new.status
  then
    update public.inbound_deals as deals
    set research_status = 'failed',
        research_error = left(coalesce(nullif(new.last_error, ''), 'Background Research failed'), 500),
        researched_at = now()
    where deals.fund_id = new.fund_id
      and deals.id::text = new.payload->>'dealId'
      and deals.research_status in ('pending', 'running');
  end if;
  return new;
end;
$$;

create trigger background_job_project_deal_research_failure
after update of status on public.background_jobs
for each row execute function public.background_job_project_deal_research_failure();

revoke all on function public.background_job_project_deal_research_failure()
  from public, anon, authenticated;

create or replace function public.background_job_claim_due(
  p_kinds text[],
  p_limit integer default 5
)
returns setof public.background_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit < 1 or p_limit > 20 or coalesce(array_length(p_kinds, 1), 0) < 1 or array_length(p_kinds, 1) > 100 then
    raise exception using errcode = '22023', message = 'Invalid background job claim bounds';
  end if;

  update public.background_jobs
  set status = case when attempts >= max_attempts then 'failed' else 'pending' end,
      attempt_id = null,
      lease_expires_at = null,
      available_at = case
        when attempts >= max_attempts then available_at
        else now() + make_interval(secs => least(300, greatest(5, attempts * 15)))
      end,
      last_error = case
        when attempts >= max_attempts then 'Background job lease expired and retry limit was reached'
        else 'Background job lease expired before completion'
      end,
      updated_at = now()
  where kind = any(p_kinds)
    and status = 'running'
    and lease_expires_at <= now();

  return query
  with candidates as (
    select id
    from public.background_jobs
    where kind = any(p_kinds)
      and status = 'pending'
      and available_at <= now()
      and attempts < max_attempts
    order by available_at, created_at
    for update skip locked
    limit p_limit
  )
  update public.background_jobs as jobs
  set status = 'running',
      attempt_id = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => jobs.lease_seconds),
      attempts = jobs.attempts + 1,
      last_error = null,
      updated_at = now()
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
end;
$$;

create or replace function public.background_job_finalize(
  p_job_id uuid,
  p_attempt_id uuid,
  p_status text,
  p_error text default null,
  p_retry_after_seconds integer default 0
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  if p_status not in ('pending', 'completed', 'failed', 'cancelled') then
    raise exception using errcode = '22023', message = 'Invalid background job final status';
  end if;
  if p_retry_after_seconds < 0 or p_retry_after_seconds > 3600 then
    raise exception using errcode = '22023', message = 'Invalid retry delay';
  end if;

  update public.background_jobs
  set status = p_status,
      attempt_id = case when p_status = 'pending' then null else attempt_id end,
      lease_expires_at = case when p_status = 'pending' then null else lease_expires_at end,
      available_at = case
        when p_status = 'pending' then now() + make_interval(secs => p_retry_after_seconds)
        else available_at
      end,
      last_error = left(nullif(p_error, ''), 2000),
      updated_at = now()
  where id = p_job_id
    and attempt_id = p_attempt_id
    and status = 'running'
    and lease_expires_at > now();

  get diagnostics v_updated_count = row_count;
  if v_updated_count = 0 and p_status = 'completed' and exists (
    select 1 from public.background_jobs
    where id = p_job_id
      and attempt_id = p_attempt_id
      and status = 'completed'
  ) then
    return true;
  end if;
  return v_updated_count > 0;
end;
$$;

create or replace function public.background_job_claim_worker_attempt(
  p_job_id uuid,
  p_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  update public.background_jobs
  set worker_claimed_attempt_id = p_attempt_id,
      updated_at = now()
  where id = p_job_id
    and attempt_id = p_attempt_id
    and status = 'running'
    and lease_expires_at > now()
    and worker_claimed_attempt_id is distinct from p_attempt_id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

create or replace function public.background_job_claim_tool_call(
  p_job_id uuid,
  p_attempt_id uuid,
  p_tool_name text,
  p_tool_call_id text,
  p_request_hash text,
  p_max_calls integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.background_job_tool_calls;
  v_count integer;
begin
  if p_max_calls < 1 or p_max_calls > 10 then
    raise exception using errcode = '22023', message = 'Invalid tool call budget';
  end if;

  perform 1 from public.background_jobs
  where id = p_job_id
    and attempt_id = p_attempt_id
    and status = 'running'
    and lease_expires_at > now()
  for update;
  if not found then return jsonb_build_object('state', 'inactive'); end if;

  select * into v_existing
  from public.background_job_tool_calls
  where job_id = p_job_id
    and attempt_id = p_attempt_id
    and tool_name = p_tool_name
    and tool_call_id = p_tool_call_id;

  if v_existing.id is not null then
    if v_existing.request_hash = p_request_hash then
      return jsonb_build_object(
        'state', case when v_existing.status = 'running' then 'in_progress' else 'cached' end,
        'status', v_existing.status,
        'response', v_existing.response
      );
    end if;
    return jsonb_build_object('state', 'conflict');
  end if;

  select count(*) into v_count
  from public.background_job_tool_calls
  where job_id = p_job_id and attempt_id = p_attempt_id and tool_name = p_tool_name;
  if v_count >= p_max_calls then return jsonb_build_object('state', 'limit'); end if;

  insert into public.background_job_tool_calls (
    job_id, attempt_id, tool_name, tool_call_id, request_hash
  ) values (
    p_job_id, p_attempt_id, p_tool_name, p_tool_call_id, p_request_hash
  );
  return jsonb_build_object('state', 'claimed');
end;
$$;

create or replace function public.background_job_complete_tool_call(
  p_job_id uuid,
  p_attempt_id uuid,
  p_tool_name text,
  p_tool_call_id text,
  p_request_hash text,
  p_response jsonb,
  p_is_error boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  if p_response is null or octet_length(p_response::text) > 131072 then
    raise exception using errcode = '22023', message = 'Invalid cached tool response';
  end if;

  update public.background_job_tool_calls as calls
  set status = case when p_is_error then 'failed' else 'completed' end,
      response = p_response,
      updated_at = now()
  from public.background_jobs as jobs
  where calls.job_id = p_job_id
    and calls.attempt_id = p_attempt_id
    and calls.tool_name = p_tool_name
    and calls.tool_call_id = p_tool_call_id
    and calls.request_hash = p_request_hash
    and calls.status = 'running'
    and jobs.id = calls.job_id
    and jobs.attempt_id = calls.attempt_id
    and jobs.status = 'running'
    and jobs.lease_expires_at > now();

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

create or replace function public.background_job_write_deal_research(
  p_job_id uuid,
  p_attempt_id uuid,
  p_deal_id uuid,
  p_status text,
  p_summary text default null,
  p_findings jsonb default null,
  p_sources jsonb default null,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
  v_terminal_count integer := 0;
begin
  if p_status not in ('running', 'done', 'skipped', 'failed') then
    raise exception using errcode = '22023', message = 'Invalid Deal Research status';
  end if;
  if p_findings is not null and jsonb_typeof(p_findings) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid Deal Research findings';
  end if;
  if p_sources is not null and jsonb_typeof(p_sources) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid Deal Research sources';
  end if;

  update public.inbound_deals as deals
  set research_status = p_status,
      research_summary = case when p_status = 'running' then deals.research_summary else p_summary end,
      research_findings = case when p_status = 'running' then deals.research_findings else p_findings end,
      research_sources = case when p_status = 'running' then deals.research_sources else p_sources end,
      research_error = left(nullif(p_error, ''), 500),
      researched_at = now()
  from public.background_jobs as jobs
  where jobs.id = p_job_id
    and jobs.attempt_id = p_attempt_id
    and jobs.status = 'running'
    and jobs.lease_expires_at > now()
    and jobs.kind = 'deal_research'
    and jobs.fund_id = deals.fund_id
    and jobs.payload->>'dealId' = p_deal_id::text
    and deals.id = p_deal_id
    and exists (
      select 1
      from public.fund_settings as settings
      where settings.fund_id = jobs.fund_id
        and settings.deal_research_enabled is true
    )
    and (
      (jobs.actor_type = 'system' and jobs.actor_user_id is null)
      or (
        jobs.actor_type = 'user'
        and jobs.actor_user_id is not null
        and exists (
          select 1
          from public.fund_members as members
          join public.fund_settings as access_settings
            on access_settings.fund_id = members.fund_id
          left join public.fund_member_access as member_access
            on member_access.fund_id = members.fund_id
           and member_access.user_id = members.user_id
           and member_access.domain = 'dealflow'
          left join public.fund_domain_defaults as domain_defaults
            on domain_defaults.fund_id = members.fund_id
           and domain_defaults.domain = 'dealflow'
          where members.fund_id = jobs.fund_id
            and members.user_id = jobs.actor_user_id
            and coalesce(access_settings.feature_visibility->>'deals', 'admin') not in ('off', 'hidden')
            and coalesce(access_settings.feature_visibility->>'search', 'off') not in ('off', 'hidden')
            and (
              members.role = 'admin'
              or (
                members.role = 'member'
                and coalesce(access_settings.feature_visibility->>'deals', 'admin') = 'everyone'
                and coalesce(access_settings.feature_visibility->>'search', 'off') = 'everyone'
                and coalesce(member_access.level, domain_defaults.level, 'none') = 'write'
              )
            )
        )
      )
    );

  get diagnostics v_updated_count = row_count;
  if v_updated_count > 0 and p_status in ('done', 'skipped') then
    update public.background_jobs
    set status = 'completed',
        last_error = null,
        updated_at = now()
    where id = p_job_id
      and attempt_id = p_attempt_id
      and status = 'running'
      and lease_expires_at > now();
    get diagnostics v_terminal_count = row_count;
    if v_terminal_count <> 1 then
      raise exception using errcode = '40001', message = 'Background terminal receipt could not be recorded';
    end if;
  end if;
  return v_updated_count > 0;
end;
$$;

revoke all on function public.background_job_enqueue(text, jsonb, uuid, text, uuid, text, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.background_job_enqueue(text, jsonb, uuid, text, uuid, text, integer, integer, timestamptz) to service_role;
revoke all on function public.background_job_enqueue_inserted_deal_research() from public, anon, authenticated;
revoke all on function public.background_job_claim_due(text[], integer) from public, anon, authenticated;
grant execute on function public.background_job_claim_due(text[], integer) to service_role;
revoke all on function public.background_job_finalize(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.background_job_finalize(uuid, uuid, text, text, integer) to service_role;
revoke all on function public.background_job_claim_worker_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.background_job_claim_worker_attempt(uuid, uuid) to service_role;
revoke all on function public.background_job_claim_tool_call(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.background_job_claim_tool_call(uuid, uuid, text, text, text, integer) to service_role;
revoke all on function public.background_job_complete_tool_call(uuid, uuid, text, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.background_job_complete_tool_call(uuid, uuid, text, text, text, jsonb, boolean) to service_role;
revoke all on function public.background_job_write_deal_research(uuid, uuid, uuid, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.background_job_write_deal_research(uuid, uuid, uuid, text, text, jsonb, jsonb, text) to service_role;

-- Existing queued Deal Research work had no initiating user. Preserve it explicitly
-- as system work, and let the new dispatcher assign a fresh attempt.
update public.inbound_deals
set research_status = 'pending'
where research_status = 'running';

insert into public.background_jobs (
  kind, payload, fund_id, actor_type, actor_user_id, status, dedupe_key
)
select
  'deal_research',
  jsonb_build_object('dealId', d.id),
  d.fund_id,
  'system',
  null,
  'pending',
  'deal_research:' || d.id::text
from public.inbound_deals d
where d.research_status in ('pending', 'running')
on conflict (kind, dedupe_key) where status in ('pending', 'running') do nothing;
