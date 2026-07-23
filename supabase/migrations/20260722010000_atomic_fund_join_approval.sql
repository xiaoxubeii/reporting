create or replace function public.approve_fund_join_request(
  p_request_id uuid,
  p_fund_id uuid,
  p_reviewed_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  if not exists (
    select 1
    from public.fund_members
    where fund_id = p_fund_id
      and user_id = p_reviewed_by
      and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Approver is not a fund administrator';
  end if;

  select user_id
    into target_user_id
  from public.fund_join_requests
  where id = p_request_id
    and fund_id = p_fund_id
    and status = 'pending'
  for update;

  if target_user_id is null then
    raise exception using errcode = 'P0002', message = 'Join request is not pending';
  end if;

  insert into public.fund_members (fund_id, user_id, invited_by, role)
  values (p_fund_id, target_user_id, p_reviewed_by, 'member')
  on conflict (fund_id, user_id) do nothing;

  update public.fund_join_requests
  set status = 'approved', reviewed_by = p_reviewed_by
  where id = p_request_id
    and fund_id = p_fund_id
    and status = 'pending';

  if not found then
    raise exception using errcode = 'P0002', message = 'Join request is not pending';
  end if;
end;
$$;

revoke all on function public.approve_fund_join_request(uuid, uuid, uuid) from public;
revoke all on function public.approve_fund_join_request(uuid, uuid, uuid) from anon;
revoke all on function public.approve_fund_join_request(uuid, uuid, uuid) from authenticated;
grant execute on function public.approve_fund_join_request(uuid, uuid, uuid) to service_role;
