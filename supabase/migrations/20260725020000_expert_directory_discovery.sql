-- Two formal expert pools plus a fund-private discovery candidate queue.

begin;

alter table public.experts
  add column verification_type text,
  add column source_type text,
  add column verified_at timestamptz,
  -- Keep an immutable actor identifier even if the auth account is later removed.
  add column verified_by uuid,
  add column provenance_snapshot jsonb not null default '{}'::jsonb;

update public.experts
set verification_type = case when scope = 'global' then 'platform_certified' else 'fund_confirmed' end,
    source_type = case when scope = 'global' then 'platform' else 'manual' end,
    verified_at = coalesce(verified_at, created_at),
    verified_by = case when scope = 'fund' then coalesce(
      verified_by,
      created_by,
      (select funds.created_by from public.funds where funds.id = experts.fund_id)
    ) else verified_by end;

alter table public.experts
  alter column verification_type set not null,
  alter column source_type set not null,
  add constraint experts_verification_type_check
    check (verification_type in ('platform_certified', 'fund_confirmed')),
  add constraint experts_source_type_check
    check (source_type in ('platform', 'manual', 'discovery')),
  add constraint experts_provenance_snapshot_check
    check (jsonb_typeof(provenance_snapshot) = 'object' and octet_length(provenance_snapshot::text) <= 30000),
  add constraint experts_trust_contract_check check (
    (scope = 'global' and verification_type = 'platform_certified' and source_type = 'platform'
      and verified_at is not null)
    or
    (scope = 'fund' and verification_type = 'fund_confirmed' and source_type in ('manual', 'discovery')
      and verified_at is not null and verified_by is not null)
  ),
  add constraint experts_id_fund_unique unique (id, fund_id);

create table public.expert_candidates (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id) on delete cascade,
  identity_fingerprint text not null check (identity_fingerprint ~ '^[0-9a-f]{64}$'),
  discovery_query text not null check (char_length(btrim(discovery_query)) between 1 and 200),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  email text check (email is null or (char_length(email) <= 320 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  title text check (title is null or char_length(title) <= 200),
  organization text check (organization is null or char_length(organization) <= 240),
  profile_text text not null check (char_length(btrim(profile_text)) between 1 and 6000),
  source_evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_evidence) = 'array' and octet_length(source_evidence::text) <= 30000),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  -- Audit actor IDs are intentionally durable UUID snapshots, not deleting-account blockers.
  discovered_by uuid not null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  confirmed_expert_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint expert_candidates_review_state_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null and confirmed_expert_id is null and rejection_reason is null)
    or (status = 'confirmed' and reviewed_by is not null and reviewed_at is not null and confirmed_expert_id is not null and rejection_reason is null)
    or (status = 'rejected' and reviewed_by is not null and reviewed_at is not null and confirmed_expert_id is null)
  ),
  constraint expert_candidates_confirmed_expert_fund_fk
    foreign key (confirmed_expert_id, fund_id)
    references public.experts(id, fund_id) on delete restrict,
  unique (fund_id, identity_fingerprint)
);

create index expert_candidates_fund_status_idx
  on public.expert_candidates (fund_id, status, updated_at desc);

create trigger expert_candidates_set_updated_at
  before update on public.expert_candidates
  for each row execute function public.set_updated_at();

alter table public.expert_candidates enable row level security;
revoke all on table public.expert_candidates from public, anon, authenticated;
grant all on table public.expert_candidates to service_role;

