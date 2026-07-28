-- Run Memo Agent Stage 2 on the generalized background-attempt runtime while
-- preserving memo_agent_jobs as the UI/status projection.

alter table public.memo_agent_jobs
  add column if not exists background_job_id uuid;

alter table public.memo_agent_jobs
  drop constraint if exists memo_agent_jobs_background_job_id_fkey;
alter table public.memo_agent_jobs
  add constraint memo_agent_jobs_background_job_id_fkey
  foreign key (background_job_id) references public.background_jobs(id) on delete restrict;

create unique index if not exists memo_agent_jobs_background_job_id_idx
  on public.memo_agent_jobs (background_job_id)
  where background_job_id is not null;

create unique index if not exists memo_agent_jobs_one_active_per_deal_idx
  on public.memo_agent_jobs (fund_id, deal_id)
  where status in ('pending', 'running') and background_job_id is not null;

create or replace function public.memo_agent_jobs_validate_background_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Legacy ingest continuations may legitimately have multiple unlinked active
  -- rows. Serialize all activity for this deal, then only reject a mixed state
  -- where generalized Research overlaps any legacy active work.
  perform pg_advisory_xact_lock(hashtextextended(new.deal_id::text, 0));
  if new.status in ('pending', 'running') and exists (
    select 1
    from public.memo_agent_jobs as other
    where other.fund_id = new.fund_id
      and other.deal_id = new.deal_id
      and other.id <> new.id
      and other.status in ('pending', 'running')
      and (new.background_job_id is not null or other.background_job_id is not null)
  ) then
    raise exception using errcode = '23505', message = 'Generalized Memo Research cannot overlap active legacy work';
  end if;
  if tg_op = 'UPDATE' and old.background_job_id is not null and (
    new.background_job_id is distinct from old.background_job_id
    or new.fund_id is distinct from old.fund_id
    or new.deal_id is distinct from old.deal_id
    or new.draft_id is distinct from old.draft_id
    or new.id is distinct from old.id
  )
  then
    raise exception using errcode = '22023', message = 'Memo Research background link is immutable';
  end if;
  if new.background_job_id is not null and not exists (
    select 1
    from public.background_jobs as jobs
    where jobs.id = new.background_job_id
      and jobs.kind = 'memo_research'
      and jobs.fund_id = new.fund_id
      and jobs.payload->>'memoJobId' = new.id::text
      and jobs.payload->>'dealId' = new.deal_id::text
      and jobs.payload->>'draftId' = new.draft_id::text
  ) then
    raise exception using errcode = '22023', message = 'Memo Research background link does not match';
  end if;
  return new;
end;
$$;

drop trigger if exists memo_agent_jobs_validate_background_link on public.memo_agent_jobs;
create trigger memo_agent_jobs_validate_background_link
before insert or update of background_job_id, fund_id, deal_id, draft_id, id, status on public.memo_agent_jobs
for each row execute function public.memo_agent_jobs_validate_background_link();

create or replace function public.memo_research_actor_authorized(
  p_fund_id uuid,
  p_actor_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fund_members as members
    join public.fund_settings as settings
      on settings.fund_id = members.fund_id
    left join public.fund_member_access as diligence_access
      on diligence_access.fund_id = members.fund_id
     and diligence_access.user_id = members.user_id
     and diligence_access.domain = 'diligence'
    left join public.fund_domain_defaults as diligence_default
      on diligence_default.fund_id = members.fund_id
     and diligence_default.domain = 'diligence'
    where members.fund_id = p_fund_id
      and members.user_id = p_actor_user_id
      and coalesce(settings.feature_visibility->>'diligence', 'off') not in ('off', 'hidden')
      and (
        members.role = 'admin'
        or (
          members.role = 'member'
          and coalesce(settings.feature_visibility->>'diligence', 'off') = 'everyone'
          and coalesce(diligence_access.level, diligence_default.level, 'none') = 'write'
        )
      )
  );
$$;

create or replace function public.memo_agent_enqueue_research_background(
  p_fund_id uuid,
  p_deal_id uuid,
  p_draft_id uuid,
  p_actor_user_id uuid
)
returns public.memo_agent_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memo_job public.memo_agent_jobs;
  v_background_job public.background_jobs;
