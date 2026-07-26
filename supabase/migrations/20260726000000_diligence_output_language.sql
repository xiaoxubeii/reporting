-- One user-facing diligence language, persisted as a mutable deal preference
-- and an immutable-per-generated-draft snapshot. Existing AI artifacts were
-- produced under the former English-only behavior, so the additive defaults
-- accurately describe historical rows without rewriting them.

alter table diligence_deals
  add column output_language text not null default 'en';

alter table diligence_deals
  add constraint diligence_deals_output_language_check
  check (output_language in ('en', 'zh-CN'));

alter table diligence_memo_drafts
  add column output_language text not null default 'en',
  add column source_draft_id uuid references diligence_memo_drafts(id) on delete set null,
  add column checklist_assessment_output jsonb;

alter table diligence_memo_drafts
  add constraint diligence_memo_drafts_output_language_check
  check (output_language in ('en', 'zh-CN')),
  add constraint diligence_memo_drafts_source_not_self_check
  check (source_draft_id is null or source_draft_id <> id);

create index diligence_memo_drafts_source_idx
  on diligence_memo_drafts (source_draft_id)
  where source_draft_id is not null;

-- Empty drafts can adopt a corrected preference before work starts. Once any
-- generated artifact exists (or the draft is finalized), language is immutable
-- and callers must create a linked version instead.
create or replace function enforce_diligence_draft_output_language_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.output_language is distinct from old.output_language
     and (
       old.is_draft = false
       or old.ingestion_output is not null
       or old.research_output is not null
       or old.checklist_assessment_output is not null
       or jsonb_array_length(coalesce(old.qa_answers, '[]'::jsonb)) > 0
       or old.memo_draft_output is not null
     ) then
    raise exception 'Generated diligence draft language is immutable; create a new language version'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger diligence_memo_drafts_output_language_snapshot
before update of output_language on diligence_memo_drafts
for each row execute function enforce_diligence_draft_output_language_snapshot();

-- Every memo-agent enqueue shares the same per-deal transaction lock as a
-- language switch. This closes the check/insert race: either the job commits
-- first and the switch sees it, or the switch commits first and the worker
-- resolves the resulting draft snapshot.
create or replace function lock_diligence_job_enqueue()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.deal_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.deal_id::text, 0));
  end if;
  return new;
end;
$$;

create trigger memo_agent_jobs_diligence_language_lock
before insert on memo_agent_jobs
for each row execute function lock_diligence_job_enqueue();

-- Serialize the user-facing language switch with the active deal. This avoids
-- duplicate versions and prevents a queued/running job from writing into a
-- draft whose language decision changed underneath it.
create or replace function change_diligence_output_language(
  p_deal_id uuid,
  p_fund_id uuid,
  p_output_language text,
  p_user_id uuid,
  p_confirm_version boolean,
  p_expected_draft_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal diligence_deals%rowtype;
  v_draft diligence_memo_drafts%rowtype;
  v_new_draft diligence_memo_drafts%rowtype;
  v_has_artifacts boolean;
begin
  if p_output_language is null or p_output_language not in ('en', 'zh-CN') then
    raise exception 'Unsupported diligence output language' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_deal_id::text, 0));

  select * into v_deal
  from diligence_deals
  where id = p_deal_id and fund_id = p_fund_id
  for update;
  if not found then
    raise exception 'Diligence deal not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from memo_agent_jobs
    where deal_id = p_deal_id
      and fund_id = p_fund_id
      and status in ('pending', 'running')
  ) then
    raise exception 'A diligence generation job is in progress' using errcode = '55006';
  end if;

  select * into v_draft
  from diligence_memo_drafts
  where deal_id = p_deal_id and fund_id = p_fund_id
  order by created_at desc, id desc
  limit 1;

  if v_deal.output_language = p_output_language
     and (v_draft.id is null or v_draft.output_language = p_output_language) then
    return jsonb_build_object(
      'status', 'noop',
      'output_language', p_output_language,
      'draft_id', v_draft.id,
      'source_draft_id', v_draft.source_draft_id
    );
  end if;

  if v_draft.id is null then
    update diligence_deals
    set output_language = p_output_language, updated_at = now()
    where id = p_deal_id and fund_id = p_fund_id;
    return jsonb_build_object(
      'status', 'updated',
      'output_language', p_output_language,
      'draft_id', null,
      'source_draft_id', null
    );
  end if;

  v_has_artifacts :=
    v_draft.is_draft = false
    or v_draft.ingestion_output is not null
    or v_draft.research_output is not null
    or v_draft.checklist_assessment_output is not null
    or jsonb_array_length(coalesce(v_draft.qa_answers, '[]'::jsonb)) > 0
    or v_draft.memo_draft_output is not null;

  -- Confirmation is decided from the locked, authoritative draft, not from a
  -- page-load snapshot. The expected id binds consent to the exact version the
  -- user saw and prevents a later concurrent draft from reusing it.
  if p_confirm_version
     and p_expected_draft_id is distinct from v_draft.id then
    raise exception 'DILIGENCE_LANGUAGE_VERSION_STALE'
      using errcode = '40001', detail = v_draft.id::text;
  end if;

  if v_has_artifacts and not p_confirm_version then
    raise exception 'DILIGENCE_LANGUAGE_CONFIRMATION_REQUIRED'
      using errcode = 'P0001', detail = v_draft.id::text;
  end if;

  if not v_has_artifacts then
    update diligence_deals
    set output_language = p_output_language, updated_at = now()
    where id = p_deal_id and fund_id = p_fund_id;
    update diligence_memo_drafts
    set output_language = p_output_language
    where id = v_draft.id and deal_id = p_deal_id and fund_id = p_fund_id;
    return jsonb_build_object(
      'status', 'updated',
      'output_language', p_output_language,
      'draft_id', v_draft.id,
      'source_draft_id', v_draft.source_draft_id
    );
  end if;

  insert into diligence_memo_drafts (
    deal_id,
    fund_id,
    draft_version,
    agent_version,
    output_language,
    source_draft_id,
    created_by
  ) values (
    p_deal_id,
    p_fund_id,
    'language-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-MS'),
    coalesce(v_draft.agent_version, 'memo-agent v0.1'),
    p_output_language,
    v_draft.id,
    p_user_id
  ) returning * into v_new_draft;

  update diligence_deals
  set output_language = p_output_language,
      current_memo_stage = 'not_started',
      updated_at = now()
  where id = p_deal_id and fund_id = p_fund_id;

  return jsonb_build_object(
    'status', 'version_created',
    'output_language', p_output_language,
    'draft_id', v_new_draft.id,
    'source_draft_id', v_draft.id
  );
end;
$$;

revoke all on function change_diligence_output_language(uuid, uuid, text, uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function change_diligence_output_language(uuid, uuid, text, uuid, boolean, uuid) to service_role;
