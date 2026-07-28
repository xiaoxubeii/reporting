-- Keep final investment decisions and memo finalization trustworthy even when
-- callers bypass the Next.js API and address PostgREST directly.

-- Memo artifacts are generated/finalized by server-owned jobs and routes.
-- Authenticated Fund members retain read access but cannot forge a finalized
-- memo through a direct table write. Service-role background stages continue
-- to own the full memo lifecycle.
drop policy if exists diligence_memo_drafts_all on public.diligence_memo_drafts;
drop policy if exists diligence_memo_drafts_select on public.diligence_memo_drafts;

create policy diligence_memo_drafts_select
  on public.diligence_memo_drafts
  for select
  using (fund_id = any(public.get_my_fund_ids()));

revoke insert, update, delete on table public.diligence_memo_drafts
  from public, anon, authenticated;
grant select on table public.diligence_memo_drafts to authenticated;
grant select, insert, update, delete on table public.diligence_memo_drafts to service_role;

-- Fund members may still read Deal records. Direct writes are limited to Fund
-- admins; application routes and workers use the service role and perform their
-- own actor checks.
drop policy if exists diligence_deals_insert on public.diligence_deals;
drop policy if exists diligence_deals_update on public.diligence_deals;
drop policy if exists diligence_deals_delete on public.diligence_deals;
drop policy if exists diligence_deals_insert_admin on public.diligence_deals;
drop policy if exists diligence_deals_update_admin on public.diligence_deals;
drop policy if exists diligence_deals_delete_admin on public.diligence_deals;

create policy diligence_deals_insert_admin
  on public.diligence_deals
  for insert
  with check (public.is_fund_admin(fund_id));

create policy diligence_deals_update_admin
  on public.diligence_deals
  for update
  using (public.is_fund_admin(fund_id))
  with check (public.is_fund_admin(fund_id));

create policy diligence_deals_delete_admin
  on public.diligence_deals
  for delete
  using (public.is_fund_admin(fund_id));

grant select, insert, update, delete on table public.diligence_deals to authenticated;
grant select, insert, update, delete on table public.diligence_deals to service_role;

-- A transition into or out of a final decision is guarded below. The trigger
-- handles direct authenticated admin writes. Service-role writes must arrive
-- through set_diligence_deal_status, which binds the initiating user to a
-- transaction-local context before executing the update.
create or replace function public.enforce_diligence_final_decision_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_user_id uuid;
  v_old_status text;
  v_old_is_final boolean;
  v_new_is_final boolean;
  v_finalized_memo_id uuid;
begin
  v_old_status := case when tg_op = 'UPDATE' then old.deal_status else null end;
  v_old_is_final := coalesce(v_old_status in ('invested', 'passed', 'won', 'lost'), false);
  v_new_is_final := new.deal_status in ('invested', 'passed', 'won', 'lost');

  if not v_old_is_final and not v_new_is_final then
    return new;
  end if;

  v_actor_user_id := auth.uid();
  if auth.role() = 'service_role' then
    begin
      v_actor_user_id := nullif(
        pg_catalog.current_setting('app.diligence_decision_actor', true),
        ''
      )::uuid;
    exception when invalid_text_representation then
      v_actor_user_id := null;
    end;
  end if;

  if v_actor_user_id is null or not exists (
    select 1
    from public.fund_members as members
    where members.fund_id = new.fund_id
      and members.user_id = v_actor_user_id
      and members.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if v_new_is_final then
    select drafts.id
    into v_finalized_memo_id
    from public.diligence_memo_drafts as drafts
    where drafts.deal_id = new.id
      and drafts.fund_id = new.fund_id
      and drafts.is_draft = false
      and drafts.finalized_at is not null
      and drafts.finalized_by is not null
    order by drafts.finalized_at desc
    limit 1
    for share;

    if v_finalized_memo_id is null then
      raise exception using errcode = '23514', message = 'finalized_memo_required';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_diligence_final_decision_integrity()
  from public, anon, authenticated;

drop trigger if exists diligence_final_decision_integrity on public.diligence_deals;
create trigger diligence_final_decision_integrity
before insert or update of deal_status on public.diligence_deals
for each row execute function public.enforce_diligence_final_decision_integrity();

-- Serialize each status change with the target Deal row. The RPC rechecks the
-- initiating user's live Fund membership and role in the same transaction as
-- the status update; the trigger independently enforces final-state integrity.
create or replace function public.set_diligence_deal_status(
  p_deal_id uuid,
  p_fund_id uuid,
  p_actor_user_id uuid,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deal public.diligence_deals%rowtype;
  v_actor_role text;
  v_old_is_final boolean;
  v_new_is_final boolean;
  v_finalized_memo_id uuid;
begin
  if p_status is null or p_status not in ('invested', 'active', 'passed', 'won', 'lost', 'on_hold') then
    raise exception using errcode = '22023', message = 'invalid_deal_status';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('diligence-status:' || p_deal_id::text, 0)
  );

  select deals.*
  into v_deal
  from public.diligence_deals as deals
  where deals.id = p_deal_id
    and deals.fund_id = p_fund_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'diligence_deal_not_found';
  end if;

  select members.role
  into v_actor_role
  from public.fund_members as members
  where members.fund_id = p_fund_id
    and members.user_id = p_actor_user_id;

  if v_actor_role is null then
    raise exception using errcode = '42501', message = 'fund_membership_required';
  end if;

  v_old_is_final := v_deal.deal_status in ('invested', 'passed', 'won', 'lost');
  v_new_is_final := p_status in ('invested', 'passed', 'won', 'lost');

  if (v_old_is_final or v_new_is_final) and v_actor_role <> 'admin' then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if v_new_is_final then
    select drafts.id
    into v_finalized_memo_id
    from public.diligence_memo_drafts as drafts
    where drafts.deal_id = p_deal_id
      and drafts.fund_id = p_fund_id
      and drafts.is_draft = false
      and drafts.finalized_at is not null
      and drafts.finalized_by is not null
    order by drafts.finalized_at desc
    limit 1
    for share;

    if v_finalized_memo_id is null then
      raise exception using errcode = '23514', message = 'finalized_memo_required';
    end if;
  end if;

  perform pg_catalog.set_config(
    'app.diligence_decision_actor',
    p_actor_user_id::text,
    true
  );

  update public.diligence_deals as deals
  set deal_status = p_status
  where deals.id = p_deal_id
    and deals.fund_id = p_fund_id;

  return p_deal_id;
end;
$$;

revoke all on function public.set_diligence_deal_status(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_diligence_deal_status(uuid, uuid, uuid, text)
  to service_role;