begin
  if p_fund_id is null or p_deal_id is null or p_draft_id is null or p_actor_user_id is null then
    raise exception using errcode = '22023', message = 'Invalid Memo Research enqueue request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_deal_id::text, 0));

  if not public.memo_research_actor_authorized(p_fund_id, p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Memo Research actor is not authorized';
  end if;

  perform 1
  from public.diligence_deals
  where id = p_deal_id
    and fund_id = p_fund_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Diligence deal not found';
  end if;

  perform 1
  from public.diligence_memo_drafts
  where id = p_draft_id
    and deal_id = p_deal_id
    and fund_id = p_fund_id
    and is_draft = true
    and ingestion_output is not null;
  if not found then
    raise exception using errcode = '22023', message = 'Memo Research requires an ingested draft';
  end if;

  if exists (
    select 1
    from public.memo_agent_jobs
    where deal_id = p_deal_id
      and fund_id = p_fund_id
      and status in ('pending', 'running')
  ) then
    raise exception using errcode = '23505', message = 'A Memo Agent job is already active';
  end if;

  insert into public.memo_agent_jobs (
    fund_id, deal_id, draft_id, kind, status, payload, enqueued_by,
    progress_message
  ) values (
    p_fund_id, p_deal_id, p_draft_id, 'research', 'pending', '{}'::jsonb,
    p_actor_user_id, 'Queued for external research'
  )
  returning * into v_memo_job;

  insert into public.background_jobs (
    kind, payload, fund_id, actor_type, actor_user_id, status, dedupe_key,
    max_attempts, lease_seconds, available_at
  ) values (
    'memo_research',
    jsonb_build_object(
      'memoJobId', v_memo_job.id,
      'dealId', p_deal_id,
      'draftId', p_draft_id
    ),
    p_fund_id,
    'user',
    p_actor_user_id,
    'pending',
    'memo_research:' || v_memo_job.id::text,
    3,
    300,
    now()
  )
  returning * into v_background_job;

  update public.memo_agent_jobs
  set background_job_id = v_background_job.id
  where id = v_memo_job.id
  returning * into v_memo_job;

  update public.diligence_deals
  set current_memo_stage = 'research'
  where id = p_deal_id
    and fund_id = p_fund_id;

  return v_memo_job;
end;
$$;

create or replace function public.memo_research_update_progress(
  p_job_id uuid,
  p_attempt_id uuid,
  p_memo_job_id uuid,
  p_message text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_count integer := 0;
begin
  if p_message is null or char_length(p_message) < 1 then
    raise exception using errcode = '22023', message = 'Invalid Memo Research progress';
  end if;

  update public.memo_agent_jobs as memo
  set status = 'running',
      started_at = coalesce(memo.started_at, now()),
      attempts = greatest(memo.attempts, jobs.attempts),
      progress_message = left(p_message, 1000),
      error = null,
      lock_version = memo.lock_version + 1
  from public.background_jobs as jobs
  where jobs.id = p_job_id
    and jobs.attempt_id = p_attempt_id
    and jobs.status = 'running'
    and jobs.lease_expires_at > now()
    and jobs.worker_claimed_attempt_id = p_attempt_id
    and jobs.actor_type = 'user'
    and jobs.actor_user_id is not null
    and public.memo_research_actor_authorized(jobs.fund_id, jobs.actor_user_id)
    and jobs.kind = 'memo_research'
    and jobs.payload->>'memoJobId' = p_memo_job_id::text
    and memo.id = p_memo_job_id
    and memo.background_job_id = jobs.id
    and memo.fund_id = jobs.fund_id
    and memo.deal_id::text = jobs.payload->>'dealId'
    and memo.draft_id::text = jobs.payload->>'draftId'
    and memo.status in ('pending', 'running');

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

create or replace function public.memo_research_write_result(
  p_job_id uuid,
  p_attempt_id uuid,
  p_memo_job_id uuid,
  p_research_output jsonb,
  p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_count integer := 0;
begin
  if p_research_output is null or jsonb_typeof(p_research_output) <> 'object'
    or p_result is null or jsonb_typeof(p_result) <> 'object'
  then
    raise exception using errcode = '22023', message = 'Invalid Memo Research result';
  end if;

  perform 1
  from public.background_jobs as jobs
  join public.memo_agent_jobs as memo
    on memo.id = p_memo_job_id
   and memo.background_job_id = jobs.id
   and memo.fund_id = jobs.fund_id
  where jobs.id = p_job_id
    and jobs.attempt_id = p_attempt_id
    and jobs.status = 'running'
    and jobs.lease_expires_at > now()
    and jobs.worker_claimed_attempt_id = p_attempt_id
    and jobs.actor_type = 'user'
    and jobs.actor_user_id is not null
    and public.memo_research_actor_authorized(jobs.fund_id, jobs.actor_user_id)
    and jobs.kind = 'memo_research'
    and jobs.payload->>'memoJobId' = p_memo_job_id::text
    and memo.deal_id::text = jobs.payload->>'dealId'
    and memo.draft_id::text = jobs.payload->>'draftId'
    and memo.status in ('pending', 'running')
  for update of jobs, memo;
  if not found then return false; end if;

  update public.diligence_memo_drafts
  set research_output = p_research_output
  where id = (select draft_id from public.memo_agent_jobs where id = p_memo_job_id)
    and deal_id = (select deal_id from public.memo_agent_jobs where id = p_memo_job_id)
    and fund_id = (select fund_id from public.memo_agent_jobs where id = p_memo_job_id)
    and is_draft = true;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception using errcode = '40001', message = 'Memo Research draft receipt could not be recorded';
  end if;

  update public.memo_agent_jobs as memo
  set status = 'success',
      result = p_result,
      error = null,
      progress_message = 'Research complete',
      finished_at = now(),
      lock_version = memo.lock_version + 1
  where memo.id = p_memo_job_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception using errcode = '40001', message = 'Memo Research projection receipt could not be recorded';
  end if;

  update public.background_jobs
  set status = 'completed',
      last_error = null,
      updated_at = now()
  where id = p_job_id
    and attempt_id = p_attempt_id
    and status = 'running'
    and lease_expires_at > now();

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception using errcode = '40001', message = 'Memo Research terminal receipt could not be recorded';
  end if;

  update public.diligence_deals
  set current_memo_stage = 'qa'
  where id = (select deal_id from public.memo_agent_jobs where id = p_memo_job_id)
    and fund_id = (select fund_id from public.memo_agent_jobs where id = p_memo_job_id)
    and current_memo_stage = 'research';
  return v_updated_count > 0;
end;
$$;

create or replace function public.background_job_project_memo_research_failure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'memo_research'
    and new.status in ('failed', 'cancelled')
    and old.status is distinct from new.status
  then
    update public.memo_agent_jobs
    set status = case when new.status = 'cancelled' then 'cancelled' else 'failed' end,
        error = left(coalesce(nullif(new.last_error, ''), 'External research failed'), 2000),
        progress_message = case when new.status = 'cancelled' then 'Research cancelled' else 'Research failed' end,
        finished_at = now(),
        lock_version = lock_version + 1
    where background_job_id = new.id
      and fund_id = new.fund_id
      and id::text = new.payload->>'memoJobId'
      and status in ('pending', 'running');
  end if;
  return new;
end;
$$;

drop trigger if exists background_job_project_memo_research_failure
  on public.background_jobs;
create trigger background_job_project_memo_research_failure
after update of status on public.background_jobs
for each row execute function public.background_job_project_memo_research_failure();

-- Only safe pending rows with an attributable user and an ingested draft are
-- delegated. Other legacy rows remain claimable by the old worker.
with delegated as (
  insert into public.background_jobs (
    kind, payload, fund_id, actor_type, actor_user_id, status, dedupe_key,
    max_attempts, lease_seconds, available_at
  )
  select
    'memo_research',
    jsonb_build_object('memoJobId', memo.id, 'dealId', memo.deal_id, 'draftId', memo.draft_id),
    memo.fund_id,
    'user',
    memo.enqueued_by,
    'pending',
    'memo_research:' || memo.id::text,
    3,
    300,
    memo.enqueued_at
  from public.memo_agent_jobs as memo
  join public.diligence_memo_drafts as draft
    on draft.id = memo.draft_id
   and draft.deal_id = memo.deal_id
   and draft.fund_id = memo.fund_id
   and draft.is_draft = true
   and draft.ingestion_output is not null
  join public.fund_members as member
    on member.fund_id = memo.fund_id
   and member.user_id = memo.enqueued_by
  where memo.kind = 'research'
    and memo.status = 'pending'
    and memo.background_job_id is null
    and memo.enqueued_by is not null
    and public.memo_research_actor_authorized(memo.fund_id, memo.enqueued_by)
  returning id, payload
)
update public.memo_agent_jobs as memo
set background_job_id = delegated.id,
    progress_message = 'Queued for external research'
from delegated
where memo.id::text = delegated.payload->>'memoJobId'
  and memo.background_job_id is null;

update public.memo_agent_jobs
set status = 'failed',
    error = 'Migration could not establish an authorized background Research attempt',
    progress_message = 'Research must be re-run',
    finished_at = now(),
    lock_version = lock_version + 1
where kind = 'research'
  and status = 'pending'
  and background_job_id is null;

create or replace function public.memo_agent_claim_next_job()
returns public.memo_agent_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.memo_agent_jobs%rowtype;
begin
  update public.memo_agent_jobs
  set status = 'running',
      started_at = now(),
      attempts = attempts + 1,
      lock_version = lock_version + 1
  where id = (
    select id
    from public.memo_agent_jobs
    where status = 'pending'
      and background_job_id is null
    order by enqueued_at
    for update skip locked
    limit 1
  )
  returning * into claimed;
  return claimed;
end;
$$;

revoke all on function public.memo_agent_enqueue_research_background(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.memo_agent_enqueue_research_background(uuid, uuid, uuid, uuid)
  to service_role;
revoke all on function public.memo_research_update_progress(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.memo_research_update_progress(uuid, uuid, uuid, text)
  to service_role;
revoke all on function public.memo_research_write_result(uuid, uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.memo_research_write_result(uuid, uuid, uuid, jsonb, jsonb)
  to service_role;
revoke all on function public.memo_agent_jobs_validate_background_link()
  from public, anon, authenticated;
revoke all on function public.memo_research_actor_authorized(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.background_job_project_memo_research_failure()
  from public, anon, authenticated;
revoke all on function public.memo_agent_claim_next_job()
  from public, anon, authenticated;
grant execute on function public.memo_agent_claim_next_job() to service_role;

drop policy if exists memo_agent_jobs_insert on public.memo_agent_jobs;
drop policy if exists memo_agent_jobs_update on public.memo_agent_jobs;
revoke insert, update, delete on public.memo_agent_jobs from anon, authenticated;
