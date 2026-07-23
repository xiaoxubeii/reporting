alter table public.fund_join_requests
  add column if not exists approval_claim_id uuid,
  add column if not exists approval_claimed_at timestamptz;

create or replace function public.claim_fund_join_request_approval(
  p_request_id uuid,
  p_fund_id uuid,
  p_reviewed_by uuid,
  p_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean := false;
begin
  perform 1 from public.fund_members
  where fund_id = p_fund_id and user_id = p_reviewed_by and role = 'admin'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Approver is not a fund administrator';
  end if;

  update public.fund_join_requests
  set status = 'provisioning',
      reviewed_by = p_reviewed_by,
      approval_claim_id = p_claim_id,
      approval_claimed_at = now()
  where id = p_request_id
    and fund_id = p_fund_id
    and (
      status = 'pending'
      or (status = 'provisioning' and approval_claimed_at < now() - interval '2 minutes')
    )
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function public.release_fund_join_request_approval(
  p_request_id uuid,
  p_claim_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.fund_join_requests
  set status = 'pending',
      reviewed_by = null,
      approval_claim_id = null,
      approval_claimed_at = null
  where id = p_request_id
    and status = 'provisioning'
    and approval_claim_id = p_claim_id;
$$;

drop function if exists public.approve_fund_join_request(uuid, uuid, uuid);

create or replace function public.approve_fund_join_request(
  p_request_id uuid,
  p_fund_id uuid,
  p_reviewed_by uuid,
  p_claim_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  perform 1 from public.fund_members
  where fund_id = p_fund_id and user_id = p_reviewed_by and role = 'admin'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Approver is not a fund administrator';
  end if;

  select user_id into target_user_id
  from public.fund_join_requests
  where id = p_request_id
    and fund_id = p_fund_id
    and status = 'provisioning'
    and approval_claim_id = p_claim_id
  for update;

  if target_user_id is null then
    raise exception using errcode = 'P0002', message = 'Join request approval is not claimed';
  end if;

  insert into public.fund_members (fund_id, user_id, invited_by, role)
  values (p_fund_id, target_user_id, p_reviewed_by, 'member')
  on conflict (fund_id, user_id) do nothing;

  update public.fund_join_requests
  set status = 'approved',
      reviewed_by = p_reviewed_by,
      approval_claim_id = null,
      approval_claimed_at = null
  where id = p_request_id
    and fund_id = p_fund_id
    and status = 'provisioning'
    and approval_claim_id = p_claim_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Join request approval is not claimed';
  end if;
end;
$$;

create or replace function public.reject_fund_join_request(
  p_request_id uuid,
  p_fund_id uuid,
  p_reviewed_by uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  rejected boolean := false;
begin
  perform 1 from public.fund_members
  where fund_id = p_fund_id and user_id = p_reviewed_by and role = 'admin'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Reviewer is not a fund administrator';
  end if;

  update public.fund_join_requests
  set status = 'rejected', reviewed_by = p_reviewed_by
  where id = p_request_id and fund_id = p_fund_id and status = 'pending'
  returning true into rejected;

  return coalesce(rejected, false);
end;
$$;

revoke all on function public.claim_fund_join_request_approval(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_fund_join_request_approval(uuid, uuid) from public, anon, authenticated;
revoke all on function public.approve_fund_join_request(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.reject_fund_join_request(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_fund_join_request_approval(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.release_fund_join_request_approval(uuid, uuid) to service_role;
grant execute on function public.approve_fund_join_request(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.reject_fund_join_request(uuid, uuid, uuid) to service_role;
