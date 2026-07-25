-- Upgrade an already-applied V1 queue to the code-registry dispatcher contract.
-- The guards also make this safe after a fresh 20260725000000 installation.

alter table public.background_jobs
  add column if not exists lease_seconds integer not null default 300
  check (lease_seconds between 30 and 1800);

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

drop function if exists public.background_job_enqueue(
  text, jsonb, uuid, text, uuid, text, integer, timestamptz
);

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

drop function if exists public.background_job_claim_due(text, integer, integer);

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

drop trigger if exists background_job_project_deal_research_failure
  on public.background_jobs;
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
  if p_limit < 1 or p_limit > 20
    or coalesce(array_length(p_kinds, 1), 0) < 1
    or array_length(p_kinds, 1) > 100
  then
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

-- Reinstall the generic finalizer without domain-specific projections. Domain
-- state is synchronized by the trigger above.
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

revoke all on function public.background_job_enqueue(
  text, jsonb, uuid, text, uuid, text, integer, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.background_job_enqueue(
  text, jsonb, uuid, text, uuid, text, integer, integer, timestamptz
) to service_role;
revoke all on function public.background_job_enqueue_inserted_deal_research()
  from public, anon, authenticated;
revoke all on function public.background_job_claim_due(text[], integer)
  from public, anon, authenticated;
grant execute on function public.background_job_claim_due(text[], integer) to service_role;
revoke all on function public.background_job_finalize(uuid, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.background_job_finalize(uuid, uuid, text, text, integer)
  to service_role;