create or replace function public.merge_expert_candidates(
  p_fund_id uuid,
  p_user_id uuid,
  p_query text,
  p_candidates jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if not exists (
    select 1 from public.fund_members members
    where members.fund_id = p_fund_id and members.user_id = p_user_id and members.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'fund admin required';
  end if;
  if jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) > 25 then
    raise exception using errcode = '22023', message = 'invalid expert candidate batch';
  end if;

  for v_person in select value from jsonb_array_elements(p_candidates)
  loop
    insert into public.expert_candidates (
      fund_id, identity_fingerprint, discovery_query, name, email, title, organization,
      profile_text, source_evidence, discovered_by, last_seen_at
    ) values (
      p_fund_id,
      v_person->>'identityFingerprint',
      p_query,
      v_person->>'name',
      nullif(lower(btrim(v_person->>'email')), ''),
      nullif(v_person->>'title', ''),
      nullif(v_person->>'organization', ''),
      v_person->>'profileText',
      coalesce(v_person->'sourceEvidence', '[]'::jsonb),
      p_user_id,
      now()
    )
    on conflict (fund_id, identity_fingerprint) do update
    set discovery_query = case when expert_candidates.status = 'pending' then excluded.discovery_query else expert_candidates.discovery_query end,
        name = case when expert_candidates.status = 'pending' then excluded.name else expert_candidates.name end,
        email = case when expert_candidates.status = 'pending' then coalesce(excluded.email, expert_candidates.email) else expert_candidates.email end,
        title = case when expert_candidates.status = 'pending' then excluded.title else expert_candidates.title end,
        organization = case when expert_candidates.status = 'pending' then excluded.organization else expert_candidates.organization end,
        profile_text = case when expert_candidates.status = 'pending' then excluded.profile_text else expert_candidates.profile_text end,
        source_evidence = (
          select coalesce(jsonb_agg(bounded.item), '[]'::jsonb)
          from (
            select distinct evidence.item
            from jsonb_array_elements(expert_candidates.source_evidence || excluded.source_evidence) evidence(item)
            limit 20
          ) bounded
        ),
        last_seen_at = now(),
        updated_at = now();
  end loop;
end;
$$;

revoke all on function public.merge_expert_candidates(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.merge_expert_candidates(uuid, uuid, text, jsonb)
  to service_role;

alter table public.diligence_expert_requests
  add column expert_verification_type text
    check (expert_verification_type is null or expert_verification_type in ('platform_certified', 'fund_confirmed')),
  add column expert_source_type text
    check (expert_source_type is null or expert_source_type in ('platform', 'manual', 'discovery')),
  add column expert_verified_at timestamptz;

update public.diligence_expert_requests requests
set expert_verification_type = experts.verification_type,
    expert_source_type = experts.source_type,
    expert_verified_at = experts.verified_at
from public.experts experts
where requests.expert_id = experts.id;

alter table public.diligence_expert_requests
  drop constraint diligence_expert_request_selection_check,
  add constraint diligence_expert_request_selection_check check (
    (expert_id is null and selection_method is null and expert_name is null and expert_email is null
      and expert_snapshot is null and expert_verification_type is null and expert_source_type is null and expert_verified_at is null)
    or (expert_id is not null and selection_method is not null and expert_name is not null and expert_email is not null
      and expert_snapshot is not null and expert_verification_type is not null and expert_source_type is not null)
  );

create function public.guard_diligence_expert_eligibility()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_expert public.experts%rowtype;
  v_must_recheck boolean;
begin
  v_must_recheck := tg_op = 'INSERT'
    or new.expert_id is distinct from old.expert_id
    or (old.status = 'draft' and new.status = 'invited');

  if new.expert_id is not null and v_must_recheck then
    select * into v_expert from public.experts where id = new.expert_id;
    if not found or v_expert.status <> 'active' or not (
      (v_expert.scope = 'global' and v_expert.verification_type = 'platform_certified'
        and v_expert.source_type = 'platform' and v_expert.verified_at is not null)
      or (v_expert.scope = 'fund' and v_expert.fund_id = new.fund_id
        and v_expert.verification_type = 'fund_confirmed' and v_expert.verified_at is not null
        and v_expert.verified_by is not null)
    ) then
      raise exception 'selected expert is not eligible';
    end if;
    if new.expert_verification_type is distinct from v_expert.verification_type
      or new.expert_source_type is distinct from v_expert.source_type
      or new.expert_verified_at is distinct from v_expert.verified_at then
      raise exception 'selected expert trust snapshot is invalid';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status in ('invited', 'submitted') and (
    new.expert_verification_type is distinct from old.expert_verification_type
    or new.expert_source_type is distinct from old.expert_source_type
    or new.expert_verified_at is distinct from old.expert_verified_at
  ) then
    raise exception 'invited expert trust snapshot is immutable';
  end if;
  return new;
end;
$$;

create trigger diligence_expert_requests_guard_eligibility
  before insert or update on public.diligence_expert_requests
  for each row execute function public.guard_diligence_expert_eligibility();

create or replace function public.confirm_expert_candidate(
  p_candidate_id uuid,
  p_fund_id uuid,
  p_user_id uuid,
  p_email text,
  p_name text,
  p_title text,
  p_organization text,
  p_profile_text text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_candidate public.expert_candidates%rowtype;
  v_confirmed public.experts%rowtype;
  v_expert_id uuid;
  v_email text := lower(btrim(p_email));
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  if not exists (
    select 1 from public.fund_members members
    where members.fund_id = p_fund_id
      and members.user_id = p_user_id
      and members.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'fund admin required';
  end if;

  select * into v_candidate
  from public.expert_candidates
  where id = p_candidate_id and fund_id = p_fund_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'candidate not found';
  end if;
  if v_candidate.status = 'confirmed' then
    select * into v_confirmed from public.experts where id = v_candidate.confirmed_expert_id;
    if not found or v_confirmed.scope <> 'fund' or v_confirmed.fund_id <> p_fund_id
      or v_confirmed.verification_type <> 'fund_confirmed'
      or v_confirmed.source_type <> 'discovery' or v_confirmed.verified_at is null
      or v_confirmed.verified_by is null then
      raise exception using errcode = '23514', message = 'confirmed candidate expert link is invalid';
    end if;
    return v_candidate.confirmed_expert_id;
  end if;
  if v_candidate.status = 'rejected' then
    raise exception using errcode = '22023', message = 'rejected candidate cannot be confirmed';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(v_email) > 320 then
    raise exception using errcode = '22023', message = 'valid expert email required';
  end if;
  if char_length(btrim(p_name)) not between 1 and 160
    or char_length(btrim(p_profile_text)) not between 1 and 6000 then
    raise exception using errcode = '22023', message = 'invalid expert profile';
  end if;
  if exists (
    select 1 from public.experts
    where scope = 'fund' and fund_id = p_fund_id and lower(email) = v_email
  ) then
    raise exception using errcode = '23505', message = 'expert email already exists in this fund';
  end if;

  insert into public.experts (
    scope, fund_id, name, email, title, organization, profile_text, status,
    created_by, verification_type, source_type, verified_at, verified_by, provenance_snapshot
  ) values (
    'fund', p_fund_id, btrim(p_name), v_email, nullif(btrim(p_title), ''),
    nullif(btrim(p_organization), ''), btrim(p_profile_text), 'active', p_user_id,
    'fund_confirmed', 'discovery', now(), p_user_id,
    jsonb_build_object(
      'candidateId', v_candidate.id,
      'evidence', v_candidate.source_evidence
    )
  ) returning id into v_expert_id;

  update public.expert_candidates
  set status = 'confirmed', reviewed_by = p_user_id, reviewed_at = now(),
      confirmed_expert_id = v_expert_id, email = null,
      discovery_query = '[redacted after confirmation]'
  where id = v_candidate.id;

  return v_expert_id;
end;
$$;

revoke all on function public.confirm_expert_candidate(uuid, uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.confirm_expert_candidate(uuid, uuid, uuid, text, text, text, text, text)
  to service_role;

drop function public.match_experts(uuid, extensions.vector, integer);
create function public.match_experts(
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
  verification_type text,
  source_type text,
  verified_at timestamptz,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select e.id, e.scope, e.name, e.title, e.organization, e.profile_text,
    e.verification_type, e.source_type, e.verified_at,
    1 - (e.embedding <=> p_query_embedding) as similarity
  from public.experts e
  where e.status = 'active'
    and e.verified_at is not null
    and nullif(btrim(e.email), '') is not null
    and e.embedding is not null
    and (
      (e.scope = 'global' and e.verification_type = 'platform_certified' and e.source_type = 'platform')
      or (e.scope = 'fund' and e.fund_id = p_fund_id and e.verification_type = 'fund_confirmed'
        and e.verified_by is not null)
    )
  order by e.embedding <=> p_query_embedding, e.id
  limit least(greatest(coalesce(p_match_count, 5), 1), 5);
$$;

revoke all on function public.match_experts(uuid, extensions.vector, integer) from public, anon, authenticated;
grant execute on function public.match_experts(uuid, extensions.vector, integer) to service_role;

comment on table public.expert_candidates is 'Fund-private expert discovery candidates; not eligible for diligence until confirmed.';

commit;
